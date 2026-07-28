/**
 * @alecrae/mta — Bounded DNS resolution.
 *
 * Every DNS lookup in this service used `node:dns/promises` directly, which
 * has no timeout of its own: it inherits whatever the OS resolver does. If the
 * box's resolver becomes slow or unreachable, an MX lookup can hang for a very
 * long time — and these lookups sit directly in the delivery path and in
 * inbound SPF/DMARC evaluation.
 *
 * The failure is worse than it sounds because of where it lands. A delivery
 * worker blocked in `resolveMx` is not failing, it is *waiting*: the job never
 * completes, the queue backs up behind it, and nothing reports a problem.
 * There is no alerting yet (issue #72), so the first visible symptom is
 * customers noticing mail has stopped. A bounded lookup turns that silent
 * stall into an ordinary retryable delivery error.
 *
 * Uses `dns.Resolver`'s own `timeout`/`tries` options rather than racing a
 * promise. Racing would resolve the caller early while leaving the underlying
 * query running, which under a resolver outage means an unbounded pile of
 * in-flight queries — trading a stall for a leak.
 */

import { Resolver } from "node:dns/promises";

/**
 * Per-query timeout. Generous enough for a cold cache and a distant
 * authoritative server, short enough that a stuck resolver surfaces as a
 * deferral within one delivery attempt rather than holding a worker.
 */
const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Attempts per query. `tries` multiplies the timeout, so this and the value
 * above together set the real worst case: 2 × 5s = 10s.
 */
const DEFAULT_TRIES = 2;

function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

let resolver: Resolver | null = null;

/**
 * The shared bounded resolver.
 *
 * One instance for the process: `Resolver` holds a c-ares channel, and
 * building one per lookup would discard its cache and burn file descriptors
 * under load.
 */
export function getBoundedResolver(env: NodeJS.ProcessEnv = process.env): Resolver {
  if (resolver) return resolver;

  resolver = new Resolver({
    timeout: readPositiveInt(env["MTA_DNS_TIMEOUT_MS"], DEFAULT_TIMEOUT_MS),
    tries: readPositiveInt(env["MTA_DNS_TRIES"], DEFAULT_TRIES),
  });
  return resolver;
}

/** Test seam: drop the cached resolver so options are re-read. */
export function resetBoundedResolverForTests(): void {
  resolver = null;
}

/**
 * Bounded equivalents of the `node:dns/promises` functions this service uses.
 *
 * Deliberately the same shapes as the originals so call sites swap a single
 * import rather than restructuring around a new error model — a lookup that
 * times out rejects, exactly as an unreachable name already did.
 */
export const boundedDns = {
  resolveMx: (domain: string) => getBoundedResolver().resolveMx(domain),
  resolveTxt: (domain: string) => getBoundedResolver().resolveTxt(domain),
  resolve4: (domain: string) => getBoundedResolver().resolve4(domain),
  resolve6: (domain: string) => getBoundedResolver().resolve6(domain),
  reverse: (ip: string) => getBoundedResolver().reverse(ip),
} as const;
