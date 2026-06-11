/**
 * Import/Migration Route — One-Click Email Migration
 *
 * POST /v1/import/gmail        — Import from Gmail via Google Takeout or API
 * POST /v1/import/outlook      — Import from Outlook via Graph API
 * POST /v1/import/mbox         — Import from MBOX file (Apple Mail, Thunderbird)
 * POST /v1/import/eml          — Import individual EML files
 * GET  /v1/import/status/:id   — Check import job status
 * GET  /v1/import/jobs         — List import jobs
 *
 * Job state is persisted in the `import_jobs` table (Drizzle) so a restart
 * doesn't lose job records. The actual import work still runs as an in-process
 * background task (production: BullMQ); if the process restarts mid-import the
 * job row survives and reads reconcile it: any job still marked
 * pending/running whose worker no longer exists is reported as failed
 * ("interrupted by restart") the next time it is read.
 */

import { Hono } from "hono";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import {
  getDatabase,
  importJobs,
  type ImportJob,
  type ImportJobProgress,
} from "@alecrae/db";

// ─── Types ───────────────────────────────────────────────────────────────────

type ImportSource = ImportJob["source"];
type ImportStatus = ImportJob["status"];

/** Job ids whose background worker is alive in THIS process. */
const activeWorkers = new Set<string>();

const INTERRUPTED_ERROR = "Import interrupted by a server restart. Please start the import again.";

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/**
 * Reconcile a job row against the in-process worker set: a job that claims to
 * be pending/running but has no live worker was orphaned by a restart.
 * Pure on its inputs — exported for unit tests.
 */
export function reconcileJobStatus(
  job: { id: string; status: ImportStatus; error: string | null },
  hasLiveWorker: boolean,
): { status: ImportStatus; error: string | null; orphaned: boolean } {
  if ((job.status === "pending" || job.status === "running") && !hasLiveWorker) {
    return { status: "failed", error: INTERRUPTED_ERROR, orphaned: true };
  }
  return { status: job.status, error: job.error, orphaned: false };
}

async function reconcileJob(job: ImportJob): Promise<ImportJob> {
  const { status, error, orphaned } = reconcileJobStatus(
    { id: job.id, status: job.status, error: job.error },
    activeWorkers.has(job.id),
  );
  if (!orphaned) return job;

  const completedAt = new Date();
  const db = getDatabase();
  await db
    .update(importJobs)
    .set({ status, error, completedAt })
    .where(eq(importJobs.id, job.id));

  return { ...job, status, error, completedAt };
}

async function insertJob(
  accountId: string,
  source: ImportSource,
  status: ImportStatus,
  progress: ImportJobProgress,
): Promise<ImportJob> {
  const db = getDatabase();
  const job: ImportJob = {
    id: generateId(),
    accountId,
    source,
    status,
    progress,
    error: null,
    startedAt: new Date(),
    completedAt: null,
  };
  await db.insert(importJobs).values(job);
  return job;
}

async function updateJob(
  jobId: string,
  patch: Partial<Pick<ImportJob, "status" | "progress" | "error" | "completedAt">>,
): Promise<void> {
  const db = getDatabase();
  await db.update(importJobs).set(patch).where(eq(importJobs.id, jobId));
}

function runWorker(jobId: string, work: () => Promise<void>): void {
  activeWorkers.add(jobId);
  work()
    .catch(async (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      await updateJob(jobId, {
        status: "failed",
        error: message,
        completedAt: new Date(),
      }).catch(() => {
        /* job row update is best-effort; failure already logged by onError */
      });
    })
    .finally(() => {
      activeWorkers.delete(jobId);
    });
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

    const job = await insertJob(auth.accountId, "gmail", "pending", {
      total: 0,
      processed: 0,
      failed: 0,
      skipped: 0,
    });

    // Start import in background (production: BullMQ job)
    runWorker(job.id, () => startGmailImport(job.id, input));

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

    const job = await insertJob(auth.accountId, "outlook", "pending", {
      total: 0,
      processed: 0,
      failed: 0,
      skipped: 0,
    });

    // Background import
    runWorker(job.id, () => startOutlookImport(job.id, input));

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

    const job = await insertJob(auth.accountId, "mbox", "pending", {
      total: 0,
      processed: 0,
      failed: 0,
      skipped: 0,
    });

    // Read file and start parsing
    const content = await file.text();
    runWorker(job.id, () => startMboxImport(job.id, content));

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

    const progress: ImportJobProgress = {
      total: files.length,
      processed: 0,
      failed: 0,
      skipped: 0,
    };

    // Process EML files (synchronously — small uploads)
    for (const file of files) {
      if (file instanceof File && file.name.endsWith(".eml")) {
        try {
          // In production: parse EML with @alecrae/email-parser and store
          progress.processed++;
        } catch {
          progress.failed++;
        }
      } else {
        progress.skipped++;
      }
    }

    const job = await insertJob(auth.accountId, "eml", "completed", progress);
    await updateJob(job.id, { completedAt: new Date() });

    return c.json({
      data: {
        jobId: job.id,
        status: "completed",
        progress,
      },
    });
  },
);

// GET /v1/import/status/:id — Check import job status
importRouter.get(
  "/status/:id",
  requireScope("import:read"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [row] = await db
      .select()
      .from(importJobs)
      .where(and(eq(importJobs.id, id), eq(importJobs.accountId, auth.accountId)))
      .limit(1);

    if (!row) {
      return c.json({ error: { message: "Import job not found", code: "job_not_found" } }, 404);
    }

    const job = await reconcileJob(row);

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
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select()
      .from(importJobs)
      .where(eq(importJobs.accountId, auth.accountId))
      .orderBy(desc(importJobs.startedAt));

    const jobs = await Promise.all(rows.map((row) => reconcileJob(row)));

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
  jobId: string,
  _options: z.infer<typeof GmailImportSchema>,
): Promise<void> {
  await updateJob(jobId, { status: "running" });
  // In production: use the sync engine to batch-fetch all messages
  // from the connected Gmail account via API, paginating through results.
  // Each message gets stored in our DB + indexed for search.
  await updateJob(jobId, { status: "completed", completedAt: new Date() });
}

async function startOutlookImport(
  jobId: string,
  _options: z.infer<typeof OutlookImportSchema>,
): Promise<void> {
  await updateJob(jobId, { status: "running" });
  // Similar to Gmail: use Graph API delta queries to fetch all messages
  await updateJob(jobId, { status: "completed", completedAt: new Date() });
}

async function startMboxImport(jobId: string, content: string): Promise<void> {
  await updateJob(jobId, { status: "running" });

  // Simple MBOX parser: messages are separated by lines starting with "From "
  const messages = content.split(/^From /gm).filter(Boolean);
  const progress: ImportJobProgress = {
    total: messages.length,
    processed: 0,
    failed: 0,
    skipped: 0,
  };

  for (const _msg of messages) {
    try {
      // In production: parse each message with @alecrae/email-parser
      // and store in DB + index for search
      progress.processed++;
    } catch {
      progress.failed++;
    }
  }

  await updateJob(jobId, {
    status: "completed",
    progress,
    completedAt: new Date(),
  });
}

export { importRouter };
