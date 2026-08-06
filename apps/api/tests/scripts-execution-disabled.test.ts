/**
 * Structural guard: `runSnippet` must never regain a production caller.
 *
 * The snippet runner executes user code with `new Function(...)` in the API
 * process. Its parameter-shadowing "sandbox" does not hold — any function
 * literal reaches the real Function constructor via `.constructor`, handing
 * process.env (JWT_SECRET, DATABASE_URL, provider keys) to any registered
 * user, and a synchronous loop blocks the event loop for every tenant.
 * POST /v1/scripts/:id/test was disconnected on 2026-08-05 (honest 501).
 * User-code execution belongs in the QuickJS-WASM runtime that /v1/programs
 * uses. This test fails the build if anyone re-imports the unsafe executor.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = join(__dirname, "..", "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (full.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("unsafe snippet execution stays disconnected", () => {
  it("no file under apps/api/src imports or calls runSnippet", () => {
    // Matches an import binding or a call — not a mention in a comment,
    // which is how the disconnection itself documents the hazard.
    const usagePattern = /import\s*\{[^}]*\brunSnippet\b[^}]*\}|\brunSnippet\s*\(/;
    const offenders = walk(SRC_ROOT).filter((file) => {
      const source = readFileSync(file, "utf8");
      return usagePattern.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it("the scripts test endpoint still refuses with the honest 501", () => {
    const source = readFileSync(join(SRC_ROOT, "routes", "scripts.ts"), "utf8");
    expect(source).toContain("script_execution_unavailable");
  });
});
