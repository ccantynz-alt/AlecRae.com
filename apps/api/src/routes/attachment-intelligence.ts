/**
 * Attachment Intelligence — AI-powered attachment analysis, virus scanning,
 * and smart file management.
 *
 * POST /v1/attachments/intelligence/analyze              — Analyze an attachment
 * GET  /v1/attachments/intelligence/analysis              — List analyzed attachments (cursor pagination)
 * GET  /v1/attachments/intelligence/analysis/:id          — Get specific analysis result
 * POST /v1/attachments/intelligence/scan                  — Trigger virus scan for attachment
 * POST /v1/attachments/intelligence/batch-scan            — Batch scan attachments (max 25)
 * GET  /v1/attachments/intelligence/threats                — List detected threats
 * GET  /v1/attachments/intelligence/organize               — Get AI file organization suggestions
 * POST /v1/attachments/intelligence/organize/:id/action    — Mark suggestion as actioned
 * GET  /v1/attachments/intelligence/stats                  — Attachment statistics
 * GET  /v1/attachments/intelligence/pii-report             — PII detection report
 * POST /v1/attachments/intelligence/extract-text           — 501 (no OCR engine; self-heals old placeholder rows)
 * GET  /v1/attachments/intelligence/duplicates             — Find duplicate attachments
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt, count, sum, sql } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import {
  getDatabase,
  attachmentAnalysis,
  smartFileOrganization,
} from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const AnalyzeSchema = z.object({
  emailId: z.string().min(1),
  fileName: z.string().min(1),
  fileType: z.string().min(1),
  fileSize: z.number().int().min(0),
  mimeType: z.string().min(1),
  content: z.string().optional(),
});

const AnalysisQuerySchema = z.object({
  emailId: z.string().optional(),
  threatLevel: z.enum(["safe", "suspicious", "dangerous"]).optional(),
  fileType: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const ScanSchema = z.object({
  attachmentId: z.string().min(1),
});

const BatchScanSchema = z.object({
  attachmentIds: z.array(z.string().min(1)).min(1).max(25),
});

const ThreatsQuerySchema = z.object({
  severity: z.enum(["safe", "suspicious", "dangerous"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const OrganizeQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const OrganizeActionSchema = z.object({
  action: z.enum(["accepted", "dismissed"]),
});

const ExtractTextSchema = z.object({
  attachmentId: z.string().min(1),
});

const DuplicatesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Heuristic attachment screening — NOT AI, and its output must never claim to
 * be. What actually runs: a risky-extension blocklist, a >25MB size check, and
 * four regexes over caller-supplied text for PII patterns. The summary text it
 * produces says exactly that (issue #166 — the previous text read like the
 * verdict of an AI analysis that never happened).
 */
function analyzeAttachment(
  fileName: string,
  fileType: string,
  fileSize: number,
  mimeType: string,
  content?: string,
): {
  isSafe: boolean;
  threatLevel: "safe" | "suspicious" | "dangerous";
  aiSummary: string;
  extractedText: string | null;
  containsPII: boolean;
  piiTypes: string[];
} {
  // Determine threat level based on file characteristics
  const riskyExtensions = [".exe", ".bat", ".cmd", ".scr", ".js", ".vbs"];
  const isRisky = riskyExtensions.some((ext) =>
    fileName.toLowerCase().endsWith(ext),
  );

  const threatLevel = isRisky
    ? "dangerous"
    : fileSize > 25_000_000
      ? "suspicious"
      : "safe";

  // Placeholder PII detection
  const detectedPII: string[] = [];
  if (content) {
    if (/\b\d{3}-\d{2}-\d{4}\b/.test(content)) detectedPII.push("ssn");
    if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(content))
      detectedPII.push("email");
    if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(content))
      detectedPII.push("phone");
    if (/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(content))
      detectedPII.push("credit_card");
  }

  return {
    isSafe: threatLevel === "safe",
    threatLevel,
    aiSummary: `Heuristic check (no AI): file extension and size screened — threat level ${threatLevel}.${detectedPII.length > 0 ? ` Pattern scan found possible PII: ${detectedPII.join(", ")}.` : content ? " Pattern scan found no PII." : " File content was not provided, so no PII scan ran."}`,
    extractedText: content ? content.slice(0, 5000) : null,
    containsPII: detectedPII.length > 0,
    piiTypes: detectedPII,
  };
}

/**
 * No virus scanner is wired up.
 *
 * This used to be `Math.random()`: 90% of the time it reported "No threats
 * detected" for a file nothing had scanned, and 5% of the time it invented a
 * specific, real-sounding malware name ("Trojan.GenericKD.46542893") for a
 * file that was almost certainly fine. Both verdicts were persisted and
 * rendered to the user as a scan result. Telling someone an attachment is
 * clean when nothing looked at it is the more dangerous of the two.
 *
 * Same class as issue #84 (security-intelligence fabricating threat data) and
 * fixed the same way: report honestly that the capability is unavailable
 * rather than inventing an answer. Wiring a real scanner (ClamAV or a hosted
 * equivalent) means a new dependency, which is Craig's call per Boss Rule #12.
 *
 * The `attachment_virus_scan_status` enum has no "unavailable" value, so the
 * row keeps its truthful `pending` — no scan has happened — instead of gaining
 * a value that would need a migration.
 */
const VIRUS_SCAN_UNAVAILABLE = {
  error: {
    type: "not_implemented" as const,
    message:
      "Virus scanning is not available — no scanning engine is configured. " +
      "The attachment has not been scanned, and no result has been recorded.",
    code: "virus_scan_unavailable" as const,
  },
};

/**
 * The old /extract-text handler PERSISTED a literal placeholder string
 * ("[Extracted text from X] — This is a placeholder…") into
 * `attachment_analysis.extracted_text`, and then reported `alreadyExtracted:
 * true` for that row forever (issue #166). Rows poisoned that way still exist
 * in the database. Adding a cleanup migration is Boss Rule #7, so instead the
 * poison is treated as absent wherever extractedText is read, and cleared
 * opportunistically when such a row is touched again — self-healing, no
 * migration.
 */
function isPlaceholderExtractedText(text: string | null): boolean {
  return (
    text !== null &&
    text.startsWith("[Extracted text from ") &&
    text.includes("placeholder")
  );
}

/** Null out a poisoned extractedText value on a row being returned to a caller. */
function sanitizeAnalysisRow<T extends { extractedText: string | null }>(row: T): T {
  if (isPlaceholderExtractedText(row.extractedText)) {
    return { ...row, extractedText: null };
  }
  return row;
}

const TEXT_EXTRACTION_UNAVAILABLE = {
  error: {
    type: "not_implemented" as const,
    message:
      "Text extraction (OCR / document parsing) is not available — no extraction engine is configured. " +
      "Nothing was extracted, and no result has been recorded.",
    code: "text_extraction_unavailable" as const,
  },
};

// ─── Router ───────────────────────────────────────────────────────────────────

const attachmentIntelligenceRouter = new Hono();

// ─── POST /analyze — Analyze an attachment ────────────────────────────────────

attachmentIntelligenceRouter.post(
  "/analyze",
  requireScope("messages:write"),
  validateBody(AnalyzeSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof AnalyzeSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const analysis = analyzeAttachment(
      input.fileName,
      input.fileType,
      input.fileSize,
      input.mimeType,
      input.content,
    );

    const id = generateId();
    const now = new Date();

    await db.insert(attachmentAnalysis).values({
      id,
      accountId: auth.accountId,
      emailId: input.emailId,
      fileName: input.fileName,
      fileType: input.fileType,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      isSafe: analysis.isSafe,
      threatLevel: analysis.threatLevel,
      aiSummary: analysis.aiSummary,
      extractedText: analysis.extractedText,
      containsPII: analysis.containsPII,
      piiTypes: analysis.piiTypes,
      virusScanStatus: "pending",
      virusScanResult: null,
      createdAt: now,
    });

    const [created] = await db
      .select()
      .from(attachmentAnalysis)
      .where(eq(attachmentAnalysis.id, id))
      .limit(1);

    return c.json({ data: created }, 201);
  },
);

// ─── GET /analysis — List analyzed attachments ────────────────────────────────

attachmentIntelligenceRouter.get(
  "/analysis",
  requireScope("messages:read"),
  validateQuery(AnalysisQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof AnalysisQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [eq(attachmentAnalysis.accountId, auth.accountId)];

    if (query.emailId) {
      conditions.push(eq(attachmentAnalysis.emailId, query.emailId));
    }
    if (query.threatLevel) {
      conditions.push(eq(attachmentAnalysis.threatLevel, query.threatLevel));
    }
    if (query.fileType) {
      conditions.push(eq(attachmentAnalysis.fileType, query.fileType));
    }
    if (query.cursor) {
      conditions.push(
        lt(attachmentAnalysis.createdAt, new Date(query.cursor)),
      );
    }

    const rows = await db
      .select()
      .from(attachmentAnalysis)
      .where(and(...conditions))
      .orderBy(desc(attachmentAnalysis.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = (hasMore ? rows.slice(0, query.limit) : rows).map(
      sanitizeAnalysisRow,
    );
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]?.createdAt.toISOString()
        : null;

    return c.json({ data: page, cursor: nextCursor, hasMore });
  },
);

// ─── GET /analysis/:id — Get specific analysis result ─────────────────────────

attachmentIntelligenceRouter.get(
  "/analysis/:id",
  requireScope("messages:read"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [record] = await db
      .select()
      .from(attachmentAnalysis)
      .where(
        and(
          eq(attachmentAnalysis.id, id),
          eq(attachmentAnalysis.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!record) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Attachment analysis ${id} not found`,
            code: "attachment_analysis_not_found",
          },
        },
        404,
      );
    }

    return c.json({ data: sanitizeAnalysisRow(record) });
  },
);

// ─── POST /scan — Trigger virus scan for attachment ───────────────────────────

attachmentIntelligenceRouter.post(
  "/scan",
  requireScope("messages:write"),
  validateBody(ScanSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ScanSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(attachmentAnalysis)
      .where(
        and(
          eq(attachmentAnalysis.id, input.attachmentId),
          eq(attachmentAnalysis.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Attachment ${input.attachmentId} not found`,
            code: "attachment_not_found",
          },
        },
        404,
      );
    }

    // The attachment was found and belongs to the caller — the 404 above still
    // matters, so ownership is checked before reporting the capability gap.
    return c.json(VIRUS_SCAN_UNAVAILABLE, 501);
  },
);

// ─── POST /batch-scan — Batch scan attachments (max 25) ──────────────────────

attachmentIntelligenceRouter.post(
  "/batch-scan",
  requireScope("messages:write"),
  validateBody(BatchScanSchema),
  async (c) => {
    // Same capability gap as POST /scan. Refusing the whole batch is
    // deliberate: a partial response would have to say something about each
    // attachment, and there is nothing true to say.
    return c.json(VIRUS_SCAN_UNAVAILABLE, 501);
  },
);

// ─── GET /threats — List detected threats ─────────────────────────────────────

attachmentIntelligenceRouter.get(
  "/threats",
  requireScope("messages:read"),
  validateQuery(ThreatsQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ThreatsQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [
      eq(attachmentAnalysis.accountId, auth.accountId),
      sql`${attachmentAnalysis.threatLevel} != 'safe'`,
    ];

    if (query.severity) {
      conditions.push(eq(attachmentAnalysis.threatLevel, query.severity));
    }

    if (query.cursor) {
      conditions.push(
        lt(attachmentAnalysis.createdAt, new Date(query.cursor)),
      );
    }

    const rows = await db
      .select()
      .from(attachmentAnalysis)
      .where(and(...conditions))
      .orderBy(desc(attachmentAnalysis.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = (hasMore ? rows.slice(0, query.limit) : rows).map(
      sanitizeAnalysisRow,
    );
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]?.createdAt.toISOString()
        : null;

    return c.json({ data: page, cursor: nextCursor, hasMore });
  },
);

// ─── GET /organize — Get AI file organization suggestions ─────────────────────

attachmentIntelligenceRouter.get(
  "/organize",
  requireScope("messages:read"),
  validateQuery(OrganizeQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof OrganizeQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [
      eq(smartFileOrganization.accountId, auth.accountId),
      eq(smartFileOrganization.isActioned, false),
    ];

    if (query.cursor) {
      conditions.push(
        lt(smartFileOrganization.createdAt, new Date(query.cursor)),
      );
    }

    const rows = await db
      .select()
      .from(smartFileOrganization)
      .where(and(...conditions))
      .orderBy(desc(smartFileOrganization.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]?.createdAt.toISOString()
        : null;

    return c.json({ data: page, cursor: nextCursor, hasMore });
  },
);

// ─── POST /organize/:id/action — Mark suggestion as actioned ──────────────────

attachmentIntelligenceRouter.post(
  "/organize/:id/action",
  requireScope("messages:write"),
  validateBody(OrganizeActionSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof OrganizeActionSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: smartFileOrganization.id })
      .from(smartFileOrganization)
      .where(
        and(
          eq(smartFileOrganization.id, id),
          eq(smartFileOrganization.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Organization suggestion ${id} not found`,
            code: "organization_suggestion_not_found",
          },
        },
        404,
      );
    }

    await db
      .update(smartFileOrganization)
      .set({ isActioned: true })
      .where(eq(smartFileOrganization.id, id));

    return c.json({
      data: {
        id,
        action: input.action,
        isActioned: true,
      },
    });
  },
);

// ─── GET /stats — Attachment statistics ───────────────────────────────────────

attachmentIntelligenceRouter.get(
  "/stats",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    // Total files analyzed
    const [totalResult] = await db
      .select({ total: count() })
      .from(attachmentAnalysis)
      .where(eq(attachmentAnalysis.accountId, auth.accountId));

    // Total storage
    const [storageResult] = await db
      .select({ totalSize: sum(attachmentAnalysis.fileSize) })
      .from(attachmentAnalysis)
      .where(eq(attachmentAnalysis.accountId, auth.accountId));

    // Threats blocked (non-safe)
    const [threatsResult] = await db
      .select({ total: count() })
      .from(attachmentAnalysis)
      .where(
        and(
          eq(attachmentAnalysis.accountId, auth.accountId),
          sql`${attachmentAnalysis.threatLevel} != 'safe'`,
        ),
      );

    // Infected files
    const [infectedResult] = await db
      .select({ total: count() })
      .from(attachmentAnalysis)
      .where(
        and(
          eq(attachmentAnalysis.accountId, auth.accountId),
          eq(attachmentAnalysis.virusScanStatus, "infected"),
        ),
      );

    // File types breakdown
    const typesBreakdown = await db
      .select({
        fileType: attachmentAnalysis.fileType,
        total: count(),
      })
      .from(attachmentAnalysis)
      .where(eq(attachmentAnalysis.accountId, auth.accountId))
      .groupBy(attachmentAnalysis.fileType)
      .orderBy(desc(count()));

    // PII-containing files
    const [piiResult] = await db
      .select({ total: count() })
      .from(attachmentAnalysis)
      .where(
        and(
          eq(attachmentAnalysis.accountId, auth.accountId),
          eq(attachmentAnalysis.containsPII, true),
        ),
      );

    return c.json({
      data: {
        totalFiles: totalResult?.total ?? 0,
        storageUsed: Number(storageResult?.totalSize ?? 0),
        threatsBlocked: threatsResult?.total ?? 0,
        infectedFiles: infectedResult?.total ?? 0,
        filesWithPII: piiResult?.total ?? 0,
        typesBreakdown: typesBreakdown.map((r) => ({
          type: r.fileType,
          count: r.total,
        })),
      },
    });
  },
);

// ─── GET /pii-report — PII detection report ──────────────────────────────────

attachmentIntelligenceRouter.get(
  "/pii-report",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select({
        id: attachmentAnalysis.id,
        emailId: attachmentAnalysis.emailId,
        fileName: attachmentAnalysis.fileName,
        fileType: attachmentAnalysis.fileType,
        piiTypes: attachmentAnalysis.piiTypes,
        createdAt: attachmentAnalysis.createdAt,
      })
      .from(attachmentAnalysis)
      .where(
        and(
          eq(attachmentAnalysis.accountId, auth.accountId),
          eq(attachmentAnalysis.containsPII, true),
        ),
      )
      .orderBy(desc(attachmentAnalysis.createdAt))
      .limit(100);

    // Aggregate PII type counts
    const piiTypeCounts: Record<string, number> = {};
    for (const row of rows) {
      const types = (row.piiTypes as string[] | null) ?? [];
      for (const t of types) {
        piiTypeCounts[t] = (piiTypeCounts[t] ?? 0) + 1;
      }
    }

    return c.json({
      data: {
        totalFilesWithPII: rows.length,
        piiTypeCounts,
        files: rows,
      },
    });
  },
);

// ─── POST /extract-text — Extract text from attachment ────────────────────────

attachmentIntelligenceRouter.post(
  "/extract-text",
  requireScope("messages:write"),
  validateBody(ExtractTextSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ExtractTextSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(attachmentAnalysis)
      .where(
        and(
          eq(attachmentAnalysis.id, input.attachmentId),
          eq(attachmentAnalysis.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Attachment ${input.attachmentId} not found`,
            code: "attachment_not_found",
          },
        },
        404,
      );
    }

    // A row poisoned by the old placeholder-writing handler self-heals here:
    // the fake text is cleared so alreadyExtracted can never again be true on
    // the strength of a placeholder (issue #166; no migration, Boss Rule #7).
    if (isPlaceholderExtractedText(existing.extractedText)) {
      await db
        .update(attachmentAnalysis)
        .set({ extractedText: null })
        .where(eq(attachmentAnalysis.id, input.attachmentId));
    } else if (existing.extractedText) {
      // Genuinely-present text (e.g. supplied at analyze time) is returned.
      return c.json({
        data: {
          attachmentId: existing.id,
          fileName: existing.fileName,
          extractedText: existing.extractedText,
          alreadyExtracted: true,
        },
      });
    }

    // No OCR / document-parsing engine exists. The old handler fabricated a
    // placeholder string, PERSISTED it as extracted text, and reported it as
    // real forever after. The ownership check above runs first so a 404 still
    // means what it meant; the capability gap is reported after it.
    return c.json(TEXT_EXTRACTION_UNAVAILABLE, 501);
  },
);

// ─── GET /duplicates — Find duplicate attachments ─────────────────────────────

attachmentIntelligenceRouter.get(
  "/duplicates",
  requireScope("messages:read"),
  validateQuery(DuplicatesQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof DuplicatesQuerySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Find files that share the same fileName + fileSize + mimeType (likely duplicates)
    const duplicateGroups = await db
      .select({
        fileName: attachmentAnalysis.fileName,
        fileSize: attachmentAnalysis.fileSize,
        mimeType: attachmentAnalysis.mimeType,
        total: count(),
      })
      .from(attachmentAnalysis)
      .where(eq(attachmentAnalysis.accountId, auth.accountId))
      .groupBy(
        attachmentAnalysis.fileName,
        attachmentAnalysis.fileSize,
        attachmentAnalysis.mimeType,
      )
      .having(sql`count(*) > 1`)
      .orderBy(desc(count()))
      .limit(query.limit + 1);

    const hasMore = duplicateGroups.length > query.limit;
    const page = hasMore
      ? duplicateGroups.slice(0, query.limit)
      : duplicateGroups;
    const nextCursor =
      hasMore && page.length > 0
        ? `${page[page.length - 1]?.fileName ?? ""}::${String(page[page.length - 1]?.fileSize ?? "")}`
        : null;

    // For each duplicate group, fetch the individual attachment IDs
    const groups = [];
    for (const group of page) {
      const instances = await db
        .select({
          id: attachmentAnalysis.id,
          emailId: attachmentAnalysis.emailId,
          createdAt: attachmentAnalysis.createdAt,
        })
        .from(attachmentAnalysis)
        .where(
          and(
            eq(attachmentAnalysis.accountId, auth.accountId),
            eq(attachmentAnalysis.fileName, group.fileName),
            eq(attachmentAnalysis.fileSize, group.fileSize),
            eq(attachmentAnalysis.mimeType, group.mimeType),
          ),
        )
        .orderBy(desc(attachmentAnalysis.createdAt));

      groups.push({
        fileName: group.fileName,
        fileSize: group.fileSize,
        mimeType: group.mimeType,
        count: group.total,
        instances,
      });
    }

    return c.json({ data: groups, cursor: nextCursor, hasMore });
  },
);

export { attachmentIntelligenceRouter };
