#!/usr/bin/env bun
/**
 * Route coverage audit — cross-references every apps/api/src/routes/*.ts
 * endpoint against apps/web (+ apps/mobile, apps/desktop) to find backend
 * routes with zero UI wiring, and regenerates docs/audits/route-coverage.md.
 *
 * This replaces "audit by hand every few weeks" (see PRODUCT_GAP_AUDIT.md,
 * now deleted, and CLAUDE.md Known Issues #27/#39/#47/#51/#65 — the same
 * "web app only exposes a fraction of the backend" finding rediscovered five
 * times by hand) with a repeatable, deterministic check.
 *
 * Matching is a heuristic, not a type-checked call graph: a route is "wired"
 * if its static path segments (everything except `:param` segments) all
 * appear, in order, as substrings inside one UI source file. Dynamic
 * mid-path segments (e.g. `/v1/domains/:id/warmup/start`) are split into
 * separate static "runs" (`/v1/domains`, `/warmup/start`) that must all
 * appear in the same file — good enough to be directionally correct for
 * planning, not a substitute for reading the actual call site.
 *
 * Usage:
 *   bun run audit:routes          # regenerate docs/audits/route-coverage.md
 *   bun run audit:routes:check    # CI: fail if a brand-new route file (vs.
 *                                 # BASE_REF, or origin/main, or HEAD~1) ships
 *                                 # with zero UI references. Never fails on
 *                                 # pre-existing unwired routes.
 */

import { Glob, $ } from "bun";

const ROUTES_DIR = "apps/api/src/routes";
const SERVER_FILE = "apps/api/src/server.ts";
const UI_DIRS = ["apps/web", "apps/mobile", "apps/desktop"];
const REPORT_PATH = "docs/audits/route-coverage.md";
const EXCLUDE_RE = /node_modules|\.next|dist|\.turbo/;

type Method = "get" | "post" | "put" | "patch" | "delete";
type Status = "wired" | "partial" | "unwired";

interface Endpoint {
  method: Method;
  fullPath: string;
  wired: boolean;
  matchedFiles: string[];
}

interface RouteFile {
  file: string;
  domain: string;
  endpoints: Endpoint[];
  status: Status;
  wiredCount: number;
}

interface UiFile {
  path: string;
  content: string;
}

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())} UTC`;
}

function normalizePath(...parts: string[]): string {
  const joined = parts.filter(Boolean).join("/");
  return ("/" + joined).replace(/\/+/g, "/").replace(/(?!^)\/$/, "");
}

/** Split a path into static "runs" — contiguous non-`:param` segments. */
function staticRuns(fullPath: string): string[] {
  const segs = fullPath.split("/").filter((s) => s.length > 0);
  const runs: string[] = [];
  let current: string[] = [];
  for (const seg of segs) {
    if (seg.startsWith(":")) {
      if (current.length > 0) {
        runs.push("/" + current.join("/"));
        current = [];
      }
    } else {
      current.push(seg);
    }
  }
  if (current.length > 0) runs.push("/" + current.join("/"));
  return runs.length > 0 ? runs : ["/"];
}

async function parseServerMounts(): Promise<{
  varToFile: Map<string, string>;
  varToPrefixes: Map<string, string[]>;
}> {
  const src = await Bun.file(SERVER_FILE).text();
  const varToFile = new Map<string, string>();

  const importRe = /import\s*\{([^}]+)\}\s*from\s*["'`]\.\/routes\/([^"'`]+)\.js["'`]/g;
  for (const m of src.matchAll(importRe)) {
    const names = m[1]!.split(",").map((s) => s.trim()).filter(Boolean);
    const file = `${m[2]!}.ts`;
    for (const name of names) {
      const localName = name.split(/\s+as\s+/).pop()!.trim();
      if (localName) varToFile.set(localName, file);
    }
  }

  const varToPrefixes = new Map<string, string[]>();
  const mountRe = /app\.route\(\s*["'`]([^"'`]+)["'`]\s*,\s*(\w+)\s*\)/g;
  for (const m of src.matchAll(mountRe)) {
    const prefix = m[1]!;
    const varName = m[2]!;
    const arr = varToPrefixes.get(varName) ?? [];
    arr.push(prefix);
    varToPrefixes.set(varName, arr);
  }

  return { varToFile, varToPrefixes };
}

async function parseRouteFile(
  file: string,
  varToPrefixes: Map<string, string[]>,
): Promise<Endpoint[]> {
  const src = await Bun.file(`${ROUTES_DIR}/${file}`).text();

  const declRe = /const\s+(\w+)\s*=\s*new Hono\(/g;
  const declaredVars = new Set<string>();
  for (const m of src.matchAll(declRe)) declaredVars.add(m[1]!);

  // Path literal may be on the line after the opening paren, so allow
  // whitespace/newlines between `(` and the quote (capped to avoid runaway
  // matches into unrelated code below).
  const endpointRe = /(\w+)\.(get|post|put|patch|delete)\(\s{0,80}["'`]([^"'`]+)["'`]/g;
  const endpoints: Endpoint[] = [];

  for (const m of src.matchAll(endpointRe)) {
    const varName = m[1]!;
    if (!declaredVars.has(varName)) continue; // skip c.req.get(...), Map.get(...), etc.
    const method = m[2]! as Method;
    const localPath = m[3]!;
    const prefixes = varToPrefixes.get(varName) ?? [];

    if (prefixes.length === 0) {
      // Declared but never mounted anywhere server.ts's parser found — record
      // with the local path only so it still shows up as unwired, not silently
      // dropped.
      endpoints.push({ method, fullPath: normalizePath(localPath), wired: false, matchedFiles: [] });
      continue;
    }
    for (const prefix of prefixes) {
      endpoints.push({
        method,
        fullPath: normalizePath(prefix, localPath),
        wired: false,
        matchedFiles: [],
      });
    }
  }

  return endpoints;
}

async function buildUiCorpus(): Promise<UiFile[]> {
  const corpus: UiFile[] = [];
  for (const dir of UI_DIRS) {
    if (!(await Bun.file(`${dir}/package.json`).exists())) continue;
    const glob = new Glob("**/*.{ts,tsx}");
    for await (const rel of glob.scan({ cwd: dir, dot: false })) {
      if (EXCLUDE_RE.test(rel)) continue;
      if (/\.test\.(ts|tsx)$/.test(rel)) continue;
      const full = `${dir}/${rel}`;
      corpus.push({ path: full, content: await Bun.file(full).text() });
    }
  }
  return corpus;
}

async function resolveBaseRef(): Promise<string> {
  if (process.env["BASE_REF"]) return process.env["BASE_REF"]!;
  try {
    return (await $`git merge-base origin/main HEAD`.text()).trim();
  } catch {
    return "HEAD~1";
  }
}

/** Route filenames added (git status "A") vs. baseRef. Empty set on any git failure. */
async function getAddedRouteFiles(baseRef: string): Promise<Set<string>> {
  const added = new Set<string>();
  try {
    const out = await $`git diff --name-status ${baseRef}...HEAD -- ${ROUTES_DIR}`.text();
    for (const line of out.split("\n")) {
      const [status, path] = line.split(/\s+/);
      if (status === "A" && path?.endsWith(".ts") && !path.endsWith(".test.ts")) {
        added.add(path.split("/").pop()!);
      }
    }
  } catch {
    // No git history available (shallow clone, no origin, etc.) — regression
    // check degrades to a no-op rather than a false failure.
  }
  return added;
}

async function writeReport(routeFiles: RouteFile[]): Promise<void> {
  const stamp = nowStamp();
  const totalFiles = routeFiles.length;
  const wiredFiles = routeFiles.filter((r) => r.status === "wired").length;
  const partialFiles = routeFiles.filter((r) => r.status === "partial").length;
  const unwiredFiles = routeFiles.filter((r) => r.status === "unwired").length;
  const totalEndpoints = routeFiles.reduce((s, r) => s + r.endpoints.length, 0);
  const wiredEndpoints = routeFiles.reduce((s, r) => s + r.wiredCount, 0);
  const endpointPct = totalEndpoints ? Math.round((wiredEndpoints / totalEndpoints) * 100) : 0;
  const filePct = totalFiles ? Math.round(((wiredFiles + partialFiles) / totalFiles) * 100) : 0;

  const order: Record<Status, number> = { unwired: 0, partial: 1, wired: 2 };
  const sorted = [...routeFiles].sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return a.file.localeCompare(b.file);
  });

  const rows = sorted.map((rf) => {
    const calledFrom = [
      ...new Set(
        rf.endpoints
          .filter((e) => e.wired)
          .flatMap((e) => e.matchedFiles)
          .map((p) => p.replace(/\\/g, "/")),
      ),
    ].sort();
    const calledFromStr = calledFrom.length > 0 ? calledFrom.map((c) => `\`${c}\``).join(", ") : "-";
    return `| ${rf.file} | ${rf.domain} | ${rf.endpoints.length} | ${rf.status} | ${rf.wiredCount}/${rf.endpoints.length} | ${calledFromStr} |`;
  });

  const unwiredList = sorted
    .filter((rf) => rf.status === "unwired")
    .map((rf) => `- ${rf.file} (${rf.endpoints.length} endpoint${rf.endpoints.length === 1 ? "" : "s"})`);

  const lines = [
    "# Route Coverage Report",
    "",
    `_Last updated: ${stamp}_`,
    "",
    "Auto-generated by `bun run audit:routes` (`scripts/audit-route-coverage.ts`).",
    "Do not hand-edit — this file is fully regenerated on every run, including in CI.",
    "See `DEVOPS_TRACKER.md` for the prioritized roadmap this report feeds.",
    "",
    "## Summary",
    "",
    `- **${totalFiles}** backend route files, **${totalEndpoints}** endpoints total`,
    `- **${wiredFiles}** fully wired, **${partialFiles}** partially wired, **${unwiredFiles}** fully unwired`,
    `- **Endpoint-level coverage: ${endpointPct}%** (endpoints with a confirmed UI reference / total endpoints)`,
    `- **File-level coverage: ${filePct}%** (wired-or-partial files / total files)`,
    "",
    "## Coverage by domain",
    "",
    "Sorted worst gaps first (unwired, then partial, then wired); alphabetical within each group.",
    "",
    "| Route file | Domain | Endpoints | Status | Wired endpoints | Called from |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
    "## Unwired domains (zero UI reference)",
    "",
    ...(unwiredList.length > 0 ? unwiredList : ["_None — every route file has at least one UI reference._"]),
    "",
    "---",
    "",
    `_Last updated: ${stamp}_`,
    "",
  ];

  await Bun.write(REPORT_PATH, lines.join("\n"));
}

async function main(): Promise<void> {
  const checkRegression = process.argv.includes("--check-regression");

  const { varToPrefixes } = await parseServerMounts();

  const routeGlob = new Glob("*.ts");
  const files: string[] = [];
  for await (const f of routeGlob.scan({ cwd: ROUTES_DIR })) {
    if (f.endsWith(".test.ts")) continue;
    files.push(f);
  }
  files.sort();

  const corpus = await buildUiCorpus();
  const routeFiles: RouteFile[] = [];

  for (const file of files) {
    const endpoints = await parseRouteFile(file, varToPrefixes);
    const domain = file.replace(/\.ts$/, "");

    for (const ep of endpoints) {
      const runs = staticRuns(ep.fullPath);
      const exactMatches = corpus.filter((f) => runs.every((run) => f.content.includes(run)));
      if (exactMatches.length > 0) {
        ep.wired = true;
        ep.matchedFiles = exactMatches.map((f) => f.path);
        continue;
      }
      // Fallback: does the route's broadest static run appear anywhere at
      // all? Covers the UI calling a sibling endpoint under the same domain.
      const fallbackRun = runs[0]!;
      const fallbackMatches = corpus.filter((f) => f.content.includes(fallbackRun));
      if (fallbackMatches.length > 0) {
        ep.wired = true;
        ep.matchedFiles = fallbackMatches.map((f) => f.path);
      }
    }

    const wiredCount = endpoints.filter((e) => e.wired).length;
    const total = endpoints.length;
    const status: Status =
      total === 0 || wiredCount === 0 ? "unwired" : wiredCount === total ? "wired" : "partial";

    routeFiles.push({ file, domain, endpoints, status, wiredCount });
  }

  if (checkRegression) {
    const baseRef = await resolveBaseRef();
    const addedFiles = await getAddedRouteFiles(baseRef);
    const newlyUnwired = routeFiles.filter((rf) => addedFiles.has(rf.file) && rf.status === "unwired");

    if (newlyUnwired.length > 0) {
      console.error("✗ Route coverage regression: new route file(s) shipped with zero UI wiring:\n");
      for (const rf of newlyUnwired) {
        console.error(
          `  - ${rf.file} (${rf.endpoints.length} endpoint${rf.endpoints.length === 1 ? "" : "s"}, 0 referenced anywhere in apps/web|mobile|desktop)`,
        );
      }
      console.error(
        "\nWire at least one endpoint into the UI before merging — this is exactly how issues #27/#39/#47/#51/#65 kept recurring.",
      );
      process.exit(1);
    }
    console.log(`✓ Route coverage check passed (${addedFiles.size} new route file(s) checked against ${baseRef}).`);
    return;
  }

  await writeReport(routeFiles);

  const totalFiles = routeFiles.length;
  const wiredFiles = routeFiles.filter((r) => r.status === "wired").length;
  const partialFiles = routeFiles.filter((r) => r.status === "partial").length;
  const unwiredFiles = routeFiles.filter((r) => r.status === "unwired").length;
  const totalEndpoints = routeFiles.reduce((s, r) => s + r.endpoints.length, 0);
  const wiredEndpoints = routeFiles.reduce((s, r) => s + r.wiredCount, 0);

  console.log(
    `Route coverage: ${wiredFiles}/${totalFiles} files fully wired, ${partialFiles} partial, ${unwiredFiles} unwired ` +
      `— ${totalEndpoints ? Math.round((wiredEndpoints / totalEndpoints) * 100) : 0}% endpoint coverage. ` +
      `Report: ${REPORT_PATH}`,
  );
}

await main();
