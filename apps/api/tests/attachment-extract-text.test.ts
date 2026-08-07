/**
 * Issue #166 — attachment-intelligence OCR fabrication.
 *
 * POST /extract-text used to PERSIST a literal placeholder string
 * ("[Extracted text from X] — This is a placeholder…") into
 * attachment_analysis.extracted_text, then report alreadyExtracted: true for
 * that row forever. Rows poisoned that way exist in real databases.
 *
 * Now: the endpoint answers 501 AFTER the ownership check (so a 404 still
 * means what it meant), persists nothing fabricated, self-heals poisoned rows
 * (clears the placeholder on touch, treats it as absent on read — no
 * migration, Boss Rule #7), and genuinely-present text still returns. The
 * analyze summary also stopped claiming to be AI.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const ACCOUNT_ID = "acct_1";

const PLACEHOLDER =
  "[Extracted text from report.pdf] — This is a placeholder. In production, the actual text content would be extracted from the application/pdf file using OCR or document parsing.";

let selectResults: unknown[][] = [];
let selectCall = 0;
let updates: Record<string, unknown>[] = [];
let inserted: Record<string, unknown>[] = [];

function chain(result: () => unknown): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "groupBy", "orderBy", "limit", "having"]) {
    c[m] = vi.fn(() => c);
  }
  c["then"] = (resolve: (v: unknown) => unknown) => resolve(result());
  return c;
}

const mockDb = {
  select: vi.fn(() => {
    const idx = selectCall++;
    return chain(() => selectResults[idx] ?? []);
  }),
  update: vi.fn(() => ({
    set: vi.fn((values: Record<string, unknown>) => {
      updates.push(values);
      return { where: vi.fn(() => Promise.resolve(undefined)) };
    }),
  })),
  insert: vi.fn(() => ({
    values: vi.fn((values: Record<string, unknown>) => {
      inserted.push(values);
      return Promise.resolve(undefined);
    }),
  })),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => mockDb };
});

vi.mock("../src/middleware/auth.js", () => ({
  requireScope:
    () =>
    async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set("auth", { accountId: ACCOUNT_ID, userId: "user_1" });
      await next();
    },
}));

function analysisRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "att_1",
    accountId: ACCOUNT_ID,
    emailId: "em_1",
    fileName: "report.pdf",
    fileType: "pdf",
    fileSize: 1000,
    mimeType: "application/pdf",
    isSafe: true,
    threatLevel: "safe",
    aiSummary: "x",
    extractedText: null,
    containsPII: false,
    piiTypes: [],
    virusScanStatus: "pending",
    virusScanResult: null,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    ...over,
  };
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const { attachmentIntelligenceRouter } = await import(
    "../src/routes/attachment-intelligence.js"
  );
  const app = new Hono();
  app.route("/v1/attachments/intelligence", attachmentIntelligenceRouter);
  return app.request(`/v1/attachments/intelligence${path}`, init);
}

function extractText(attachmentId: string): Promise<Response> {
  return request("/extract-text", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ attachmentId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResults = [];
  selectCall = 0;
  updates = [];
  inserted = [];
});

describe("POST /extract-text", () => {
  it("still 404s for an attachment the caller does not own — before any capability answer", async () => {
    selectResults = [[]];
    const res = await extractText("someone-elses-id");
    expect(res.status).toBe(404);
    expect(updates).toHaveLength(0);
  });

  it("answers 501 and persists NOTHING for an unextracted attachment", async () => {
    selectResults = [[analysisRow()]];
    const res = await extractText("att_1");
    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("text_extraction_unavailable");
    expect(body.error.message).toContain("Nothing was extracted");
    // The old handler wrote a placeholder here. Nothing may be written now.
    expect(updates).toHaveLength(0);
    expect(inserted).toHaveLength(0);
  });

  it("still returns genuinely-present text (real functionality kept)", async () => {
    selectResults = [[analysisRow({ extractedText: "Real content from the file." })]];
    const res = await extractText("att_1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { extractedText: string; alreadyExtracted: boolean };
    };
    expect(body.data.alreadyExtracted).toBe(true);
    expect(body.data.extractedText).toBe("Real content from the file.");
  });

  it("self-heals a poisoned row: clears the placeholder and answers 501, never alreadyExtracted", async () => {
    selectResults = [[analysisRow({ extractedText: PLACEHOLDER })]];
    const res = await extractText("att_1");
    expect(res.status).toBe(501);
    // The poison is cleared — the only write allowed is the null-out.
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({ extractedText: null });
  });
});

describe("poisoned rows read as absent everywhere", () => {
  it("GET /analysis nulls placeholder extractedText but keeps genuine text", async () => {
    selectResults = [
      [
        analysisRow({ id: "att_1", extractedText: PLACEHOLDER }),
        analysisRow({ id: "att_2", extractedText: "Genuine text" }),
      ],
    ];
    const res = await request("/analysis");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { id: string; extractedText: string | null }[];
    };
    expect(body.data[0]?.extractedText).toBeNull();
    expect(body.data[1]?.extractedText).toBe("Genuine text");
  });

  it("GET /analysis/:id nulls placeholder extractedText", async () => {
    selectResults = [[analysisRow({ extractedText: PLACEHOLDER })]];
    const res = await request("/analysis/att_1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { extractedText: string | null } };
    expect(body.data.extractedText).toBeNull();
  });
});

describe("POST /analyze summary honesty", () => {
  it("labels the check as heuristic, never as AI analysis", async () => {
    // The route inserts, then selects the row back.
    selectResults = [[analysisRow()]];
    const res = await request("/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        emailId: "em_1",
        fileName: "notes.docx",
        fileType: "docx",
        fileSize: 5000,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    });
    expect(res.status).toBe(201);
    expect(inserted).toHaveLength(1);
    const summary = String(inserted[0]?.["aiSummary"]);
    expect(summary).toContain("Heuristic check (no AI)");
    // With no content supplied, the summary must not claim a PII scan ran.
    expect(summary).toContain("no PII scan ran");
    expect(summary).not.toContain("analyzed");
  });
});
