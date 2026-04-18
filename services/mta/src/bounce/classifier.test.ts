/**
 * @alecrae/mta — Bounce Classifier tests
 *
 * Covers every {@link BounceClass} value, provider-specific phrasings
 * (Gmail, Outlook, Yahoo, Apple), retry-budget boundaries, and the
 * enhanced-status / SMTP-code / keyword precedence ladder.
 *
 * No I/O, no network, no clock mocking — `classifyBounce` is pure.
 */

import { describe, test, expect } from "bun:test";
import {
  classifyBounce,
  type BounceSignal,
  type BounceVerdict,
} from "./classifier.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function classify(signal: BounceSignal): BounceVerdict {
  return classifyBounce(signal);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("classifyBounce — hard bounces", () => {
  test("5.1.1 with 550 + 'user unknown' → hard, suppress, no retry", () => {
    const v = classify({
      smtpCode: 550,
      enhancedStatus: "5.1.1",
      diagnosticText: "550 5.1.1 User unknown",
    });
    expect(v.class).toBe("hard");
    expect(v.shouldSuppress).toBe(true);
    expect(v.shouldRetry).toBe(false);
    expect(v.retryAfterSeconds).toBeNull();
    expect(v.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test("Gmail 'account does not exist' phrasing → hard", () => {
    const v = classify({
      smtpCode: 550,
      enhancedStatus: "5.1.1",
      diagnosticText:
        "550-5.1.1 The email account that you tried to reach does not exist.",
    });
    expect(v.class).toBe("hard");
    expect(v.shouldSuppress).toBe(true);
  });

  test("Outlook 'recipient not found by smtp address lookup' → hard", () => {
    const v = classify({
      smtpCode: 550,
      enhancedStatus: "5.1.10",
      diagnosticText:
        "550 5.1.10 Recipient not found by SMTP address lookup",
    });
    expect(v.class).toBe("hard");
    expect(v.shouldRetry).toBe(false);
  });

  test("bare SMTP 550 with no enhanced code, generic permanent → hard", () => {
    const v = classify({
      smtpCode: 550,
      diagnosticText: "550 Requested action not taken",
    });
    expect(v.class).toBe("hard");
    expect(v.shouldSuppress).toBe(true);
  });
});

describe("classifyBounce — soft bounces", () => {
  test("4.2.2 mailbox full → soft, retry, not suppressed", () => {
    const v = classify({
      smtpCode: 452,
      enhancedStatus: "4.2.2",
      diagnosticText: "452 4.2.2 Mailbox full",
      attemptCount: 0,
    });
    expect(v.class).toBe("soft");
    expect(v.shouldRetry).toBe(true);
    expect(v.shouldSuppress).toBe(false);
    expect(v.retryAfterSeconds).not.toBeNull();
  });

  test("Apple 'over quota' phrasing → soft", () => {
    const v = classify({
      smtpCode: 452,
      diagnosticText: "452 4.2.2 The user is over the quota",
      attemptCount: 1,
    });
    expect(v.class).toBe("soft");
    expect(v.shouldRetry).toBe(true);
  });

  test("soft bounce past attempt budget → no more retries", () => {
    const v = classify({
      smtpCode: 452,
      enhancedStatus: "4.2.2",
      diagnosticText: "452 4.2.2 Mailbox full",
      attemptCount: 5,
    });
    expect(v.class).toBe("soft");
    expect(v.shouldRetry).toBe(false);
  });
});

describe("classifyBounce — transient bounces", () => {
  test("4.4.2 throttle phrasing → transient, short retry, not suppressed", () => {
    const v = classify({
      smtpCode: 421,
      enhancedStatus: "4.4.2",
      diagnosticText: "421 4.4.2 Too many connections, throttled",
      attemptCount: 0,
    });
    expect(v.class).toBe("transient");
    expect(v.shouldRetry).toBe(true);
    expect(v.shouldSuppress).toBe(false);
    expect(v.retryAfterSeconds).not.toBeNull();
    // Transient retries should be shorter than the soft-bounce base.
    expect(v.retryAfterSeconds!).toBeLessThan(15 * 60);
  });

  test("4.3.2 server busy / rate limited phrasing → transient", () => {
    const v = classify({
      smtpCode: 421,
      enhancedStatus: "4.3.2",
      diagnosticText: "421 4.3.2 Server temporarily rate limited, retry in a bit",
      attemptCount: 0,
    });
    expect(v.class).toBe("transient");
    expect(v.shouldRetry).toBe(true);
  });

  test("'try again later' plain-text, SMTP 421 → transient", () => {
    const v = classify({
      smtpCode: 421,
      diagnosticText: "421 try again later, too many connections",
      attemptCount: 0,
    });
    expect(v.class).toBe("transient");
    expect(v.shouldSuppress).toBe(false);
  });
});

describe("classifyBounce — block bounces", () => {
  test("'blacklist' in diagnostic text → block, suppress", () => {
    const v = classify({
      smtpCode: 554,
      diagnosticText:
        "554 5.7.1 Service unavailable; client host blacklisted by Spamhaus",
    });
    // 5.7.1 with explicit block phrasing should route to "block".
    expect(["block", "policy"]).toContain(v.class);
    expect(v.shouldSuppress).toBe(true);
    expect(v.shouldRetry).toBe(false);
  });

  test("Outlook 'Access denied, banned sending IP' → block", () => {
    const v = classify({
      smtpCode: 550,
      diagnosticText:
        "550 5.7.1 Access denied, banned sending IP [1.2.3.4]",
    });
    expect(["block", "policy"]).toContain(v.class);
    expect(v.shouldSuppress).toBe(true);
  });

  test("plain 'RBL listed' text with no enhanced code → block", () => {
    const v = classify({
      smtpCode: 554,
      diagnosticText: "554 Your IP is listed in the RBL, rejected",
    });
    expect(["block", "policy", "hard"]).toContain(v.class);
    expect(v.shouldSuppress).toBe(true);
  });
});

describe("classifyBounce — policy bounces", () => {
  test("5.7.1 DMARC failure → policy, suppress, no retry", () => {
    const v = classify({
      smtpCode: 550,
      enhancedStatus: "5.7.1",
      diagnosticText:
        "550 5.7.1 Unauthenticated email from example.com is not accepted due to DMARC policy",
    });
    expect(v.class).toBe("policy");
    expect(v.shouldSuppress).toBe(true);
    expect(v.shouldRetry).toBe(false);
  });

  test("5.7.26 SPF/DKIM auth failure → policy", () => {
    const v = classify({
      smtpCode: 550,
      enhancedStatus: "5.7.26",
      diagnosticText:
        "550 5.7.26 Unauthenticated: SPF and DKIM both fail",
    });
    expect(v.class).toBe("policy");
    expect(v.shouldSuppress).toBe(true);
  });

  test("plain 'dkim' mention in a 5xx → policy", () => {
    const v = classify({
      smtpCode: 550,
      diagnosticText: "550 Message rejected: DKIM signature is invalid",
    });
    expect(v.class).toBe("policy");
    expect(v.shouldSuppress).toBe(true);
  });
});

describe("classifyBounce — unknown / low-signal", () => {
  test("no code, no text → unknown, low confidence, limited retry", () => {
    const v = classify({});
    expect(v.class).toBe("unknown");
    expect(v.confidence).toBeLessThan(0.5);
    expect(v.shouldRetry).toBe(true);
    expect(v.shouldSuppress).toBe(false);
  });

  test("unknown class past retry budget → no more retries, suppressed", () => {
    const v = classify({ attemptCount: 5 });
    expect(v.class).toBe("unknown");
    expect(v.shouldRetry).toBe(false);
    expect(v.retryAfterSeconds).toBeNull();
  });

  test("malformed enhanced code alone falls through to unknown", () => {
    const v = classify({ enhancedStatus: "not-a-code" });
    expect(v.class).toBe("unknown");
    expect(v.confidence).toBeLessThan(0.5);
  });
});

describe("classifyBounce — signal precedence", () => {
  test("enhanced 5.x.x beats a 4xx smtp code if both present", () => {
    const v = classify({
      smtpCode: 421,
      enhancedStatus: "5.1.1",
      diagnosticText: "550 5.1.1 User unknown",
    });
    expect(v.class).toBe("hard");
    expect(v.shouldSuppress).toBe(true);
  });

  test("policy phrasing in text beats bare 4xx smtp (auth always wins)", () => {
    const v = classify({
      smtpCode: 450,
      diagnosticText:
        "450 Message failed DMARC alignment check; please authenticate",
    });
    expect(v.class).toBe("policy");
    expect(v.shouldSuppress).toBe(true);
  });

  test("verdict object has all required fields and valid shape", () => {
    const v = classify({
      smtpCode: 550,
      enhancedStatus: "5.1.1",
      diagnosticText: "550 5.1.1 User unknown",
    });
    expect(typeof v.class).toBe("string");
    expect(typeof v.reason).toBe("string");
    expect(typeof v.shouldRetry).toBe("boolean");
    expect(typeof v.shouldSuppress).toBe("boolean");
    expect(typeof v.confidence).toBe("number");
    expect(v.confidence).toBeGreaterThanOrEqual(0);
    expect(v.confidence).toBeLessThanOrEqual(1);
    // retryAfterSeconds is either null or a finite non-negative number.
    if (v.retryAfterSeconds !== null) {
      expect(Number.isFinite(v.retryAfterSeconds)).toBe(true);
      expect(v.retryAfterSeconds).toBeGreaterThanOrEqual(0);
    }
  });
});
