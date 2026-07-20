/**
 * Tests for mapVerdictToDbClassification (services/mta/src/worker.ts),
 * which maps the fully-built bounce/classifier.ts's BounceVerdict onto the
 * DB's bounceType/bounceCategory enums. Previously classifier.ts was
 * called from nowhere — every delivery event's bounceType/bounceCategory
 * was always null (issue #113(d)).
 */

import { describe, it, expect } from "bun:test";
import { mapVerdictToDbClassification } from "../src/worker.js";
import { classifyBounce } from "../src/bounce/classifier.js";

describe("mapVerdictToDbClassification", () => {
  it("maps a hard 5.1.1 user-unknown bounce to hard/unknown_user", () => {
    const verdict = classifyBounce({ smtpCode: 550, enhancedStatus: "5.1.1", diagnosticText: "User unknown" });
    const result = mapVerdictToDbClassification(verdict);
    expect(result.bounceType).toBe("hard");
    expect(result.bounceCategory).toBe("unknown_user");
  });

  it("maps a mailbox-full bounce to soft/mailbox_full", () => {
    const verdict = classifyBounce({ smtpCode: 452, diagnosticText: "mailbox full, quota exceeded" });
    const result = mapVerdictToDbClassification(verdict);
    expect(result.bounceCategory).toBe("mailbox_full");
  });

  it("maps a spamhaus/blocklist bounce to hard/spam_block", () => {
    const verdict = classifyBounce({ smtpCode: 550, diagnosticText: "blocked by spamhaus" });
    const result = mapVerdictToDbClassification(verdict);
    expect(result.bounceType).toBe("hard");
    expect(result.bounceCategory).toBe("spam_block");
  });

  it("maps a rate-limit/throttle bounce to soft/rate_limited", () => {
    const verdict = classifyBounce({ smtpCode: 421, diagnosticText: "rate limit exceeded, try again later" });
    const result = mapVerdictToDbClassification(verdict);
    expect(result.bounceType).toBe("soft");
    expect(result.bounceCategory).toBe("rate_limited");
  });

  it("always returns a value from the DB's bounceCategory enum", () => {
    const enumValues = [
      "unknown_user", "mailbox_full", "domain_not_found", "policy_rejection",
      "spam_block", "rate_limited", "protocol_error", "content_rejected",
      "authentication_failed", "other",
    ];
    for (const smtpCode of [421, 450, 550, 552, 553]) {
      const result = mapVerdictToDbClassification(classifyBounce({ smtpCode }));
      expect(enumValues).toContain(result.bounceCategory);
      expect(["hard", "soft"]).toContain(result.bounceType);
    }
  });
});
