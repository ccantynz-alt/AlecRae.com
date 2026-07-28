/**
 * Structural guard: every router that depends on auth context must have
 * authMiddleware mounted for its path.
 *
 * This bug class has now appeared five times. `requireScope()` reads
 * `c.get("auth")`, which only exists if `authMiddleware` ran. A router mounted
 * with `app.route()` and no matching `app.use(..., authMiddleware, ...)` gets
 * an undefined auth context and 401s on EVERY request, for every caller
 * including owners:
 *
 *   - /v1/ai-intelligence   (issue #87, found 2026-07-19)
 *   - /v1/contact-groups    ) all four found 2026-07-29 by diffing mounts
 *   - /v1/signatures        ) against auth coverage, after the journey audit
 *   - /v1/auto-responder    ) had spotted only the contact-groups one
 *   - /v1/push              )
 *
 * Per-route unit tests never catch it because they mock `requireScope`. The
 * defect lives in the wiring between server.ts and the router, which only a
 * structural check over server.ts can see — so this reads the source rather
 * than exercising handlers.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const serverSrc = readFileSync(join(SRC, "server.ts"), "utf8");

/** Paths mounted with app.route(). */
function mountedPaths(): string[] {
  return [...serverSrc.matchAll(/app\.route\(\s*"(\/v1\/[^"]*)"/g)].map((m) => m[1] as string);
}

/**
 * Path prefixes that have authMiddleware applied — via app.use(), or via
 * app.on() for routers where only some METHODS are authenticated (the
 * changelog is public to read and admin-only to write).
 */
function authedPrefixes(): string[] {
  const fromUse = [...serverSrc.matchAll(/app\.use\(\s*"(\/v1\/[^"]*)"[^)]*authMiddleware/g)].map(
    (m) => m[1] as string,
  );
  const fromOn = [
    ...serverSrc.matchAll(/app\.on\(\s*\[[^\]]*\],\s*\[([^\]]*)\][^)]*authMiddleware/gs),
  ].flatMap((m) => [...(m[1] as string).matchAll(/"(\/v1\/[^"]*)"/g)].map((p) => p[1] as string));

  return [...fromUse, ...fromOn].map((p) => p.replace(/\/\*$/, ""));
}

/**
 * A mount counts as covered when an auth prefix covers it, OR sits beneath it.
 *
 * The second direction matters: /v1/billing mounts a router whose individual
 * endpoints (/v1/billing/checkout, /portal, ...) are each authenticated, while
 * /v1/billing/webhook is deliberately public because Stripe signs it. Treating
 * that as a gap would be a false positive, and a structural test that cries
 * wolf gets deleted rather than fixed.
 */
function isCovered(path: string, prefixes: string[]): boolean {
  return prefixes.some(
    (p) => path === p || path.startsWith(`${p}/`) || p.startsWith(`${path}/`),
  );
}

/**
 * Mounts that legitimately need no auth, each for a stated reason. Anything
 * NOT on this list and NOT auth-covered fails the test — so adding a new
 * public route is a deliberate act with a justification, not an oversight.
 */
const INTENTIONALLY_PUBLIC: Record<string, string> = {
  "/v1/health": "liveness/readiness probes — must answer before auth exists",
  "/v1/status": "public status page data",
  "/v1/uptime": "public uptime data",
  "/v1/realtime": "WebSocket upgrade; authenticates on the socket, not the route",
  "/v1/auth/passkey": "WebAuthn ceremony; cannot require a session to start one",
  "/v1/fbl": "ISP feedback-loop postbacks, authenticated by source not session",
};

describe("route auth coverage (structural)", () => {
  it("finds the mounts and the auth coverage it is meant to compare", () => {
    // Guards the regexes themselves — if either stops matching, the test would
    // silently pass while checking nothing.
    expect(mountedPaths().length).toBeGreaterThan(20);
    expect(authedPrefixes().length).toBeGreaterThan(20);
  });

  it("every auth-dependent router has authMiddleware mounted for its path", () => {
    const prefixes = authedPrefixes();
    const gaps = mountedPaths().filter((path) => {
      if (isCovered(path, prefixes)) return false;
      // Allow an exact entry, or a parent entry (e.g. /v1/auth covers
      // /v1/auth/passkey being listed separately).
      return !Object.keys(INTENTIONALLY_PUBLIC).some(
        (pub) => path === pub || path.startsWith(`${pub}/`),
      );
    });

    expect(
      gaps,
      `These routers are mounted with app.route() but no authMiddleware covers them. ` +
        `If a router calls requireScope() it will 401 on every request. Either add ` +
        `app.use("<path>/*", authMiddleware, ...) or add the path to ` +
        `INTENTIONALLY_PUBLIC with a reason.`,
    ).toEqual([]);
  });

  it("covers the five routers this test was written for", () => {
    const prefixes = authedPrefixes();
    for (const path of [
      "/v1/contact-groups",
      "/v1/signatures",
      "/v1/auto-responder",
      "/v1/push",
      // Mixed router: public to read, admin-only to write. Its admin writes
      // are authenticated via app.on([POST,PUT,DELETE], ...) so the public
      // GETs stay reachable.
      "/v1/changelog",
    ]) {
      expect(isCovered(path, prefixes), `${path} must have authMiddleware`).toBe(true);
    }
  });
});
