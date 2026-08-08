/**
 * Tests for relay-mode delivery routing (routing.ts).
 *
 * The worker's job handler has no BullMQ+Postgres harness, so — as with
 * `requireDkim` and `senderDomainWhere` — what is pinned here is the exported
 * decision logic the handler executes: which recipients go direct, which
 * relay, which defer, and what a relay failure does to each mode.
 *
 * Truthful path recording follows from these decisions: the worker writes
 * `mxHost: relay:<provider>` for every recipient in the plan's `relay` list
 * and the real MX host for every recipient in `direct`, so pinning the
 * partition pins what delivery_results will say.
 *
 * Verified here:
 *  1. Mode parsing: default "all", exact values only, unrecognized values
 *     fall back to "all" with a warning (the MTA_REQUIRE_DKIM pattern)
 *  2. "all" mode never consults the warm-up gate — relay sends consume no
 *     warm-up quota (the deliberate behaviour change of this feature)
 *  3. "overflow" sends direct within caps and via relay beyond them, within
 *     one multi-recipient job
 *  4. Overflow relay failure → deferral, never loss; "all" keeps the
 *     historical 5xx-bounces / transient-defers split
 *  5. Non-cap outcomes are unaffected by overflow: allowed recipients are
 *     never diverted to the relay, suppressed recipients never send or
 *     consume quota, and with no relay a cap refusal still defers
 */

import { describe, it, expect, vi } from "vitest";
import {
  relayModeFromEnv,
  planDelivery,
  relayFailureOutcome,
} from "./routing.js";
import { WarmupGate } from "./warmup-gate.js";

/** Fixed instant so the warm-up day (day 1: Gmail cap 50) is deterministic. */
const T0 = Date.parse("2026-03-02T09:00:00.000Z");

function realGate(): WarmupGate {
  return new WarmupGate({
    identity: "203.0.113.9",
    warmupStartedAt: T0,
    enabled: true,
    redis: null,
  });
}

function recipients(n: number, domain = "gmail.com"): string[] {
  return Array.from({ length: n }, (_, i) => `user${i}@${domain}`);
}

const NONE: ReadonlySet<string> = new Set();

// ─── Mode parsing ───────────────────────────────────────────────────────────

describe("relayModeFromEnv", () => {
  it('defaults to "all" when the variable is unset or empty', () => {
    expect(relayModeFromEnv({})).toBe("all");
    expect(relayModeFromEnv({ MTA_RELAY_MODE: "" })).toBe("all");
    expect(relayModeFromEnv({ MTA_RELAY_MODE: "   " })).toBe("all");
  });

  it("accepts the two known values, case-insensitively", () => {
    expect(relayModeFromEnv({ MTA_RELAY_MODE: "all" })).toBe("all");
    expect(relayModeFromEnv({ MTA_RELAY_MODE: "overflow" })).toBe("overflow");
    expect(relayModeFromEnv({ MTA_RELAY_MODE: "ALL" })).toBe("all");
    expect(relayModeFromEnv({ MTA_RELAY_MODE: "  Overflow  " })).toBe("overflow");
  });

  it('treats an unrecognized value as "all" and warns loudly', () => {
    // Only exact expected values change behaviour (MTA_REQUIRE_DKIM
    // precedent). "all" is the safe fallback: mail still leaves via the
    // relay's warm IPs rather than deferring or blasting a cold IP direct.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(relayModeFromEnv({ MTA_RELAY_MODE: "overfow" })).toBe("all");
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes('MTA_RELAY_MODE="overfow"')),
    ).toBe(true);
    warn.mockRestore();
  });
});

// ─── "all" mode ─────────────────────────────────────────────────────────────

describe('planDelivery — mode "all" with a relay', () => {
  it("routes every non-suppressed recipient via the relay and never consults the warm-up gate", async () => {
    const reserve = vi.fn();
    const plan = await planDelivery({
      recipients: recipients(300),
      suppressedSet: NONE,
      mode: "all",
      relayAvailable: true,
      gate: { reserve },
      now: T0,
    });

    expect(plan.relay).toHaveLength(300);
    expect(plan.direct).toHaveLength(0);
    expect(plan.deferredByWarmup).toHaveLength(0);
    expect(reserve).not.toHaveBeenCalled();
  });

  it("consumes NO warm-up quota for relayed mail — the ramp counters stay clean", async () => {
    // This pins the deliberate behaviour change: relay sends used to reserve
    // warm-up quota even though they leave on the relay's IPs, throttling
    // mail that poses no risk to our reputation and polluting the counters
    // with sends our IP never made.
    const gate = realGate();

    // Relay 200 Gmail recipients — 4× the day-1 direct cap of 50.
    const relayed = await planDelivery({
      recipients: recipients(200),
      suppressedSet: NONE,
      mode: "all",
      relayAvailable: true,
      gate,
      now: T0,
    });
    expect(relayed.relay).toHaveLength(200);

    // The full direct cap must still be available afterwards.
    const after = await planDelivery({
      recipients: recipients(50, "gmail.com"),
      suppressedSet: NONE,
      mode: "overflow",
      relayAvailable: true,
      gate,
      now: T0,
    });
    expect(after.direct).toHaveLength(50);
    expect(after.relay).toHaveLength(0);
  });

  it("still drops suppressed recipients rather than relaying them", async () => {
    const plan = await planDelivery({
      recipients: ["Blocked@Example.com", "ok@example.com"],
      suppressedSet: new Set(["blocked@example.com"]),
      mode: "all",
      relayAvailable: true,
      gate: { reserve: vi.fn() },
      now: T0,
    });
    expect(plan.suppressed).toEqual(["Blocked@Example.com"]);
    expect(plan.relay).toEqual(["ok@example.com"]);
  });
});

// ─── "overflow" mode ────────────────────────────────────────────────────────

describe('planDelivery — mode "overflow" with a relay', () => {
  it("sends direct within the warm-up caps and via relay beyond them, in one job", async () => {
    const gate = realGate();
    // 60 Gmail recipients against a day-1 Gmail cap of 50.
    const plan = await planDelivery({
      recipients: recipients(60),
      suppressedSet: NONE,
      mode: "overflow",
      relayAvailable: true,
      gate,
      now: T0,
    });

    expect(plan.direct).toHaveLength(50);
    expect(plan.relay).toHaveLength(10);
    expect(plan.deferredByWarmup).toHaveLength(0);
    // The IP warms at exactly the safe rate: quota is fully consumed...
    const next = await planDelivery({
      recipients: ["one-more@gmail.com"],
      suppressedSet: NONE,
      mode: "overflow",
      relayAvailable: true,
      gate,
      now: T0,
    });
    // ...so the next Gmail recipient today also overflows to the relay.
    expect(next.relay).toEqual(["one-more@gmail.com"]);
  });

  it("never diverts a within-cap recipient to the relay — overflow is cap refusals only", async () => {
    const gate = realGate();
    const plan = await planDelivery({
      recipients: recipients(10),
      suppressedSet: NONE,
      mode: "overflow",
      relayAvailable: true,
      gate,
      now: T0,
    });
    expect(plan.direct).toHaveLength(10);
    expect(plan.relay).toHaveLength(0);
  });

  it("suppressed recipients neither send nor consume quota in overflow mode", async () => {
    const gate = realGate();
    const suppressedSet = new Set(
      recipients(50).map((r) => r.toLowerCase()),
    );
    const plan = await planDelivery({
      recipients: [...recipients(50), "fresh@gmail.com"],
      suppressedSet,
      mode: "overflow",
      relayAvailable: true,
      gate,
      now: T0,
    });
    expect(plan.suppressed).toHaveLength(50);
    // The 50 suppressed recipients consumed nothing, so the fresh one still
    // fits under the day-1 cap and goes direct — not relay.
    expect(plan.direct).toEqual(["fresh@gmail.com"]);
    expect(plan.relay).toHaveLength(0);
  });
});

// ─── No relay configured ────────────────────────────────────────────────────

describe("planDelivery — no relay available", () => {
  it("defers over-cap recipients to the UTC-midnight reset, unchanged, in any mode", async () => {
    for (const mode of ["all", "overflow"] as const) {
      const gate = realGate();
      const plan = await planDelivery({
        recipients: recipients(55),
        suppressedSet: NONE,
        mode,
        relayAvailable: false,
        gate,
        now: T0,
      });
      expect(plan.direct).toHaveLength(50);
      expect(plan.relay).toHaveLength(0);
      expect(plan.deferredByWarmup).toHaveLength(5);
      for (const d of plan.deferredByWarmup) {
        expect(d.reason).toMatch(/gmail daily cap/i);
      }
    }
  });
});

// ─── Relay failure handling ─────────────────────────────────────────────────

describe("relayFailureOutcome", () => {
  it('mode "all": a 5xx relay rejection bounces (historical behaviour preserved)', () => {
    expect(
      relayFailureOutcome({ mode: "all", error: "550 Mailbox unavailable" }),
    ).toBe("bounced");
  });

  it('mode "all": a transient relay failure defers for retry', () => {
    expect(
      relayFailureOutcome({ mode: "all", error: "421 Service not available" }),
    ).toBe("deferred");
    expect(relayFailureOutcome({ mode: "all", error: undefined })).toBe("deferred");
  });

  it('mode "overflow": ANY relay failure defers — cap-refused mail is never lost to a relay error', () => {
    // Overflow recipients are in the relay batch only because the warm-up
    // cap refused them; nothing judged the message undeliverable. The retry
    // re-plans and can go direct MX once quota returns at UTC midnight, so
    // deferral — not a bounce — is the truthful, no-loss outcome.
    expect(
      relayFailureOutcome({ mode: "overflow", error: "550 Mailbox unavailable" }),
    ).toBe("deferred");
    expect(
      relayFailureOutcome({ mode: "overflow", error: "421 Service not available" }),
    ).toBe("deferred");
    expect(relayFailureOutcome({ mode: "overflow", error: undefined })).toBe("deferred");
  });
});
