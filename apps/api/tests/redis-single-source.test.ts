/**
 * Structural guard: only lib/redis.ts may construct a Redis client.
 *
 * The problem this closes was not any single bad connection — it was that
 * adding one required nothing of the author. Eight modules each grew their own
 * `getRedis()` by copy-paste, four of them with no way to close what they
 * opened, and nothing anywhere noticed. A convention ("use the shared client")
 * would have been just as easy to skip as the last one was.
 *
 * So the rule is enforced rather than documented. This is the second of two
 * layers: an ESLint `no-restricted-imports` rule bans the value import, and
 * this test catches anything that slips past it — including a deliberate
 * `eslint-disable`, which lint by definition cannot.
 *
 * BullMQ is untouched and must stay that way: its Workers issue blocking reads
 * and it requires `maxRetriesPerRequest: null`, which contradicts the shared
 * client's settings. It builds its own clients from a `{ url }` object, so it
 * never trips this test.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = join(import.meta.dirname, "..", "src");

/** The one file allowed to construct clients. */
const OWNER = join("lib", "redis.ts");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("Redis client construction is confined to lib/redis.ts", () => {
  it("has no `new Redis(` anywhere else in apps/api/src", () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      const rel = relative(SRC, file);
      if (rel === OWNER) continue;

      const source = readFileSync(file, "utf8");
      if (/\bnew\s+(?:Redis|IORedis)\s*\(/.test(source)) {
        offenders.push(rel.split(sep).join("/"));
      }
    }

    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `These files construct their own Redis client: ${offenders.join(", ")}. ` +
          "Use getRedis() from lib/redis.js instead — it is shared, readiness-gated " +
          "and closed at shutdown. If you genuinely need a connection that cannot be " +
          "shared (pub/sub, a blocking read, an interactive transaction), use " +
          "createDedicatedRedis() so it is still registered and closed.",
    ).toEqual([]);
  });

  it("imports ioredis as a value in lib/redis.ts only", () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      const rel = relative(SRC, file);
      if (rel === OWNER) continue;

      const source = readFileSync(file, "utf8");
      // `import type Redis from "ioredis"` is fine — annotations need it and a
      // type import cannot open a socket.
      for (const line of source.split("\n")) {
        if (/^\s*import\s+(?!type\b)[^;]*from\s+["']ioredis["']/.test(line)) {
          offenders.push(`${rel.split(sep).join("/")}: ${line.trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
