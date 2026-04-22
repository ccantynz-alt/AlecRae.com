/**
 * Attachment Intelligence — AI-powered attachment analysis, virus scanning,
 * and smart file management.
 *
 * POST /v1/attachment-intelligence/analyze              — Analyze an attachment
 * GET  /v1/attachment-intelligence/analysis              — List analyzed attachments (cursor pagination)
 * GET  /v1/attachment-intelligence/analysis/:id          — Get specific analysis result
 * POST /v1/attachment-intelligence/scan                  — Trigger virus scan for attachment
 * POST /v1/attachment-intelligence/batch-scan            — Batch scan attachments (max 25)
 * GET  /v1/attachment-intelligence/threats                — List detected threats
 * GET  /v1/attachment-intelligence/organize               — Get AI file organization suggestions
 * POST /v1/attachment-intelligence/organize/:id/action    — Mark suggestion as actioned
 * GET  /v1/attachment-intelligence/stats                  — Attachment statistics
 * GET  /v1/attachment-intelligence/pii-report             — PII detection report
 * POST /v1/attachment-intelligence/extract-text           — Extract text from attachment
 * GET  /v1/attachment-intelligence/duplicates             — Find duplicate attachments
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

/** Placeholder AI attachment analysis — in production this calls Claude. */
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
    aiSummary: `File "${fileName}" (${fileType}, ${mimeType}, ${fileSize} bytes) analyzed. Threat level: ${threatLevel}.${detectedPII.length > 0 ? ` PII detected: ${detectedPII.join(", ")}.` : " No PII detected."}`,
    extractedText: content ? content.slice(0, 5000) : null,
    containsPII: detectedPII.length > 0,
    piiTypes: detectedPII,
  };
}

/** Placeholder virus scan — in production this calls ClamAV or similar. */
function performVirusScan(
  _fileName: string,
  _fileSize: number,
): {
  status: "clean" | "infected" | "error";
  result: string;
} {
  // Simulated scan result
  const roll = Math.random();
  if (roll > 0.95) {
    return {
      status: "infected",
      result: "Trojan.GenericKD.46542893 detected by heuristic scan",
    };
  }
  if (roll > 0.9) {
    return { status: "error", result: "Scan engine timeout — retry recommended" };
  }
  return { status: "clean", result: "No threats detected" };
}

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
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.createdAt.toISOString()
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

    return c.json({ data: record });
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

    const scanResult = performVirusScan(existing.fileName, existing.fileSize);

    await db
      .update(attachmentAnalysis)
      .set({
        virusScanStatus: scanResult.status,
        virusScanResult: scanResult.result,
        isSafe:
          scanResult.status === "clean" && existing.threatLevel === "safe",
      })
      .where(eq(attachmentAnalysis.id, input.attachmentId));

    const [updated] = await db
      .select()
      .from(attachmentAnalysis)
      .where(eq(attachmentAnalysis.id, input.attachmentId))
      .limit(1);

    return c.json({ data: updated });
  },
);

// ─── POST /batch-scan — Batch scan attachments (max 25) ──────────────────────

attachmentIntelligenceRouter.post(
  "/batch-scan",
  requireScope("messages:write"),
  validateBody(BatchScanSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof BatchScanSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const results: Array<{
      attachmentId: string;
      status: "scanned" | "not_found";
      virusScanStatus?: string;
      virusScanResult?: string;
    }> = [];

    for (const attachmentId of input.attachmentIds) {
      const [existing] = await db
        .select()
        .from(attachmentAnalysis)
        .where(
          and(
            eq(attachmentAnalysis.id, attachmentId),
            eq(attachmentAnalysis.accountId, auth.accountId),
          ),
        )
        .limit(1);

      if (!existing) {
        results.push({ attachmentId, status: "not_found" });
        continue;
      }

      const scanResult = performVirusScan(existing.fileName, existing.fileSize);

      await db
        .update(attachmentAnalysis)
        .set({
          virusScanStatus: scanResult.status,
          virusScanResult: scanResult.result,
          isSafe:
            scanResult.status === "clean" && existing.threatLevel === "safe",
        })
        .where(eq(attachmentAnalysis.id, attachmentId));

      results.push({
        attachmentId,
        status: "scanned",
        virusScanStatus: scanResult.status,
        virusScanResult: scanResult.result,
      });
    }

    return c.json({
      data: results,
      total: results.length,
      scanned: results.filter((r) => r.status === "scanned").length,
      notFound: results.filter((r) => r.status === "not_found").length,
    });
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
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.createdAt.toISOString()
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
        ? page[page.length - 1]!.createdAt.toISOString()
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

    // If text was already extracted, return it
    if (existing.extractedText) {
      return c.json({
        data: {
          attachmentId: existing.id,
          fileName: existing.fileName,
          extractedText: existing.extractedText,
          alreadyExtracted: true,
        },
      });
    }

    // Placeholder OCR/text extraction — in production this calls a document
    // processing service (e.g. Tesseract, AWS Textract, or Claude vision)
    const extractedText = `[Extracted text from ${existing.fileName}] — This is a placeholder. In production, the actual text content would be extracted from the ${existing.mimeType} file using OCR or document parsing.`;

    await db
      .update(attachmentAnalysis)
      .set({ extractedText })
      .where(eq(attachmentAnalysis.id, input.attachmentId));

    return c.json({
      data: {
        attachmentId: existing.id,
        fileName: existing.fileName,
        extractedText,
        alreadyExtracted: false,
      },
    });
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
        ? `${page[page.length - 1]!.fileName}::${String(page[page.length - 1]!.fileSize)}`
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
