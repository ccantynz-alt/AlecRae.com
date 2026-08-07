/**
 * Agent-send queue payload shape.
 *
 * The MTA worker's declared job payload is `{ email: QueuedEmail, addedAt }`
 * (services/mta/src/worker.ts). routes/messages.ts sends `addedAt`;
 * agent-send.ts didn't, so its payload silently violated the consumer's
 * declared type. These tests pin the truthful shape — and that agent-send
 * passes NO per-job retry options, because retries now come from the queue's
 * defaultJobOptions (see send-queue-policy.test.ts): a per-job `{}` that
 * overrode attempts would reintroduce the 1-attempt greylist failure.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentDraft } from "@alecrae/db";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const queueAdd = vi.fn().mockResolvedValue({ id: "job_1" });

vi.mock("../src/lib/queue.js", () => ({
  getSendQueue: () => ({ add: queueAdd }),
}));

vi.mock("../src/lib/pre-send-gate.js", () => ({
  runPreSendGate: vi.fn().mockResolvedValue({ allowed: true }),
  PreSendGateError: class PreSendGateError extends Error {},
}));

vi.mock("../src/lib/send-anomaly.js", () => ({
  recordSend: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/quota.js", () => ({
  incrementQuota: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@alecrae/reputation", () => ({
  getWarmupOrchestrator: () => ({
    recordSend: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Minimal chained-query mock DB. The two SELECTs agent-send runs are
// distinguished by the table object handed to .from(): the accounts table
// carries `billingEmail`, the domains table carries `verificationStatus`.
let fromTable: "accounts" | "domains" | "other" = "other";

type Row = Record<string, unknown>;

const mockDb = {
  select: (): typeof mockDb => mockDb,
  from: (table: Row): typeof mockDb => {
    fromTable =
      "billingEmail" in table
        ? "accounts"
        : "verificationStatus" in table
          ? "domains"
          : "other";
    return mockDb;
  },
  where: (): Promise<Row[]> & { limit: (n: number) => Promise<Row[]> } => {
    const rows: Row[] =
      fromTable === "domains"
        ? [{ id: "dom_1", domain: "example.com" }]
        : [];
    return Object.assign(Promise.resolve(rows), {
      limit: (): Promise<Row[]> =>
        Promise.resolve(
          fromTable === "accounts"
            ? [{ billingEmail: "craig@example.com" }]
            : rows,
        ),
    });
  },
  insert: (): { values: (v: Row | Row[]) => Promise<void> } => ({
    values: (): Promise<void> => Promise.resolve(),
  }),
  update: (): {
    set: (v: Row) => { where: () => Promise<void> };
  } => ({
    set: () => ({ where: (): Promise<void> => Promise.resolve() }),
  }),
};

vi.mock("@alecrae/db", () => ({
  getDatabase: () => mockDb,
  emails: { id: "id" },
  deliveryResults: { id: "id" },
  domains: {
    id: "id",
    domain: "domain",
    accountId: "account_id",
    verificationStatus: "verification_status",
  },
  accounts: { id: "id", billingEmail: "billing_email" },
  agentDrafts: { id: "id" },
}));

// ─── Fixture ────────────────────────────────────────────────────────────────

function makeDraft(): AgentDraft {
  const now = new Date();
  return {
    id: "draft_1",
    accountId: "acct_1",
    runId: "run_1",
    emailId: "email_orig_1",
    threadId: null,
    toAddresses: ["recipient@example.org"],
    subject: "Re: hello",
    body: "Thanks — confirming Tuesday works.",
    editedBody: null,
    tone: "friendly",
    confidence: 0.9,
    reasoning: "",
    category: null,
    priority: null,
    action: null,
    status: "approved",
    scheduledFor: null,
    approvedAt: now,
    rejectedAt: null,
    sentAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

interface CapturedJobPayload {
  email: { id: string; maxAttempts: number; rawMessage: string };
  addedAt: string;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("enqueueAgentDraftForSend job payload", () => {
  beforeEach(() => {
    queueAdd.mockClear();
    fromTable = "other";
  });

  it("includes addedAt as a valid ISO timestamp (the worker's declared EmailJobData shape)", async () => {
    const { enqueueAgentDraftForSend } = await import("../src/lib/agent-send.js");
    await enqueueAgentDraftForSend(makeDraft());

    expect(queueAdd).toHaveBeenCalledTimes(1);
    const payload = queueAdd.mock.calls[0]?.[1] as CapturedJobPayload;
    expect(typeof payload.addedAt).toBe("string");
    expect(Number.isNaN(new Date(payload.addedAt).getTime())).toBe(false);
    expect(payload.email.maxAttempts).toBe(8);
  });

  it("passes no per-job retry options — attempts/backoff must come from defaultJobOptions", async () => {
    const { enqueueAgentDraftForSend } = await import("../src/lib/agent-send.js");
    await enqueueAgentDraftForSend(makeDraft());

    const opts = queueAdd.mock.calls[0]?.[2] as Record<string, unknown>;
    // An immediate draft passes {} — in particular it must NOT pass its own
    // attempts (there is no per-producer policy; the queue default is it).
    expect(opts).toEqual({});
  });
});
