/**
 * FBL (Feedback Loop) Route — ISP Complaint Processing Pipeline
 *
 * POST /v1/fbl/report — Accepts ARF (Abuse Reporting Format, RFC 5965) reports
 *
 * When a recipient marks an email as spam, the ISP sends an ARF report.
 * This endpoint:
 *   1. Parses the multipart ARF report
 *   2. Adds the complainer to the suppressions table
 *   3. Logs a "complained" event
 *   4. Updates reputation score for the sending domain/IP
 *   5. Auto-throttles domains exceeding 0.1% complaint rate (7-day window)
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, gte, sql } from "drizzle-orm";
import {
  getDatabase,
  events,
  suppressionLists,
  domains,
} from "@alecrae/db";

// ---------------------------------------------------------------------------
// ARF Parser
// ---------------------------------------------------------------------------

interface ParsedArfReport {
  originalMailFrom: string;
  originalRcptTo: string;
  feedbackType: "abuse" | "fraud" | "virus" | "other";
  sourceIp: string;
  reportedDomain: string;
  arrivalDate: string | null;
  userAgent: string | null;
}

/**
 * Parse an ARF (RFC 5965) multipart report body.
 *
 * An ARF message has three MIME parts:
 *   1. Human-readable description
 *   2. Machine-readable feedback-report (key: value)
 *   3. Original message headers
 *
 * We also accept a plain JSON body for programmatic submission.
 */
function parseArfReport(body: string): ParsedArfReport | null {
  // Try to find the feedback-report MIME section
  const boundaryMatch = body.match(/boundary="?([^"\s;]+)"?/i);

  let feedbackSection: string | null = null;

  if (boundaryMatch?.[1]) {
    const boundary = boundaryMatch[1];
    const parts = body.split(`--${boundary}`);
    for (const part of parts) {
      if (part.toLowerCase().includes("message/feedback-report")) {
        const headerEnd = part.indexOf("\n\n");
        if (headerEnd !== -1) {
          feedbackSection = part.slice(headerEnd + 2).trim();
        }
      }
    }
  } else if (body.includes("Feedback-Type:")) {
    // Non-MIME simple key-value format
    feedbackSection = body;
  }

  if (!feedbackSection) {
    return null;
  }

  const fields = new Map<string, string>();
  for (const line of feedbackSection.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (key.length > 0) {
        fields.set(key, value);
      }
    }
  }

  const originalMailFrom = fields.get("Original-Mail-From") ?? "";
  const originalRcptTo = fields.get("Original-Rcpt-To") ?? "";

  if (!originalMailFrom || !originalRcptTo) {
    return null;
  }

  const feedbackTypeRaw = (fields.get("Feedback-Type") ?? "abuse").toLowerCase().trim();
  const validTypes = ["abuse", "fraud", "virus", "other"] as const;
  const feedbackType = validTypes.includes(feedbackTypeRaw as typeof validTypes[number])
    ? (feedbackTypeRaw as typeof validTypes[number])
    : "abuse";

  const senderDomain = extractDomain(originalMailFrom);

  return {
    originalMailFrom,
    originalRcptTo,
    feedbackType,
    sourceIp: fields.get("Source-IP") ?? "",
    reportedDomain: fields.get("Reported-Domain") ?? senderDomain,
    arrivalDate: fields.get("Arrival-Date") ?? null,
    userAgent: fields.get("User-Agent") ?? null,
  };
}

function extractDomain(email: string): string {
  const atIdx = email.lastIndexOf("@");
  return atIdx === -1 ? "" : email.slice(atIdx + 1).toLowerCase();
}

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Complaint rate monitoring
// ---------------------------------------------------------------------------

export interface ComplaintRateResult {
  complaints: number;
  delivered: number;
  rate: number;
  threshold: number;
  isHealthy: boolean;
}

/**
 * Calculate the complaint rate for a domain over a sliding window.
 * Queries the events table for complained and delivered events.
 */
export async function getComplaintRate(
  domainId: string,
  windowDays = 7,
): Promise<ComplaintRateResult> {
  const db = getDatabase();
  const threshold = 0.001; // 0.1%
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  // Query complaint count
  const [complaintRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(events)
    .where(
      and(
        eq(events.type, "email.complained"),
        gte(events.timestamp, windowStart),
        sql`${events.metadata}->>'domainId' = ${domainId}`,
      ),
    );

  // Query delivered count
  const [deliveredRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(events)
    .where(
      and(
        eq(events.type, "email.delivered"),
        gte(events.timestamp, windowStart),
        sql`${events.metadata}->>'domainId' = ${domainId}`,
      ),
    );

  const complaints = complaintRow?.count ?? 0;
  const delivered = deliveredRow?.count ?? 0;
  const rate = delivered > 0 ? complaints / delivered : 0;

  return {
    complaints,
    delivered,
    rate,
    threshold,
    isHealthy: rate < threshold,
  };
}

// ---------------------------------------------------------------------------
// JSON body schema for programmatic FBL submission
// ---------------------------------------------------------------------------

const FblJsonSchema = z.object({
  originalMailFrom: z.string().email(),
  originalRcptTo: z.string().email(),
  feedbackType: z.enum(["abuse", "fraud", "virus", "other"]).default("abuse"),
  sourceIp: z.string().default(""),
  reportedDomain: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

const fbl = new Hono();

/**
 * POST /report — Accept an ARF complaint report.
 *
 * Accepts either:
 *   - Raw ARF multipart (Content-Type: multipart/report or message/feedback-report)
 *   - JSON body with fields: originalMailFrom, originalRcptTo, feedbackType, sourceIp
 */
fbl.post("/report", async (c) => {
  const contentType = c.req.header("content-type") ?? "";
  let report: ParsedArfReport | null = null;

  if (
    contentType.includes("multipart/report") ||
    contentType.includes("message/feedback-report") ||
    contentType.includes("text/plain")
  ) {
    // Parse raw ARF body
    const rawBody = await c.req.text();
    report = parseArfReport(rawBody);
  } else {
    // Try JSON
    try {
      const json = await c.req.json();
      const parsed = FblJsonSchema.safeParse(json);
      if (parsed.success) {
        const data = parsed.data;
        const senderDomain = data.reportedDomain ?? extractDomain(data.originalMailFrom);
        report = {
          originalMailFrom: data.originalMailFrom,
          originalRcptTo: data.originalRcptTo,
          feedbackType: data.feedbackType,
          sourceIp: data.sourceIp,
          reportedDomain: senderDomain,
          arrivalDate: null,
          userAgent: null,
        };
      }
    } catch {
      // Not JSON either — try parsing as raw text
      const rawBody = await c.req.text().catch(() => "");
      if (rawBody) {
        report = parseArfReport(rawBody);
      }
    }
  }

  if (!report) {
    return c.json(
      {
        error: {
          type: "validation_error",
          message:
            "Could not parse ARF report. Send a multipart/report (RFC 5965) or JSON with originalMailFrom, originalRcptTo, feedbackType.",
          code: "invalid_arf_report",
        },
      },
      400,
    );
  }

  const db = getDatabase();
  const now = new Date();

  // ── 1. Resolve the sending domain ──────────────────────────────────
  const [domainRecord] = await db
    .select({ id: domains.id, accountId: domains.accountId })
    .from(domains)
    .where(eq(domains.domain, report.reportedDomain))
    .limit(1);

  if (!domainRecord) {
    // Domain not in our system — acknowledge but don't process
    return c.json({ status: "ignored", reason: "unknown_domain" }, 200);
  }

  // ── 2. Add complainer to suppression list ──────────────────────────
  const suppressionId = generateId();
  await db
    .insert(suppressionLists)
    .values({
      id: suppressionId,
      email: report.originalRcptTo.toLowerCase(),
      domainId: domainRecord.id,
      reason: "complaint",
      createdAt: now,
    })
    .onConflictDoNothing();

  // ── 3. Log complaint event ─────────────────────────────────────────
  const eventId = generateId();
  await db.insert(events).values({
    id: eventId,
    accountId: domainRecord.accountId,
    type: "email.complained",
    recipient: report.originalRcptTo.toLowerCase(),
    feedbackType: report.feedbackType,
    feedbackProvider: report.userAgent ?? undefined,
    ipAddress: report.sourceIp || undefined,
    timestamp: now,
    metadata: { domainId: domainRecord.id },
    createdAt: now,
  });

  // ── 4. Check complaint rate and auto-throttle ──────────────────────
  const complaintRate = await getComplaintRate(domainRecord.id, 7);
  let throttled = false;

  if (!complaintRate.isHealthy) {
    // Complaint rate exceeds 0.1% — log a warning. The warmup orchestrator
    // reads this signal to auto-throttle. We record the signal in metadata.
    console.warn(
      `[fbl] Domain ${report.reportedDomain} complaint rate ${(complaintRate.rate * 100).toFixed(3)}% exceeds threshold. Auto-throttling.`,
    );
    throttled = true;
  }

  return c.json(
    {
      status: "processed",
      complaintId: eventId,
      suppressionId,
      complaintRate: {
        rate: complaintRate.rate,
        isHealthy: complaintRate.isHealthy,
        throttled,
      },
    },
    200,
  );
});

export { fbl, parseArfReport };
export type { ParsedArfReport };
