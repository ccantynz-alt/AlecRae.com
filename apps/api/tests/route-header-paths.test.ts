/**
 * Route-file header comments must state the path the router is actually
 * mounted at (issues #73k, #74h, #75f).
 *
 * Five route files documented a mount path that did not exist:
 *
 *   attachment-intelligence  said /v1/attachment-intelligence  → /v1/attachments/intelligence
 *   productivity-analytics   said /v1/productivity-analytics   → /v1/productivity
 *   scheduling-intelligence  said /v1/scheduling-intelligence  → /v1/scheduling
 *   analytics-dashboard      said /v1/analytics-dashboard      → /v1/analytics/dashboard
 *   delegation               said /v1/delegations (plural)     → /v1/delegation (singular)
 *
 * This is not cosmetic. The header is what anyone reads to learn the path, and
 * the delegation one already caused a real outage: issue #67 records that the
 * web client called `/v1/delegations` and every request 404'd. The wrong
 * comment was the source of the wrong client.
 *
 * A one-time correction would drift again the next time a mount moves, so the
 * rule is enforced instead. Same approach as route-auth-coverage.test.ts:
 * assert a property of the source, not of a running server.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "..", "src");
const ROUTES = join(SRC, "routes");

/** `app.route("/v1/foo", barRouter)` → Map<routerIdentifier, mountPath>. */
function readMounts(): Map<string, string> {
  const server = readFileSync(join(SRC, "server.ts"), "utf8");
  const mounts = new Map<string, string>();
  const pattern = /app\.route\(\s*["'`]([^"'`]+)["'`]\s*,\s*(\w+)\s*\)/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(server)) !== null) {
    const [, path, identifier] = match;
    if (path && identifier && path.startsWith("/v1/")) {
      mounts.set(identifier, path);
    }
  }
  return mounts;
}

/**
 * The `/v1/...` paths a file's header claims as ITS OWN endpoints.
 *
 * Only the endpoint-listing convention counts — a line whose content begins
 * with an HTTP method, as in `* POST /v1/foo — does a thing`. Headers also
 * legitimately mention *other* routes in prose ("see POST /v1/domains", or
 * "covered separately by `DELETE /v1/account`"), and flagging those would
 * punish accurate cross-referencing, which is the opposite of the goal.
 * Backticked paths are excluded for the same reason: backticks are this
 * codebase's prose convention for naming something elsewhere.
 */
function declaredPaths(source: string): string[] {
  const end = source.indexOf("*/");
  if (end === -1) return [];

  const paths: string[] = [];
  for (const line of source.slice(0, end).split("\n")) {
    const match = /^\s*\*\s*(?:GET|POST|PUT|PATCH|DELETE)\s+(\/v1\/[a-zA-Z0-9/_:-]+)/.exec(line);
    if (!match?.[1]) continue;
    if (line.includes(`\`${match[1]}\``)) continue;
    paths.push(match[1]);
  }
  return paths;
}

/** Router identifiers a file exports, so a header can be tied to its mount. */
function exportedRouters(source: string): string[] {
  return [...source.matchAll(/export\s*\{\s*([^}]+)\}/g)]
    .flatMap((m) => (m[1] ?? "").split(","))
    .map((s) => s.trim().split(/\s+as\s+/)[0]?.trim() ?? "")
    .filter((s) => s !== "");
}

describe("header comments match real mount paths", () => {
  const mounts = readMounts();

  it("finds the mount table in server.ts at all", () => {
    // If this breaks, the test below silently passes on everything.
    expect(mounts.size).toBeGreaterThan(20);
  });

  it("documents no /v1 path outside its own mount prefix", () => {
    const wrong: string[] = [];

    for (const file of readdirSync(ROUTES)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;

      const source = readFileSync(join(ROUTES, file), "utf8");
      const paths = declaredPaths(source);
      if (paths.length === 0) continue;

      // The mount prefixes this file's routers are attached to.
      const prefixes = exportedRouters(source)
        .map((id) => mounts.get(id))
        .filter((p): p is string => p !== undefined);
      if (prefixes.length === 0) continue;

      for (const path of paths) {
        const ok = prefixes.some(
          (prefix) => path === prefix || path.startsWith(`${prefix}/`),
        );
        if (!ok) {
          wrong.push(
            `${file}: header says "${path}" but the router is mounted at ${prefixes.join(" or ")}`,
          );
        }
      }
    }

    expect(
      wrong,
      wrong.length === 0
        ? ""
        : `Route header comments disagree with server.ts:\n  ${wrong.join("\n  ")}\n` +
          "The header is what the next person reads to find the path — a wrong one " +
          "produced a client that 404'd on every call (issue #67).",
    ).toEqual([]);
  });
});
