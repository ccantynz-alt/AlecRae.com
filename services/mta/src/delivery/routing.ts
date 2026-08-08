/**
 * @alecrae/mta — Relay-mode delivery routing
 *
 * Decides, per recipient, which path a message leaves the building on:
 * direct MX from our own IP, or through the configured relay provider.
 * The worker executes the plan; this module owns the decisions, so the
 * load-bearing routing logic is testable without a BullMQ+Postgres harness
 * (same approach as `requireDkim` / `senderDomainWhere` in worker.ts).
 *
 * ── The three effective modes ───────────────────────────────────────────
 *
 * `MTA_RELAY_MODE` only matters when `RELAY_PROVIDER` is configured:
 *
 *  - "all" (default): everything relays. The warm-up gate is NOT consulted
 *    for relayed mail — the reputation of a relayed send accrues to the
 *    relay's already-warm IPs, not ours, so gating it would both throttle
 *    sends needlessly and pollute our warm-up counters with volume our IP
 *    never actually emitted.
 *
 *  - "overflow": the hybrid. Direct MX within the warm-up caps, consuming
 *    quota exactly as before; when the gate refuses a recipient FOR CAP
 *    REASONS, that recipient routes via the relay in the same job instead
 *    of deferring to the next UTC day. Result: no mail waits, our IP warms
 *    at exactly the safe rate, and as the caps double weekly the relay
 *    share shrinks to zero automatically — cutover needs no operator action.
 *
 *  - no relay configured: mode is irrelevant; direct MX within caps, and
 *    over-cap recipients defer to the UTC-midnight quota reset (unchanged).
 *
 * Overflow applies ONLY to warm-up cap refusals. Suppression drops, the
 * DKIM hold, and transient direct-MX deferrals all keep their existing
 * behaviour — those refusals are about the message or the recipient, not
 * about our IP's send budget, so a warm relay is not an answer to them.
 */

import type { WarmupGate } from "./warmup-gate.js";

// ─── Mode parsing ───────────────────────────────────────────────────────────

export type RelayMode = "all" | "overflow";

/** Unrecognized values we have already warned about (once per process each). */
const warnedModes = new Set<string>();

/**
 * Resolve `MTA_RELAY_MODE` from the environment.
 *
 * Read per job (like `MTA_REQUIRE_DKIM`) so an operator can change modes
 * mid-incident without a redeploy. Only the exact values "all" and
 * "overflow" (case-insensitive) change behaviour; anything else — including
 * a typo of "overflow" — falls back to "all" with a loud warning, following
 * the repo's only-exact-expected-values-change-behaviour pattern. "all" is
 * the safe fallback direction: every message still leaves through the
 * relay's warm IPs rather than blasting an unwarmed IP direct or silently
 * deferring mail.
 */
export function relayModeFromEnv(env: NodeJS.ProcessEnv = process.env): RelayMode {
  const raw = env["MTA_RELAY_MODE"]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return "all";
  if (raw === "all" || raw === "overflow") return raw;
  if (!warnedModes.has(raw)) {
    warnedModes.add(raw);
    console.warn(
      `[mta-worker] Unrecognized MTA_RELAY_MODE="${raw}" — treating as "all" ` +
        `(everything via relay). Valid values: "all", "overflow".`,
    );
  }
  return "all";
}

// ─── Delivery planning ──────────────────────────────────────────────────────

export interface WarmupDeferral {
  readonly recipient: string;
  readonly reason: string;
}

export interface DeliveryPlan {
  /** On the suppression list — dropped, never sent, consuming no quota. */
  readonly suppressed: string[];
  /** Direct MX from our own IP; warm-up quota already reserved for each. */
  readonly direct: string[];
  /** Via the configured relay provider (mode "all", or overflow spill). */
  readonly relay: string[];
  /** Refused by the warm-up gate with no relay to overflow into — defer. */
  readonly deferredByWarmup: WarmupDeferral[];
}

/**
 * Partition a job's recipients across delivery paths.
 *
 * Suppression is checked first so a suppressed recipient never consumes
 * warm-up quota (matches the worker's historical ordering). In "all" mode
 * with a relay available the gate is never consulted at all; in every other
 * configuration the gate is reserved per recipient exactly as before, and
 * only a refusal's DESTINATION changes with the mode (relay vs. defer).
 */
export async function planDelivery(opts: {
  recipients: readonly string[];
  suppressedSet: ReadonlySet<string>;
  mode: RelayMode;
  relayAvailable: boolean;
  gate: Pick<WarmupGate, "reserve">;
  /** Test hook: fixed clock forwarded to the gate. */
  now?: number;
}): Promise<DeliveryPlan> {
  const suppressed: string[] = [];
  const direct: string[] = [];
  const relay: string[] = [];
  const deferredByWarmup: WarmupDeferral[] = [];

  for (const recipient of opts.recipients) {
    if (opts.suppressedSet.has(recipient.toLowerCase())) {
      suppressed.push(recipient);
      continue;
    }

    if (opts.relayAvailable && opts.mode === "all") {
      // Everything relays, and the warm-up gate is deliberately not
      // consulted: these sends leave on the relay's IPs, so charging them
      // to OUR ramp would throttle mail that poses no risk to our
      // reputation and corrupt the counters the ramp is paced by.
      relay.push(recipient);
      continue;
    }

    const warmup =
      opts.now === undefined
        ? await opts.gate.reserve(recipient)
        : await opts.gate.reserve(recipient, opts.now);

    if (warmup.allow) {
      direct.push(recipient);
      continue;
    }

    if (opts.relayAvailable && opts.mode === "overflow") {
      // Cap refusal → relay instead of deferral. The refusal consumed no
      // quota (the gate rolls back on refusal), so the ramp still advances
      // at exactly the direct-MX rate.
      relay.push(recipient);
      continue;
    }

    deferredByWarmup.push({
      recipient,
      reason: warmup.reason ?? "warmup cap reached",
    });
  }

  return { suppressed, direct, relay, deferredByWarmup };
}

// ─── Relay failure handling ─────────────────────────────────────────────────

/**
 * What happens to a relay batch when the relay send fails.
 *
 * A provider that classifies permanence explicitly (`permanent`) wins over
 * everything below — the Vapron REST relay does this because its HTTP status
 * codes INVERT SMTP's (4xx permanent, 5xx transient), so the 5xx string
 * heuristic would misclassify both directions. A permanent failure bounces in
 * BOTH modes: it will fail identically on every retry, and a Vapron 403
 * (FROM-not-verified) has no direct-MX fallback to defer into, so deferring
 * would be the endless retry we must avoid.
 *
 * With no explicit classification (SES / MailChannels / SMTP relay):
 *  - "all" keeps the historical split: a 5xx in the error is a permanent
 *    relay rejection → bounce; anything else defers for retry.
 *  - "overflow" ALWAYS defers, even on a 5xx. Every recipient in an overflow
 *    relay batch is there only because the warm-up cap refused them — nothing
 *    has judged the message or recipient undeliverable. On retry they re-enter
 *    planning and can go direct MX (quota returns at UTC midnight), which is
 *    the authoritative verdict. Bouncing on a relay hiccup would lose mail the
 *    direct path could still deliver; deferral is the no-loss path.
 */
export function relayFailureOutcome(opts: {
  mode: RelayMode;
  error: string | undefined;
  permanent?: boolean | undefined;
}): "bounced" | "deferred" {
  if (opts.permanent === true) return "bounced";
  if (opts.permanent === false) return "deferred";
  if (opts.mode === "overflow") return "deferred";
  return /\b5\d{2}\b/.exec(opts.error ?? "") !== null ? "bounced" : "deferred";
}
