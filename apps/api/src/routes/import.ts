/**
 * Import/Migration Route — One-Click Email Migration
 *
 * POST /v1/import/gmail        — Import from Gmail via Google Takeout or API
 * POST /v1/import/outlook      — Import from Outlook via Graph API
 * POST /v1/import/mbox         — Import from MBOX file (Apple Mail, Thunderbird)
 * POST /v1/import/eml          — Import individual EML files
 * GET  /v1/import/status/:id   — Check import job status
 * GET  /v1/import/jobs         — List import jobs
 */

import { Hono } from "hono";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ImportJob {
  id: string;
  accountId: string;
  source: "gmail" | "outlook" | "mbox" | "eml" | "thunderbird" | "apple_mail";
  status: "pending" | "running" | "completed" | "failed";
  progress: {
    total: number;
    processed: number;
    failed: number;
    skipped: number;
  };
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

// In-memory job store (production: DB + BullMQ)
const importJobs = new Map<string, ImportJob>();

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const GmailImportSchema = z.object({
  /** Use existing connected Gmail account */
  connectedAccountId: z.string(),
  /** Max messages to import (default: all) */
  maxMessages: z.number().int().positive().optional(),
  /** Only import from specific labels */
  labels: z.array(z.string()).optional(),
  /** Import start date (skip older emails) */
  fromDate: z.string().datetime().optional(),
});

const OutlookImportSchema = z.object({
  connectedAccountId: z.string(),
  maxMessages: z.number().int().positive().optional(),
  folders: z.array(z.string()).optional(),
  fromDate: z.string().datetime().optional(),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

const importRouter = new Hono();

// POST /v1/import/gmail — Start Gmail import
importRouter.post(
  "/gmail",
  requireScope("import:write"),
  validateBody(GmailImportSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof GmailImportSchema>>(c);
    const auth = c.get("auth");

    const job: ImportJob = {
      id: generateId(),
      accountId: auth.accountId,
      source: "gmail",
      status: "pending",
      progress: { total: 0, processed: 0, failed: 0, skipped: 0 },
      startedAt: new Date(),
    };

    importJobs.set(job.id, job);

    // Start import in background (production: BullMQ job)
    startGmailImport(job, input).catch((err) => {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : String(err);
    });

    return c.json({
      data: {
        jobId: job.id,
        status: "pending",
        message: "Gmail import started. Check status with GET /v1/import/status/" + job.id,
      },
    }, 202);
  },
);

// POST /v1/import/outlook — Start Outlook import
importRouter.post(
  "/outlook",
  requireScope("import:write"),
  validateBody(OutlookImportSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof OutlookImportSchema>>(c);
    const auth = c.get("auth");

    const job: ImportJob = {
      id: generateId(),
      accountId: auth.accountId,
      source: "outlook",
      status: "pending",
      progress: { total: 0, processed: 0, failed: 0, skipped: 0 },
      startedAt: new Date(),
    };

    importJobs.set(job.id, job);

    // Background import
    startOutlookImport(job, input).catch((err) => {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : String(err);
    });

    return c.json({
      data: {
        jobId: job.id,
        status: "pending",
        message: "Outlook import started.",
      },
    }, 202);
  },
);

// POST /v1/import/mbox — Upload and import MBOX file
importRouter.post(
  "/mbox",
  requireScope("import:write"),
  async (c) => {
    const auth = c.get("auth");
    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return c.json({ error: { message: "Missing 'file' in form data", code: "missing_file" } }, 400);
    }

    if (!file.name.endsWith(".mbox") && !file.name.endsWith(".mbx")) {
      return c.json({ error: { message: "File must be .mbox format", code: "invalid_format" } }, 400);
    }

    const job: ImportJob = {
      id: generateId(),
      accountId: auth.accountId,
      source: "mbox",
      status: "pending",
      progress: { total: 0, processed: 0, failed: 0, skipped: 0 },
      startedAt: new Date(),
    };

    importJobs.set(job.id, job);

    // Read file and start parsing
    const content = await file.text();
    startMboxImport(job, content).catch((err) => {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : String(err);
    });

    return c.json({
      data: {
        jobId: job.id,
        status: "pending",
        fileSize: file.size,
        message: "MBOX import started.",
      },
    }, 202);
  },
);

// POST /v1/import/eml — Upload and import EML files
importRouter.post(
  "/eml",
  requireScope("import:write"),
  async (c) => {
    const auth = c.get("auth");
    const formData = await c.req.formData();
    const files = formData.getAll("files");

    if (files.length === 0) {
      return c.json({ error: { message: "No files uploaded", code: "missing_files" } }, 400);
    }

    const job: ImportJob = {
      id: generateId(),
      accountId: auth.accountId,
      source: "eml",
      status: "running",
      progress: { total: files.length, processed: 0, failed: 0, skipped: 0 },
      startedAt: new Date(),
    };

    importJobs.set(job.id, job);

    // Process EML files
    for (const file of files) {
      if (file instanceof File && file.name.endsWith(".eml")) {
        try {
          // In production: parse EML with @alecrae/email-parser and store
          job.progress.processed++;
        } catch {
          job.progress.failed++;
        }
      } else {
        job.progress.skipped++;
      }
    }

    job.status = "completed";
    job.completedAt = new Date();

    return c.json({
      data: {
        jobId: job.id,
        status: "completed",
        progress: job.progress,
      },
    });
  },
);

// GET /v1/import/status/:id — Check import job status
importRouter.get(
  "/status/:id",
  requireScope("import:read"),
  (c) => {
    const id = c.req.param("id");
    const job = importJobs.get(id);

    if (!job) {
      return c.json({ error: { message: "Import job not found", code: "job_not_found" } }, 404);
    }

    const percentComplete = job.progress.total > 0
      ? Math.round((job.progress.processed / job.progress.total) * 100)
      : 0;

    return c.json({
      data: {
        jobId: job.id,
        source: job.source,
        status: job.status,
        progress: job.progress,
        percentComplete,
        startedAt: job.startedAt.toISOString(),
        completedAt: job.completedAt?.toISOString() ?? null,
        error: job.error ?? null,
      },
    });
  },
);

// GET /v1/import/jobs — List all import jobs
importRouter.get(
  "/jobs",
  requireScope("import:read"),
  (c) => {
    const auth = c.get("auth");
    const jobs = [...importJobs.values()]
      .filter((j) => j.accountId === auth.accountId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    return c.json({
      data: jobs.map((j) => ({
        jobId: j.id,
        source: j.source,
        status: j.status,
        progress: j.progress,
        startedAt: j.startedAt.toISOString(),
        completedAt: j.completedAt?.toISOString() ?? null,
      })),
    });
  },
);

// ─── Import Workers (simplified — production: BullMQ) ────────────────────────

async function startGmailImport(
  job: ImportJob,
  _options: z.infer<typeof GmailImportSchema>,
): Promise<void> {
  job.status = "running";
  // In production: use the sync engine to batch-fetch all messages
  // from the connected Gmail account via API, paginating through results.
  // Each message gets stored in our DB + indexed for search.
  job.status = "completed";
  job.completedAt = new Date();
}

async function startOutlookImport(
  job: ImportJob,
  _options: z.infer<typeof OutlookImportSchema>,
): Promise<void> {
  job.status = "running";
  // Similar to Gmail: use Graph API delta queries to fetch all messages
  job.status = "completed";
  job.completedAt = new Date();
}

async function startMboxImport(job: ImportJob, content: string): Promise<void> {
  job.status = "running";

  // Simple MBOX parser: messages are separated by lines starting with "From "
  const messages = content.split(/^From /gm).filter(Boolean);
  job.progress.total = messages.length;

  for (const _msg of messages) {
    try {
      // In production: parse each message with @alecrae/email-parser
      // and store in DB + index for search
      job.progress.processed++;
    } catch {
      job.progress.failed++;
    }
  }

  job.status = "completed";
  job.completedAt = new Date();
}

export { importRouter };
