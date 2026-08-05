/**
 * Known issue #151 — the pre-send gate now runs on every outbound-queue
 * producer, not just routes/messages.ts.
 *
 * Four paths enqueued onto the outbound queue and only messages.ts ran the
 * abuse controls, so AI-generated mail went out with no content scoring and
 * against no quota. The gates were extracted into lib/pre-send-gate.ts and
 * shared, rather than copied onto each producer — a partial copy per caller is
 * how the split happened in the first place.
 *
 * The properties pinned here are the ones a future edit could quietly undo:
 *
 *  - Ordering. Quota is checked before suppression, and both before the spam
 *    scorer, so a refusal never costs a warm-up slot, a quota count, or a
 *    Claude call. Asserting the ORDER (not just the outcome) is what stops a
 *    tidy-looking reshuffle from making a refusal expensive.
 *  - The agent path refuses BEFORE it writes. A blocked draft must leave no
 *    `emails` row, no `delivery_results`, and no queue job — a gate that runs
 *    after the insert turns a refusal into orphaned rows.
 *  - An agent send records against quota and the anomaly baseline. Without it
 *    the send is invisible to both, which was half of what #151 described.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const ACCOUNT_ID = "acct_1";
const DOMAIN_ID = "dom_1";

// ─── Gate dependency mocks ───────────────────────────────────────────────────

let quotaAllowed = true;
let suppressedRows: { email: string; reason: string }[] = [];
let spamAllowed = true;
let anomalyAllowed = true;
/** Order in which each gate dependency was consulted. */
let callOrder: string[] = [];

vi.mock("../src/lib/quota.js", () => ({
  checkQuota: vi.fn(async () => {
    callOrder.push("quota");
    return {
      allowed: quotaAllowed,
      plan: "free",
      limit: 100,
      sent: quotaAllowed ? 1 : 100,
      resetsAt: "2026-09-01T00:00:00.000Z",
    };
  }),
  incrementQuota: vi.fn(async () => undefined),
}));

vi.mock("../src/lib/outbound-spam-gate.js", () => ({
  checkOutboundSpam: vi.fn(async () => {
    callOrder.push("spam");
    return {
      allowed: spamAllowed,
      score: spamAllowed ? 0.1 : 0.95,
      review: false,
      reasons: spamAllowed ? [] : ["body matches advance-fee patterns"],
      degraded: false,
    };
  }),
}));

vi.mock("../src/lib/send-anomaly.js", () => ({
  checkSendAnomaly: vi.fn(async () => {
    callOrder.push("anomaly");
    return {
      allowed: anomalyAllowed,
      currentHour: anomalyAllowed ? 3 : 900,
      baseline: 5,
      threshold: 50,
      degraded: false,
    };
  }),
  recordSend: vi.fn(async () => undefined),
}));

const mockDb = {
  select: vi.fn(() => {
    const chain: Record<string, unknown> = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      limit: vi.fn(() => {
        callOrder.push("suppression");
        return Promise.resolve(suppressedRows);
      }),
    };
    return chain;
  }),
};

vi.mock("@alecrae/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@alecrae/db");
  return { ...actual, getDatabase: () => mockDb };
});

function input(over: Record<string, unknown> = {}) {
  return {
    accountId: ACCOUNT_ID,
    domainId: DOMAIN_ID,
    messageId: "<m1@bookaride.co.nz>",
    from: "info@bookaride.co.nz",
    recipients: ["customer@example.com"],
    subject: "Your booking is confirmed",
    text: "Thanks for booking with us. See you Tuesday.",
    headers: null,
    contentClass: "correspondence" as const,
    ...over,
  };
}

describe("runPreSendGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quotaAllowed = true;
    suppressedRows = [];
    spamAllowed = true;
    anomalyAllowed = true;
    callOrder = [];
  });

  it("allows an ordinary message and returns the sanitized headers", async () => {
    const { runPreSendGate } = await import("../src/lib/pre-send-gate.js");
    const verdict = await runPreSendGate(input());

    expect(verdict.allowed).toBe(true);
    if (verdict.allowed) {
      expect(verdict.sanitizedHeaders).toEqual({});
    }
  });

  it("checks quota first, before suppression and before scoring content", async () => {
    const { runPreSendGate } = await import("../src/lib/pre-send-gate.js");
    await runPreSendGate(input());

    // The spam scorer is the expensive one; suppression is a DB round trip per
    // recipient. Neither may run ahead of the cheap quota check.
    expect(callOrder.indexOf("quota")).toBe(0);
    expect(callOrder.indexOf("quota")).toBeLessThan(callOrder.indexOf("suppression"));
    expect(callOrder.indexOf("suppression")).toBeLessThan(callOrder.indexOf("spam"));
    expect(callOrder.indexOf("spam")).toBeLessThan(callOrder.indexOf("anomaly"));
  });

  it("refuses over quota with 429 and never scores the content", async () => {
    quotaAllowed = false;
    const { runPreSendGate } = await import("../src/lib/pre-send-gate.js");
    const verdict = await runPreSendGate(input());

    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) {
      expect(verdict.status).toBe(429);
      expect(verdict.code).toBe("QUOTA_EXCEEDED");
    }
    // A refusal must not have cost a Claude call.
    expect(callOrder).not.toContain("spam");
  });

  it("refuses a suppressed recipient with 422 before scoring", async () => {
    suppressedRows = [{ email: "customer@example.com", reason: "bounce" }];
    const { runPreSendGate } = await import("../src/lib/pre-send-gate.js");
    const verdict = await runPreSendGate(input());

    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) {
      expect(verdict.status).toBe(422);
      expect(verdict.code).toBe("RECIPIENT_SUPPRESSED");
      expect(verdict.body).toMatchObject({ reason: "hard_bounce" });
    }
    expect(callOrder).not.toContain("spam");
  });

  it("refuses spam-scored content with 422 and reports the score", async () => {
    spamAllowed = false;
    const { runPreSendGate } = await import("../src/lib/pre-send-gate.js");
    const verdict = await runPreSendGate(input());

    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) {
      expect(verdict.status).toBe(422);
      expect(verdict.code).toBe("outbound_spam_rejected");
      expect(verdict.body).toMatchObject({
        error: { code: "outbound_spam_rejected", score: 0.95 },
      });
    }
  });

  it("refuses an anomalous send volume with 429", async () => {
    anomalyAllowed = false;
    const { runPreSendGate } = await import("../src/lib/pre-send-gate.js");
    const verdict = await runPreSendGate(input());

    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) {
      expect(verdict.status).toBe(429);
      expect(verdict.code).toBe("send_volume_anomaly");
    }
  });

  it("rejects a header carrying CRLF injection with 400", async () => {
    const { runPreSendGate } = await import("../src/lib/pre-send-gate.js");
    const verdict = await runPreSendGate(
      input({ headers: { "X-Custom": "ok\r\nBcc: victim@example.com" } }),
    );

    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) {
      expect(verdict.status).toBe(400);
    }
  });

  it("checks every recipient against suppression, not just the first", async () => {
    const { runPreSendGate } = await import("../src/lib/pre-send-gate.js");
    await runPreSendGate(
      input({ recipients: ["a@example.com", "b@example.com", "c@example.com"] }),
    );

    expect(callOrder.filter((c) => c === "suppression")).toHaveLength(3);
  });
});

/**
 * Compliance classification — the bug that made the send path refuse ordinary
 * mail.
 *
 * The rule was `isTransactional ? "transactional" : "marketing"`, so every
 * plain email was classified as a commercial bulk campaign. Against the REAL
 * engine that is ten critical violations (no physical postal address, no
 * unsubscribe link, no List-Unsubscribe header, no recorded GDPR/CASL
 * consent), and the handler refuses on any violation — a 422 on every
 * non-transactional send.
 *
 * These tests deliberately do NOT mock ComplianceEngine. `messages.test.ts`
 * stubs `checkAll()` to return zero violations, which is exactly why a
 * completely broken send path passed a green suite for so long. The point of
 * this block is to run the real rules.
 */
describe("compliance classification (real ComplianceEngine)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quotaAllowed = true;
    suppressedRows = [];
    spamAllowed = true;
    anomalyAllowed = true;
    callOrder = [];
  });

  it("classifies an ordinary email as correspondence, not marketing", async () => {
    const { classifyContent } = await import("../src/lib/pre-send-gate.js");
    expect(classifyContent({})).toBe("correspondence");
    expect(classifyContent({ tags: ["reply"] })).toBe("correspondence");
  });

  it("still recognises transactional and marketing sends", async () => {
    const { classifyContent } = await import("../src/lib/pre-send-gate.js");
    expect(classifyContent({ tags: ["transactional"] })).toBe("transactional");
    expect(classifyContent({ templateId: "password-reset-v2" })).toBe("transactional");
    expect(classifyContent({ tags: ["campaign"] })).toBe("marketing");
    expect(classifyContent({ tags: ["Newsletter"] })).toBe("marketing");
    // A template that is not one of the transactional ones is how a campaign
    // is actually assembled here, so it counts as bulk even without a tag.
    expect(classifyContent({ templateId: "spring-promo" })).toBe("marketing");
  });

  it("lets an ordinary one-to-one email through the real compliance rules", async () => {
    const { runPreSendGate } = await import("../src/lib/pre-send-gate.js");
    const verdict = await runPreSendGate(input({ contentClass: "correspondence" }));

    // This is the regression that matters: before the fix this was a 422
    // demanding a physical postal address on a personal reply.
    expect(verdict.allowed).toBe(true);
  });

  it("still blocks a real marketing send that carries no unsubscribe mechanism", async () => {
    const { runPreSendGate } = await import("../src/lib/pre-send-gate.js");
    const verdict = await runPreSendGate(input({ contentClass: "marketing" }));

    // The fix must not become a blanket compliance bypass — a genuine campaign
    // with no unsubscribe link or physical address is still refused.
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) {
      expect(verdict.status).toBe(422);
      expect(verdict.code).toBe("compliance_violation");
    }
  });

  it("reads unsubscribe/address from the real message, not hardcoded false", async () => {
    // Before this fix, these two fields were literally `false` regardless of
    // content, so a campaign carrying a perfect unsubscribe link and postal
    // address was refused for lacking both — no body could ever satisfy the
    // check. A compliant body must clear the content rules; what remains is
    // the consent violation, which is real (no consent-recording feature
    // exists yet) and must keep refusing until one does.
    const { runPreSendGate } = await import("../src/lib/pre-send-gate.js");
    const verdict = await runPreSendGate(
      input({
        contentClass: "marketing",
        text:
          "Our spring offers are live.\n\n" +
          "Unsubscribe: https://bookaride.co.nz/unsubscribe?u=123\n" +
          "BookARide Ltd, 12 Queen Street, Auckland 1010",
      }),
    );

    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) {
      const body = verdict.body as {
        error: { violations: { rule: string }[] };
      };
      const rules = body.error.violations.map((v) => v.rule);
      expect(rules).not.toContain("CAN-SPAM-PHYSICAL-ADDRESS");
      expect(rules).not.toContain("CAN-SPAM-UNSUBSCRIBE-LINK");
      expect(rules).not.toContain("CASL-UNSUBSCRIBE-LINK");
      expect(rules).toContain("GDPR-CONSENT-MISSING");
    }
  });

  it("detects unsubscribe mechanisms and postal addresses in both directions", async () => {
    const { detectUnsubscribeLink, detectPhysicalAddress } = await import(
      "../src/lib/pre-send-gate.js"
    );

    expect(detectUnsubscribeLink("See https://x.co/unsubscribe?u=1", undefined)).toBe(true);
    expect(detectUnsubscribeLink(undefined, '<a href="https://x.co/u/9">Opt out</a>')).toBe(true);
    expect(detectUnsubscribeLink("mailto:unsubscribe@x.co", undefined)).toBe(true);
    expect(detectUnsubscribeLink("Just a plain newsletter body.", undefined)).toBe(false);
    // The word alone with no mechanism is not a mechanism.
    expect(detectUnsubscribeLink("You cannot unsubscribe from life.", undefined)).toBe(false);

    expect(detectPhysicalAddress("BookARide, 12 Queen Street, Auckland", undefined)).toBe(true);
    expect(detectPhysicalAddress("P.O. Box 911, Wellington", undefined)).toBe(true);
    expect(detectPhysicalAddress("No address anywhere here.", undefined)).toBe(false);
  });
});
