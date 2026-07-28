/**
 * Tests for the "never send unsigned" policy (worker.ts `requireDkim`).
 *
 * DKIM signing used to fail OPEN: a domain with no key, or a signing error,
 * logged a warning and the message went out unsigned. Gmail and Yahoo require
 * DKIM from bulk senders, and alecrae.com publishes DMARC p=quarantine — so an
 * unsigned message has only SPF to fall back on, and SPF breaks on any
 * forwarded path where DKIM would have survived. Unsigned mail costs the
 * reputation of every domain sharing the IP.
 *
 * The gate itself lives in the worker's job handler, which has no test harness
 * (BullMQ + Postgres). What is pinned here is the policy decision — the part a
 * future change could silently flip back to permissive.
 */

import { describe, it, expect } from "vitest";
import { requireDkim } from "../src/worker.js";

describe("requireDkim — default posture", () => {
  it("requires DKIM when the variable is unset", () => {
    // The whole point: forgetting to configure this must not mean
    // "send unsigned".
    expect(requireDkim({})).toBe(true);
  });

  it("requires DKIM when the variable is empty", () => {
    expect(requireDkim({ MTA_REQUIRE_DKIM: "" })).toBe(true);
    expect(requireDkim({ MTA_REQUIRE_DKIM: "   " })).toBe(true);
  });
});

describe("requireDkim — explicit opt-out", () => {
  it("allows unsigned sending only on an exact opt-out", () => {
    expect(requireDkim({ MTA_REQUIRE_DKIM: "false" })).toBe(false);
    expect(requireDkim({ MTA_REQUIRE_DKIM: "FALSE" })).toBe(false);
    expect(requireDkim({ MTA_REQUIRE_DKIM: "  False  " })).toBe(false);
  });

  it("treats any other value as 'required' rather than guessing", () => {
    // A typo must fail safe. "0", "no" and "off" all read as disabling to a
    // human, and all of them leave enforcement ON here deliberately — the
    // operator gets working mail plus a loud log, not silent unsigned sending.
    for (const value of ["true", "0", "no", "off", "disabled", "yes", "1"]) {
      expect(requireDkim({ MTA_REQUIRE_DKIM: value })).toBe(true);
    }
  });
});
