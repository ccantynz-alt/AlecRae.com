/**
 * Tests for the core inbound message handler (inbound-handler.ts):
 *
 *  - defer verdicts throw a typed 451 and store NOTHING (previously deferred
 *    mail was stored to the inbox and answered 250 — silently accepting mail
 *    the filter pipeline could not evaluate).
 *  - reject verdicts throw a typed 550 whose message carries no filter detail.
 *  - clean mail is still stored and completes without throwing.
 *  - bounce-domain recipients are consumed by DSN processing and never stored;
 *    a non-DSN message to a bounce domain is dropped without error (never
 *    bounce a bounce).
 *  - forward rules deliver locally instead of silently losing the message.
 */

import { describe, it, expect, vi } from "vitest";
import { createInboundHandler, localizeForwardResolution } from "../src/inbound-handler.js";
import { SmtpError } from "../src/errors.js";
import type {
  ParsedEmail,
  FilterVerdict,
  ResolvedRecipient,
  SmtpSession,
  SmtpEnvelope,
  StoredEmail,
} from "../src/types.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeParsed(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    messageId: "<msg-1@remote.example>",
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

function makeVerdict(
  action: FilterVerdict["action"],
  reason?: string,
  score?: number,
): FilterVerdict {
  return { action, reason, score, flags: new Set(), authResults: [] };
}

function makeSession(overrides: Partial<SmtpSession> = {}): SmtpSession {
  return {
    id: "sess-1",
    remoteAddress: "203.0.113.9",
    remotePort: 4242,
    secure: false,
    rcptTo: ["user@example.com"],
    startedAt: new Date(),
    ...overrides,
  };
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

interface RecordingStore {
  store: (
    email: ParsedEmail,
    recipient: ResolvedRecipient,
    verdict: FilterVerdict,
  ) => Promise<StoredEmail>;
  calls: { email: ParsedEmail; recipient: ResolvedRecipient; verdict: FilterVerdict }[];
}

function makeStore(): RecordingStore {
  const calls: RecordingStore["calls"] = [];
  return {
    calls,
    store: async (email, recipient, verdict): Promise<StoredEmail> => {
      calls.push({ email, recipient, verdict });
      return {
        id: `stored-${calls.length}`,
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
  };
}

interface HandlerSetup {
  store: RecordingStore;
  processDsn: ReturnType<typeof vi.fn>;
  pipelineProcess: ReturnType<typeof vi.fn>;
  routerResolve: ReturnType<typeof vi.fn>;
  handler: ReturnType<typeof createInboundHandler>;
}

function setup(options: {
  parsed?: ParsedEmail;
  verdict?: FilterVerdict;
  resolutions?: Map<string, ResolvedRecipient | null>;
  isDsn?: boolean;
}): HandlerSetup {
  const parsed = options.parsed ?? makeParsed();
  const verdict = options.verdict ?? makeVerdict("accept");
  const resolutions =
    options.resolutions ??
    new Map<string, ResolvedRecipient | null>([["user@example.com", makeResolution()]]);

  const store = makeStore();
  const processDsn = vi.fn().mockResolvedValue(undefined);
  const pipelineProcess = vi.fn().mockResolvedValue(verdict);
  const routerResolve = vi.fn().mockResolvedValue(resolutions);

  const handler = createInboundHandler({
    parser: { parse: async (): Promise<ParsedEmail> => parsed },
    pipeline: { process: pipelineProcess },
    router: { resolve: routerResolve },
    store,
    detectDsn: (): boolean => options.isDsn ?? false,
    processDsn,
  });

  return { store, processDsn, pipelineProcess, routerResolve, handler };
}

const RAW = new TextEncoder().encode("Subject: hello\r\n\r\nbody");

function makeEnvelope(rcptTo: string[] = ["user@example.com"]): SmtpEnvelope {
  return { mailFrom: "sender@remote.example", rcptTo };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("inbound handler — verdict handling", () => {
  it("stores clean mail and completes without throwing", async () => {
    const s = setup({ verdict: makeVerdict("accept") });
    await expect(s.handler(makeSession(), makeEnvelope(), RAW)).resolves.toBeUndefined();
    expect(s.store.calls).toHaveLength(1);
  });

  it("throws a typed 451 for a defer verdict and stores nothing", async () => {
    const s = setup({ verdict: makeVerdict("defer", "Filter error in stage 'spf'") });
    const promise = s.handler(makeSession(), makeEnvelope(), RAW);
    await expect(promise).rejects.toBeInstanceOf(SmtpError);
    await promise.catch((err: unknown) => {
      if (!(err instanceof SmtpError)) throw err;
      expect(err.code).toBe(451);
      // Generic on the wire — the stage name must not leak.
      expect(err.message).not.toContain("spf");
    });
    expect(s.store.calls).toHaveLength(0);
    expect(s.routerResolve).not.toHaveBeenCalled();
  });

  it("throws a typed 550 for a reject verdict with no filter detail in the message", async () => {
    const s = setup({ verdict: makeVerdict("reject", "Spam score 9.9 exceeds threshold", 9.9) });
    const promise = s.handler(makeSession(), makeEnvelope(), RAW);
    await expect(promise).rejects.toBeInstanceOf(SmtpError);
    await promise.catch((err: unknown) => {
      if (!(err instanceof SmtpError)) throw err;
      expect(err.code).toBe(550);
      expect(err.message).not.toContain("9.9");
      expect(err.message).not.toContain("Spam score");
    });
    expect(s.store.calls).toHaveLength(0);
  });

  it("still stores quarantined mail (quarantine is delivery, not refusal)", async () => {
    const s = setup({ verdict: makeVerdict("quarantine", "Spam score above quarantine") });
    await expect(s.handler(makeSession(), makeEnvelope(), RAW)).resolves.toBeUndefined();
    expect(s.store.calls).toHaveLength(1);
  });
});

describe("inbound handler — bounce-domain recipients", () => {
  const BOUNCE_RCPT = "bounces+em42@bounce.example.com";

  it("processes a DSN to a bounce-domain recipient and stores nothing", async () => {
    const s = setup({ isDsn: true, resolutions: new Map() });
    const session = makeSession({ rcptTo: [BOUNCE_RCPT], bounceRcptTo: [BOUNCE_RCPT] });
    await expect(s.handler(session, makeEnvelope([BOUNCE_RCPT]), RAW)).resolves.toBeUndefined();

    expect(s.processDsn).toHaveBeenCalledTimes(1);
    expect(s.processDsn).toHaveBeenCalledWith(expect.any(String), BOUNCE_RCPT);
    expect(s.store.calls).toHaveLength(0);
    // Bounce-only mail skips the filter entirely — nothing to store, and a
    // reject verdict must never bounce a bounce.
    expect(s.pipelineProcess).not.toHaveBeenCalled();
  });

  it("drops a non-DSN message to a bounce domain without storing and without error", async () => {
    const s = setup({ isDsn: false, resolutions: new Map() });
    const session = makeSession({ rcptTo: [BOUNCE_RCPT], bounceRcptTo: [BOUNCE_RCPT] });
    await expect(s.handler(session, makeEnvelope([BOUNCE_RCPT]), RAW)).resolves.toBeUndefined();

    expect(s.processDsn).not.toHaveBeenCalled();
    expect(s.store.calls).toHaveLength(0);
  });

  it("delivers to mailbox recipients while consuming the bounce-domain one", async () => {
    const s = setup({
      isDsn: true,
      resolutions: new Map<string, ResolvedRecipient | null>([
        ["user@example.com", makeResolution()],
      ]),
    });
    const session = makeSession({
      rcptTo: [BOUNCE_RCPT, "user@example.com"],
      bounceRcptTo: [BOUNCE_RCPT],
    });
    await s.handler(session, makeEnvelope([BOUNCE_RCPT, "user@example.com"]), RAW);

    // The router only ever sees the real mailbox recipient.
    expect(s.routerResolve).toHaveBeenCalledWith(["user@example.com"]);
    expect(s.store.calls).toHaveLength(1);
    expect(s.processDsn).toHaveBeenCalledTimes(1);
  });
});

describe("inbound handler — forward rules", () => {
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
      resolutions: new Map<string, ResolvedRecipient | null>([
        ["user@example.com", forwardResolution],
      ]),
    });

    await expect(s.handler(makeSession(), makeEnvelope(), RAW)).resolves.toBeUndefined();

    // The message is KEPT: stored under the local (hosted) address, never
    // under the external forward target (which would create a domains row
    // for a domain we do not host).
    expect(s.store.calls).toHaveLength(1);
    const storedRecipient = s.store.calls[0]?.recipient;
    expect(storedRecipient?.resolvedAddress).toBe("user@example.com");
    expect(storedRecipient?.mailboxId).toBe("inbox");
  });

  it("localizeForwardResolution keeps account and original address", () => {
    const localized = localizeForwardResolution(
      makeResolution({
        originalAddress: "user@example.com",
        resolvedAddress: "elsewhere@other-provider.example",
        mailboxId: "forward:elsewhere@other-provider.example",
      }),
    );
    expect(localized.resolvedAddress).toBe("user@example.com");
    expect(localized.mailboxId).toBe("inbox");
    expect(localized.accountId).toBe("acct-1");
  });
});
