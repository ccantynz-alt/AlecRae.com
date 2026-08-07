/**
 * Tests for the HTTP inbound webhook (http-inbound.ts):
 *
 *  - FAIL-CLOSED auth: with no webhook secret configured the endpoints
 *    refuse with 503 (previously they accepted unauthenticated POSTs on
 *    0.0.0.0 — anyone reaching the port could inject "received" mail).
 *  - defer verdicts answer 503 (temporary failure) and store NOTHING
 *    (previously deferred mail was stored and answered 200).
 *  - DSN detection/processing runs on both HTTP paths, mirroring the SMTP
 *    path's ordering (before the filter).
 *  - forward rules deliver locally instead of silently losing the message.
 */

import { describe, it, expect, vi } from "vitest";
import { createHttpInbound } from "../src/http-inbound.js";
import type {
  ParsedEmail,
  FilterVerdict,
  ResolvedRecipient,
  StoredEmail,
} from "../src/types.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

const SECRET = "test-webhook-secret";

function makeParsed(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    messageId: "<msg-http-1@remote.example>",
    from: [{ address: "sender@remote.example" }],
    to: [{ address: "user@example.com" }],
    cc: [],
    bcc: [],
    replyTo: [],
    subject: "hello",
    references: [],
    headers: [{ key: "Content-Type", value: "text/plain" }],
    text: "body",
    attachments: [],
    rawSize: 100,
    ...overrides,
  };
}

function makeVerdict(action: FilterVerdict["action"], reason?: string): FilterVerdict {
  return { action, reason, score: 0, flags: new Set(), authResults: [] };
}

function makeResolution(overrides: Partial<ResolvedRecipient> = {}): ResolvedRecipient {
  return {
    originalAddress: "user@example.com",
    resolvedAddress: "user@example.com",
    mailboxId: "mbx-1",
    accountId: "acct-1",
    rule: {
      id: "mailbox:mbx-1",
      pattern: "user@example.com",
      type: "exact",
      action: "deliver",
      destination: "mbx-1",
      priority: 0,
    },
    ...overrides,
  };
}

interface AppSetup {
  app: ReturnType<typeof createHttpInbound>;
  storeCalls: { recipient: ResolvedRecipient; verdict: FilterVerdict }[];
  processDsn: ReturnType<typeof vi.fn>;
}

function setup(options: {
  secret?: string | undefined;
  parsed?: ParsedEmail;
  verdict?: FilterVerdict;
  resolutions?: Map<string, ResolvedRecipient | null>;
  isDsn?: boolean;
}): AppSetup {
  const parsed = options.parsed ?? makeParsed();
  const verdict = options.verdict ?? makeVerdict("accept");
  const resolutions =
    options.resolutions ??
    new Map<string, ResolvedRecipient | null>([["user@example.com", makeResolution()]]);

  const storeCalls: AppSetup["storeCalls"] = [];
  const processDsn = vi.fn().mockResolvedValue(undefined);

  const app = createHttpInbound({
    parser: { parse: async (): Promise<ParsedEmail> => parsed },
    pipeline: { process: vi.fn().mockResolvedValue(verdict) },
    router: { resolve: vi.fn().mockResolvedValue(resolutions) },
    store: {
      store: async (
        email: ParsedEmail,
        recipient: ResolvedRecipient,
        v: FilterVerdict,
      ): Promise<StoredEmail> => {
        storeCalls.push({ recipient, verdict: v });
        return {
          id: `stored-${storeCalls.length}`,
          accountId: recipient.accountId,
          mailboxId: recipient.mailboxId,
          messageId: email.messageId,
          from: email.from,
          to: email.to,
          cc: email.cc,
          subject: email.subject,
          snippet: "",
          size: email.rawSize,
          flags: new Set<string>(),
          labels: [],
          receivedAt: new Date(),
          internalDate: new Date(),
        };
      },
    },
    webhookSecret: options.secret,
    detectDsn: (): boolean => options.isDsn ?? false,
    processDsn,
  });

  return { app, storeCalls, processDsn };
}

const RAW_BODY = "Subject: hello\r\nFrom: sender@remote.example\r\n\r\nbody";

function singleRequest(app: AppSetup["app"], headers: Record<string, string> = {}): Promise<Response> {
  return app.request("/inbound/webhook", {
    method: "POST",
    body: RAW_BODY,
    headers: {
      "Content-Type": "message/rfc822",
      "X-Envelope-From": "sender@remote.example",
      "X-Envelope-To": "user@example.com",
      ...headers,
    },
  });
}

function batchRequest(app: AppSetup["app"], headers: Record<string, string> = {}): Promise<Response> {
  return app.request("/inbound/webhook/batch", {
    method: "POST",
    body: JSON.stringify({
      messages: [
        {
          raw: btoa(RAW_BODY),
          envelope: { from: "sender@remote.example", to: ["user@example.com"] },
        },
      ],
    }),
    headers: { "Content-Type": "application/json", ...headers },
  });
}

const AUTH = { Authorization: `Bearer ${SECRET}` };

// ── Tests ───────────────────────────────────────────────────────────────────

describe("HTTP inbound — fail-closed auth", () => {
  it("refuses the single-message endpoint with 503 when no secret is configured", async () => {
    const s = setup({ secret: undefined });
    const res = await singleRequest(s.app);
    expect(res.status).toBe(503);
    expect(s.storeCalls).toHaveLength(0);
  });

  it("refuses the batch endpoint with 503 when no secret is configured", async () => {
    const s = setup({ secret: undefined });
    const res = await batchRequest(s.app);
    expect(res.status).toBe(503);
    expect(s.storeCalls).toHaveLength(0);
  });

  it("still serves the health check without a secret", async () => {
    const s = setup({ secret: undefined });
    const res = await s.app.request("/inbound/health");
    expect(res.status).toBe(200);
  });

  it("rejects a wrong token with 401", async () => {
    const s = setup({ secret: SECRET });
    const res = await singleRequest(s.app, { Authorization: "Bearer wrong" });
    expect(res.status).toBe(401);
  });

  it("accepts a correct bearer token", async () => {
    const s = setup({ secret: SECRET });
    const res = await singleRequest(s.app, AUTH);
    expect(res.status).toBe(200);
    expect(s.storeCalls).toHaveLength(1);
  });
});

describe("HTTP inbound — verdict handling", () => {
  it("answers 503 for a defer verdict and stores nothing", async () => {
    const s = setup({ secret: SECRET, verdict: makeVerdict("defer", "Filter error in stage 'dkim'") });
    const res = await singleRequest(s.app, AUTH);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("deferred");
    expect(s.storeCalls).toHaveLength(0);
  });

  it("answers 422 for a reject verdict and stores nothing", async () => {
    const s = setup({ secret: SECRET, verdict: makeVerdict("reject", "spam") });
    const res = await singleRequest(s.app, AUTH);
    expect(res.status).toBe(422);
    expect(s.storeCalls).toHaveLength(0);
  });

  it("batch: reports a deferred message as 'deferred' and stores nothing", async () => {
    const s = setup({ secret: SECRET, verdict: makeVerdict("defer", "Filter error") });
    const res = await batchRequest(s.app, AUTH);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: { status: string }[] };
    expect(body.results[0]?.status).toBe("deferred");
    expect(s.storeCalls).toHaveLength(0);
  });

  it("batch: still accepts and stores clean mail", async () => {
    const s = setup({ secret: SECRET });
    const res = await batchRequest(s.app, AUTH);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: { status: string }[] };
    expect(body.results[0]?.status).toBe("accepted");
    expect(s.storeCalls).toHaveLength(1);
  });
});

describe("HTTP inbound — DSN processing", () => {
  it("runs DSN processing on the single-message path with the envelope recipient", async () => {
    const s = setup({ secret: SECRET, isDsn: true });
    const res = await singleRequest(s.app, AUTH);
    expect(res.status).toBe(200);
    expect(s.processDsn).toHaveBeenCalledTimes(1);
    expect(s.processDsn).toHaveBeenCalledWith(expect.any(String), "user@example.com");
  });

  it("runs DSN processing on the batch path", async () => {
    const s = setup({ secret: SECRET, isDsn: true });
    const res = await batchRequest(s.app, AUTH);
    expect(res.status).toBe(200);
    expect(s.processDsn).toHaveBeenCalledTimes(1);
    expect(s.processDsn).toHaveBeenCalledWith(expect.any(String), "user@example.com");
  });

  it("does not run DSN processing for ordinary mail", async () => {
    const s = setup({ secret: SECRET, isDsn: false });
    await singleRequest(s.app, AUTH);
    expect(s.processDsn).not.toHaveBeenCalled();
  });

  it("runs DSN processing even when the filter would defer (ordering: DSN before filter)", async () => {
    const s = setup({ secret: SECRET, isDsn: true, verdict: makeVerdict("defer", "Filter error") });
    const res = await singleRequest(s.app, AUTH);
    expect(res.status).toBe(503);
    // Suppression still updated — a spam-scored or deferred DSN must not
    // lose its bounce signal.
    expect(s.processDsn).toHaveBeenCalledTimes(1);
  });
});

describe("HTTP inbound — forward rules", () => {
  it("delivers a forward-ruled message locally instead of losing it", async () => {
    const forwardResolution = makeResolution({
      originalAddress: "user@example.com",
      resolvedAddress: "elsewhere@other-provider.example",
      mailboxId: "forward:elsewhere@other-provider.example",
      rule: {
        id: "rule-fwd",
        pattern: "user@example.com",
        type: "exact",
        action: "forward",
        destination: "elsewhere@other-provider.example",
        priority: 1,
      },
    });
    const s = setup({
      secret: SECRET,
      resolutions: new Map<string, ResolvedRecipient | null>([
        ["user@example.com", forwardResolution],
      ]),
    });

    const res = await singleRequest(s.app, AUTH);
    expect(res.status).toBe(200);
    expect(s.storeCalls).toHaveLength(1);
    expect(s.storeCalls[0]?.recipient.resolvedAddress).toBe("user@example.com");
    expect(s.storeCalls[0]?.recipient.mailboxId).toBe("inbox");
  });
});
