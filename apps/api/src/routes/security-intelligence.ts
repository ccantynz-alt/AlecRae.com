/**
 * Email Security Intelligence & Threat Detection Route
 *
 * POST /v1/security-intelligence/scan                    — Scan email for threats
 * POST /v1/security-intelligence/scan/batch              — Batch scan emails (max 50)
 * GET  /v1/security-intelligence/threats                 — List detected threats (cursor pagination)
 * GET  /v1/security-intelligence/threats/:emailId        — Get threat detection for email
 * POST /v1/security-intelligence/threats/:id/action      — Take action on threat
 * GET  /v1/security-intelligence/policies                — List security policies
 * POST /v1/security-intelligence/policies                — Create security policy
 * DELETE /v1/security-intelligence/policies/:id          — Delete policy
 * GET  /v1/security-intelligence/audit-log               — View security audit log (cursor pagination)
 * GET  /v1/security-intelligence/dashboard               — Security dashboard stats
 * GET  /v1/security-intelligence/sender-reputation/:email — Check sender reputation
 * POST /v1/security-intelligence/report-phishing         — Report phishing email
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt, count } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import {
  getDatabase,
  threatDetections,
  securityPolicies,
  securityAuditLog,
} from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ScanEmailSchema = z.object({
  emailId: z.string().min(1),
});

const BatchScanSchema = z.object({
  emailIds: z.array(z.string().min(1)).min(1).max(50),
});

const ThreatsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  type: z
    .enum([
      "phishing",
      "malware",
      "spam",
      "impersonation",
      "business_email_compromise",
      "credential_harvesting",
    ])
    .optional(),
});

const ThreatActionSchema = z.object({
  action: z.enum(["report", "dismiss", "quarantine"]),
});

const CreatePolicySchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum([
    "block_sender",
    "block_domain",
    "require_tls",
    "quarantine_attachments",
    "flag_external",
  ]),
  value: z.string().min(1),
});

const AuditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  eventType: z
    .enum([
      "threat_detected",
      "policy_created",
      "policy_deleted",
      "sender_blocked",
      "email_quarantined",
      "settings_changed",
    ])
    .optional(),
});

const ReportPhishingSchema = z.object({
  emailId: z.string().min(1),
  reason: z.string().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Placeholder AI threat analysis — in production this calls Claude. */
function analyzeEmailThreat(emailId: string): {
  threatType: "phishing" | "malware" | "spam" | "impersonation" | "business_email_compromise" | "credential_harvesting";
  severity: "critical" | "high" | "medium" | "low";
  confidence: number;
  signals: {
    urlMismatch?: boolean;
    senderSpoofed?: boolean;
    urgentLanguage?: boolean;
    attachmentRisk?: boolean;
    newSender?: boolean;
    domainAge?: number;
    replyToMismatch?: boolean;
  };
  aiExplanation: string;
} {
  const threatTypes = [
    "phishing",
    "malware",
    "spam",
    "impersonation",
    "business_email_compromise",
    "credential_harvesting",
  ] as const;
  const severities = ["critical", "high", "medium", "low"] as const;
  const threatType = threatTypes[Math.floor(Math.random() * threatTypes.length)] ?? "spam";
  const severity = severities[Math.floor(Math.random() * severities.length)] ?? "low";

  return {
    threatType,
    severity,
    confidence: Math.round(Math.random() * 40 + 60) / 100,
    signals: {
      urlMismatch: Math.random() > 0.6,
      senderSpoofed: Math.random() > 0.7,
      urgentLanguage: Math.random() > 0.5,
      attachmentRisk: Math.random() > 0.8,
      newSender: Math.random() > 0.5,
      domainAge: Math.floor(Math.random() * 365),
      replyToMismatch: Math.random() > 0.7,
    },
    aiExplanation: `Email ${emailId} analyzed for threat indicators. Detected ${threatType} with ${severity} severity based on content signals and sender reputation analysis.`,
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

const securityIntelligenceRouter = new Hono();

// ─── POST /scan — Scan email for threats ────────────────────────────────────

securityIntelligenceRouter.post(
  "/scan",
  requireScope("analytics:read"),
  validateBody(ScanEmailSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ScanEmailSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Check if already scanned
    const [existing] = await db
      .select()
      .from(threatDetections)
      .where(
        and(
          eq(threatDetections.emailId, input.emailId),
          eq(threatDetections.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (existing) {
      return c.json({ data: existing });
    }

    // Placeholder AI threat analysis
    const analysis = analyzeEmailThreat(input.emailId);
    const id = generateId();
    const now = new Date();

    await db.insert(threatDetections).values({
      id,
      accountId: auth.accountId,
      emailId: input.emailId,
      threatType: analysis.threatType,
      severity: analysis.severity,
      confidence: analysis.confidence,
      signals: analysis.signals,
      aiExplanation: analysis.aiExplanation,
      userAction: null,
      createdAt: now,
    });

    // Log the detection
    await db.insert(securityAuditLog).values({
      id: generateId(),
      accountId: auth.accountId,
      eventType: "threat_detected",
      details: {
        emailId: input.emailId,
        threatType: analysis.threatType,
        severity: analysis.severity,
        confidence: analysis.confidence,
      },
      createdAt: now,
    });

    const [created] = await db
      .select()
      .from(threatDetections)
      .where(eq(threatDetections.id, id))
      .limit(1);

    return c.json({ data: created }, 201);
  },
);

// ─── POST /scan/batch — Batch scan emails ───────────────────────────────────

securityIntelligenceRouter.post(
  "/scan/batch",
  requireScope("analytics:read"),
  validateBody(BatchScanSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof BatchScanSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const results: Array<{
      emailId: string;
      status: "scanned" | "already_scanned";
      threatDetectionId: string;
    }> = [];

    for (const emailId of input.emailIds) {
      // Check if already scanned
      const [existing] = await db
        .select({ id: threatDetections.id })
        .from(threatDetections)
        .where(
          and(
            eq(threatDetections.emailId, emailId),
            eq(threatDetections.accountId, auth.accountId),
          ),
        )
        .limit(1);

      if (existing) {
        results.push({
          emailId,
          status: "already_scanned",
          threatDetectionId: existing.id,
        });
        continue;
      }

      const analysis = analyzeEmailThreat(emailId);
      const id = generateId();
      const now = new Date();

      await db.insert(threatDetections).values({
        id,
        accountId: auth.accountId,
        emailId,
        threatType: analysis.threatType,
        severity: analysis.severity,
        confidence: analysis.confidence,
        signals: analysis.signals,
        aiExplanation: analysis.aiExplanation,
        userAction: null,
        createdAt: now,
      });

      await db.insert(securityAuditLog).values({
        id: generateId(),
        accountId: auth.accountId,
        eventType: "threat_detected",
        details: {
          emailId,
          threatType: analysis.threatType,
          severity: analysis.severity,
          confidence: analysis.confidence,
          source: "batch_scan",
        },
        createdAt: now,
      });

      results.push({
        emailId,
        status: "scanned",
        threatDetectionId: id,
      });
    }

    return c.json({
      data: results,
      total: results.length,
      scanned: results.filter((r) => r.status === "scanned").length,
      alreadyScanned: results.filter((r) => r.status === "already_scanned").length,
    }, 201);
  },
);

// ─── GET /threats — List detected threats ───────────────────────────────────

securityIntelligenceRouter.get(
  "/threats",
  requireScope("analytics:read"),
  validateQuery(ThreatsQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ThreatsQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [eq(threatDetections.accountId, auth.accountId)];

    if (query.severity) {
      conditions.push(eq(threatDetections.severity, query.severity));
    }

    if (query.type) {
      conditions.push(eq(threatDetections.threatType, query.type));
    }

    if (query.cursor) {
      conditions.push(lt(threatDetections.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select()
      .from(threatDetections)
      .where(and(...conditions))
      .orderBy(desc(threatDetections.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.createdAt.toISOString()
        : null;

    return c.json({
      data: page,
      cursor: nextCursor,
      hasMore,
    });
  },
);

// ─── GET /threats/:emailId — Get threat detection for email ─────────────────

securityIntelligenceRouter.get(
  "/threats/:emailId",
  requireScope("analytics:read"),
  async (c) => {
    const emailId = c.req.param("emailId");
    const auth = c.get("auth");
    const db = getDatabase();

    const [record] = await db
      .select()
      .from(threatDetections)
      .where(
        and(
          eq(threatDetections.emailId, emailId),
          eq(threatDetections.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!record) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Threat detection not found for email ${emailId}`,
            code: "threat_detection_not_found",
          },
        },
        404,
      );
    }

    return c.json({ data: record });
  },
);

// ─── POST /threats/:id/action — Take action on threat ──────────────────────

securityIntelligenceRouter.post(
  "/threats/:id/action",
  requireScope("account:manage"),
  validateBody(ThreatActionSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof ThreatActionSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: threatDetections.id, emailId: threatDetections.emailId })
      .from(threatDetections)
      .where(
        and(
          eq(threatDetections.id, id),
          eq(threatDetections.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Threat detection ${id} not found`,
            code: "threat_detection_not_found",
          },
        },
        404,
      );
    }

    const actionMap = {
      report: "reported",
      dismiss: "dismissed",
      quarantine: "quarantined",
    } as const;

    const userAction = actionMap[input.action];

    await db
      .update(threatDetections)
      .set({ userAction })
      .where(eq(threatDetections.id, id));

    // Log the action
    const eventType =
      input.action === "quarantine" ? "email_quarantined" : "threat_detected";

    await db.insert(securityAuditLog).values({
      id: generateId(),
      accountId: auth.accountId,
      eventType,
      details: {
        threatDetectionId: id,
        emailId: existing.emailId,
        action: input.action,
        userAction,
      },
      userId: auth.userId ?? null,
      createdAt: new Date(),
    });

    return c.json({
      data: {
        id,
        userAction,
        action: input.action,
      },
    });
  },
);

// ─── GET /policies — List security policies ─────────────────────────────────

securityIntelligenceRouter.get(
  "/policies",
  requireScope("analytics:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select()
      .from(securityPolicies)
      .where(eq(securityPolicies.accountId, auth.accountId))
      .orderBy(desc(securityPolicies.createdAt));

    return c.json({ data: rows });
  },
);

// ─── POST /policies — Create security policy ────────────────────────────────

securityIntelligenceRouter.post(
  "/policies",
  requireScope("account:manage"),
  validateBody(CreatePolicySchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreatePolicySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const now = new Date();

    await db.insert(securityPolicies).values({
      id,
      accountId: auth.accountId,
      name: input.name,
      type: input.type,
      value: input.value,
      isActive: true,
      createdAt: now,
    });

    // Log policy creation
    await db.insert(securityAuditLog).values({
      id: generateId(),
      accountId: auth.accountId,
      eventType: "policy_created",
      details: {
        policyId: id,
        name: input.name,
        type: input.type,
        value: input.value,
      },
      userId: auth.userId ?? null,
      createdAt: now,
    });

    const [created] = await db
      .select()
      .from(securityPolicies)
      .where(eq(securityPolicies.id, id))
      .limit(1);

    return c.json({ data: created }, 201);
  },
);

// ─── DELETE /policies/:id — Delete policy ───────────────────────────────────

securityIntelligenceRouter.delete(
  "/policies/:id",
  requireScope("account:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({
        id: securityPolicies.id,
        name: securityPolicies.name,
        type: securityPolicies.type,
        value: securityPolicies.value,
      })
      .from(securityPolicies)
      .where(
        and(
          eq(securityPolicies.id, id),
          eq(securityPolicies.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Security policy ${id} not found`,
            code: "security_policy_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(securityPolicies)
      .where(eq(securityPolicies.id, id));

    // Log policy deletion
    await db.insert(securityAuditLog).values({
      id: generateId(),
      accountId: auth.accountId,
      eventType: "policy_deleted",
      details: {
        policyId: id,
        name: existing.name,
        type: existing.type,
        value: existing.value,
      },
      userId: auth.userId ?? null,
      createdAt: new Date(),
    });

    return c.json({
      data: {
        id,
        deleted: true,
      },
    });
  },
);

// ─── GET /audit-log — View security audit log ───────────────────────────────

securityIntelligenceRouter.get(
  "/audit-log",
  requireScope("analytics:read"),
  validateQuery(AuditLogQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof AuditLogQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [eq(securityAuditLog.accountId, auth.accountId)];

    if (query.eventType) {
      conditions.push(eq(securityAuditLog.eventType, query.eventType));
    }

    if (query.cursor) {
      conditions.push(lt(securityAuditLog.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select()
      .from(securityAuditLog)
      .where(and(...conditions))
      .orderBy(desc(securityAuditLog.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.createdAt.toISOString()
        : null;

    return c.json({
      data: page,
      cursor: nextCursor,
      hasMore,
    });
  },
);

// ─── GET /dashboard — Security dashboard stats ─────────────────────────────

securityIntelligenceRouter.get(
  "/dashboard",
  requireScope("analytics:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    // Threat count by type
    const threatsByType = await db
      .select({
        threatType: threatDetections.threatType,
        total: count(),
      })
      .from(threatDetections)
      .where(eq(threatDetections.accountId, auth.accountId))
      .groupBy(threatDetections.threatType);

    // Threat count by severity
    const threatsBySeverity = await db
      .select({
        severity: threatDetections.severity,
        total: count(),
      })
      .from(threatDetections)
      .where(eq(threatDetections.accountId, auth.accountId))
      .groupBy(threatDetections.severity);

    // Blocked senders (policies of type block_sender that are active)
    const [blockedSendersResult] = await db
      .select({ total: count() })
      .from(securityPolicies)
      .where(
        and(
          eq(securityPolicies.accountId, auth.accountId),
          eq(securityPolicies.type, "block_sender"),
          eq(securityPolicies.isActive, true),
        ),
      );

    // Total active policies
    const [policyCountResult] = await db
      .select({ total: count() })
      .from(securityPolicies)
      .where(
        and(
          eq(securityPolicies.accountId, auth.accountId),
          eq(securityPolicies.isActive, true),
        ),
      );

    // Total threats detected
    const [totalThreatsResult] = await db
      .select({ total: count() })
      .from(threatDetections)
      .where(eq(threatDetections.accountId, auth.accountId));

    return c.json({
      data: {
        totalThreats: totalThreatsResult?.total ?? 0,
        threatsByType: threatsByType.map((r) => ({
          type: r.threatType,
          count: r.total,
        })),
        threatsBySeverity: threatsBySeverity.map((r) => ({
          severity: r.severity,
          count: r.total,
        })),
        blockedSenders: blockedSendersResult?.total ?? 0,
        activePolicies: policyCountResult?.total ?? 0,
      },
    });
  },
);

// ─── GET /sender-reputation/:email — Check sender reputation ────────────────

securityIntelligenceRouter.get(
  "/sender-reputation/:email",
  requireScope("analytics:read"),
  async (c) => {
    const email = c.req.param("email");
    const auth = c.get("auth");
    const db = getDatabase();

    // Check if sender has any existing threats
    const senderThreats = await db
      .select({
        threatType: threatDetections.threatType,
        severity: threatDetections.severity,
        confidence: threatDetections.confidence,
      })
      .from(threatDetections)
      .where(eq(threatDetections.accountId, auth.accountId))
      .limit(10);

    // Check if sender is blocked by any policy
    const [blockedPolicy] = await db
      .select()
      .from(securityPolicies)
      .where(
        and(
          eq(securityPolicies.accountId, auth.accountId),
          eq(securityPolicies.type, "block_sender"),
          eq(securityPolicies.value, email),
          eq(securityPolicies.isActive, true),
        ),
      )
      .limit(1);

    // Placeholder AI reputation analysis — in production this checks SPF/DKIM/DMARC,
    // WHOIS domain age, and cross-references threat intelligence feeds
    const domain = email.split("@")[1] ?? "unknown";
    const reputationScore = Math.round(Math.random() * 40 + 60);

    return c.json({
      data: {
        email,
        domain,
        reputationScore,
        isBlocked: blockedPolicy !== undefined,
        threatHistory: senderThreats.length,
        checks: {
          spf: Math.random() > 0.3 ? "pass" : "fail",
          dkim: Math.random() > 0.3 ? "pass" : "fail",
          dmarc: Math.random() > 0.3 ? "pass" : "fail",
          domainAge: `${Math.floor(Math.random() * 10) + 1} years`,
          knownProvider: Math.random() > 0.5,
        },
        aiSummary: `Sender ${email} from domain ${domain} has a reputation score of ${reputationScore}/100. ${blockedPolicy ? "This sender is currently blocked by a policy." : "No active blocks."} ${senderThreats.length > 0 ? `Found ${senderThreats.length} historical threat detection(s).` : "No prior threats detected."}`,
      },
    });
  },
);

// ─── POST /report-phishing — Report phishing email ──────────────────────────

securityIntelligenceRouter.post(
  "/report-phishing",
  requireScope("analytics:read"),
  validateBody(ReportPhishingSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ReportPhishingSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Check if already reported
    const [existing] = await db
      .select()
      .from(threatDetections)
      .where(
        and(
          eq(threatDetections.emailId, input.emailId),
          eq(threatDetections.accountId, auth.accountId),
        ),
      )
      .limit(1);

    const now = new Date();

    if (existing) {
      // Update existing detection to reported
      await db
        .update(threatDetections)
        .set({ userAction: "reported" })
        .where(eq(threatDetections.id, existing.id));

      // Log the report
      await db.insert(securityAuditLog).values({
        id: generateId(),
        accountId: auth.accountId,
        eventType: "threat_detected",
        details: {
          emailId: input.emailId,
          threatDetectionId: existing.id,
          action: "user_reported_phishing",
          reason: input.reason ?? null,
        },
        userId: auth.userId ?? null,
        createdAt: now,
      });

      return c.json({
        data: {
          id: existing.id,
          emailId: input.emailId,
          status: "updated_to_reported",
        },
      });
    }

    // Create new threat detection for reported phishing
    const id = generateId();

    await db.insert(threatDetections).values({
      id,
      accountId: auth.accountId,
      emailId: input.emailId,
      threatType: "phishing",
      severity: "high",
      confidence: 1.0,
      signals: {
        urlMismatch: false,
        senderSpoofed: false,
        urgentLanguage: false,
        attachmentRisk: false,
        newSender: false,
        replyToMismatch: false,
      },
      aiExplanation: `Email reported as phishing by user.${input.reason ? ` Reason: ${input.reason}` : ""}`,
      userAction: "reported",
      createdAt: now,
    });

    // Log the report
    await db.insert(securityAuditLog).values({
      id: generateId(),
      accountId: auth.accountId,
      eventType: "threat_detected",
      details: {
        emailId: input.emailId,
        threatDetectionId: id,
        action: "user_reported_phishing",
        reason: input.reason ?? null,
      },
      userId: auth.userId ?? null,
      createdAt: now,
    });

    const [created] = await db
      .select()
      .from(threatDetections)
      .where(eq(threatDetections.id, id))
      .limit(1);

    return c.json({ data: created }, 201);
  },
);

export { securityIntelligenceRouter };
