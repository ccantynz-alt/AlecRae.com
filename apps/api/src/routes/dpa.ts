/**
 * DPA (Data Processing Agreement) Self-Serve Signing Routes
 *
 * Provides a tamper-evident, GDPR Article 28 compliant self-serve signing
 * workflow for enterprise/business customers. This removes the manual
 * "email legal@ for a signed copy" bottleneck that gates enterprise sales.
 *
 * GET    /current   — Get the current DPA version + document text + hash (auth)
 * POST   /sign      — Sign the current DPA (Zod-validated, auth)
 * GET    /           — List the signing account's DPA signatures (auth)
 *
 * Tamper-evidence: on signing we store a SHA-256 hash of the EXACT DPA
 * document text the signer agreed to, alongside the version, signer identity,
 * timestamp, IP address, and user agent. If the canonical DPA text ever
 * changes, a recomputed hash will no longer match historical records — proving
 * exactly which text each signer accepted.
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  getValidatedBody,
} from "../middleware/validator.js";
import { getDatabase, dpaSignatures } from "@alecrae/db";

// ─── Canonical DPA document (source of truth for the signed hash) ─────────────

/**
 * The current DPA version identifier. Bump this whenever the canonical text
 * below changes so signatures remain attributable to a specific text.
 */
const CURRENT_DPA_VERSION = "2026-04-01";

/**
 * Canonical, plain-text rendering of the DPA. The web signing page presents
 * this exact text (fetched from /current) and the signer confirms it. The hash
 * of this string is what we store, making the record tamper-evident.
 *
 * Keep this synchronized in substance with the human-readable DPA page at
 * apps/web/app/(legal)/dpa/page.tsx.
 */
const CURRENT_DPA_TEXT = [
  "ALECRAE, INC. — DATA PROCESSING AGREEMENT",
  `Version: ${CURRENT_DPA_VERSION}`,
  "",
  "This Data Processing Agreement (\"DPA\") forms part of the Terms of Service",
  "between AlecRae, Inc. (\"Processor\") and the Customer (\"Controller\") and",
  "governs the processing of personal data by AlecRae on behalf of the Customer",
  "in connection with the AlecRae email infrastructure platform.",
  "",
  "1. Definitions — Controller, Processor, Sub-processor, Data Subject, Personal",
  "   Data, Processing, Data Protection Laws, Standard Contractual Clauses,",
  "   Supervisory Authority, and Technical and Organizational Measures bear the",
  "   meanings set out in the GDPR and this DPA.",
  "2. Scope, Roles, and Duration — The Processor processes personal data solely",
  "   on the Controller's documented instructions for the duration of the Terms.",
  "3. Details of Processing — Subject matter, nature, purpose, types of personal",
  "   data, and categories of data subjects as described in the Service.",
  "4. Processor Obligations — Confidentiality, security, sub-processor controls,",
  "   assistance with data subject rights, breach notification, and deletion.",
  "5. Sub-Processor Management — 30 days' prior notice; Controller objection rights.",
  "6. Security Measures — AES-256-GCM at rest, TLS 1.3 in transit, RBAC, MFA,",
  "   logging, incident response, and business continuity.",
  "7. Data Breach Notification — Without undue delay and no later than 72 hours.",
  "8. International Data Transfers — EU SCCs (Decision 2021/914, Module 2) apply.",
  "9. Data Subject Rights — Prompt assistance and technical enablement.",
  "10. Audit Rights — Annual audits or SOC 2 Type II / ISO 27001 attestations.",
  "11. Data Protection Impact Assessment — Reasonable assistance provided.",
  "12. Term, Termination, and Data Deletion — Return or delete on termination.",
  "13. Liability — Subject to the Terms of Service, as permitted by law.",
  "14. Governing Law and Jurisdiction — As specified in the Terms of Service.",
  "",
  "By signing, the named signer represents they are authorized to bind the",
  "Controller entity to this DPA.",
].join("\n");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string | null {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    null
  );
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const SignDpaSchema = z.object({
  signerName: z.string().min(1).max(255),
  signerEmail: z.string().email().max(320),
  signerTitle: z.string().min(1).max(255),
  companyName: z.string().min(1).max(255),
  // The version the client believes it is signing — must match the server's
  // current version, preventing acceptance of stale text.
  dpaVersion: z.string().min(1).max(64),
  // The hash the client computed/received for the presented text. Must match
  // the server-recomputed hash of the canonical text for tamper-evidence.
  documentHash: z.string().regex(/^[a-f0-9]{64}$/, "Must be a SHA-256 hex digest"),
  organizationId: z.string().min(1).max(255).nullable().optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

const dpaRouter = new Hono();

// GET /current — Current DPA version + document text + canonical hash
dpaRouter.get("/current", requireScope("account:read"), async (c) => {
  const documentHash = await sha256Hex(CURRENT_DPA_TEXT);
  return c.json({
    data: {
      version: CURRENT_DPA_VERSION,
      documentText: CURRENT_DPA_TEXT,
      documentHash,
    },
  });
});

// POST /sign — Sign the current DPA
dpaRouter.post(
  "/sign",
  requireScope("account:manage"),
  validateBody(SignDpaSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof SignDpaSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();
    const accountId = auth.accountId;

    // Enforce that the signer is accepting the current version, not stale text.
    if (input.dpaVersion !== CURRENT_DPA_VERSION) {
      return c.json(
        {
          error: {
            type: "conflict",
            message: `DPA version mismatch. Current version is "${CURRENT_DPA_VERSION}".`,
            code: "dpa_version_mismatch",
          },
        },
        409,
      );
    }

    // Recompute the canonical hash server-side and verify it matches what the
    // client confirmed. This is the core tamper-evidence check: the stored hash
    // is always the server's authoritative hash of the exact accepted text.
    const canonicalHash = await sha256Hex(CURRENT_DPA_TEXT);
    if (input.documentHash !== canonicalHash) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message:
              "Document hash does not match the current DPA text. Reload the agreement and try again.",
            code: "dpa_hash_mismatch",
          },
        },
        422,
      );
    }

    // Idempotency: one signature per account per version.
    const [existing] = await db
      .select({ id: dpaSignatures.id, signedAt: dpaSignatures.signedAt })
      .from(dpaSignatures)
      .where(
        and(
          eq(dpaSignatures.accountId, accountId),
          eq(dpaSignatures.dpaVersion, CURRENT_DPA_VERSION),
        ),
      )
      .limit(1);

    if (existing) {
      return c.json(
        {
          error: {
            type: "conflict",
            message: "This account has already signed the current DPA version.",
            code: "dpa_already_signed",
            details: {
              signatureId: existing.id,
              signedAt: existing.signedAt.toISOString(),
            },
          },
        },
        409,
      );
    }

    const id = generateId();
    const now = new Date();
    const ipAddress = clientIp(c);
    const userAgent = c.req.header("user-agent") ?? null;

    await db.insert(dpaSignatures).values({
      id,
      accountId,
      organizationId: input.organizationId ?? null,
      signerName: input.signerName,
      signerEmail: input.signerEmail,
      signerTitle: input.signerTitle,
      companyName: input.companyName,
      dpaVersion: CURRENT_DPA_VERSION,
      documentHash: canonicalHash,
      ipAddress,
      userAgent,
      signedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          accountId,
          organizationId: input.organizationId ?? null,
          signerName: input.signerName,
          signerEmail: input.signerEmail,
          signerTitle: input.signerTitle,
          companyName: input.companyName,
          dpaVersion: CURRENT_DPA_VERSION,
          documentHash: canonicalHash,
          signedAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// GET / — List this account's DPA signatures
dpaRouter.get("/", requireScope("account:read"), async (c) => {
  const auth = c.get("auth");
  const db = getDatabase();

  const rows = await db
    .select()
    .from(dpaSignatures)
    .where(eq(dpaSignatures.accountId, auth.accountId))
    .orderBy(desc(dpaSignatures.signedAt));

  return c.json({
    data: rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      organizationId: row.organizationId,
      signerName: row.signerName,
      signerEmail: row.signerEmail,
      signerTitle: row.signerTitle,
      companyName: row.companyName,
      dpaVersion: row.dpaVersion,
      documentHash: row.documentHash,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      signedAt: row.signedAt.toISOString(),
    })),
    currentVersion: CURRENT_DPA_VERSION,
  });
});

export { dpaRouter };
