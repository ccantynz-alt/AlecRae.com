#!/usr/bin/env bun
/**
 * Docs governance check — keeps documentation "clean and green at all times".
 *
 * Enforces THE TIMESTAMP RULE (see CLAUDE.md): every documentation file must
 * carry a `Last updated: YYYY-MM-DD HH:MM UTC` stamp. This guards presence +
 * format (which is stable and stays green) rather than requiring "today's"
 * date, which would falsely fail every PR that doesn't touch docs.
 *
 * Usage:
 *   bun run scripts/check-docs.ts          # check; exits 1 on any violation
 *   bun run scripts/check-docs.ts --fix    # add/normalize stamps in place
 */

import { Glob } from "bun";

// Files that are not prose docs and are exempt from the stamp rule.
const IGNORE = new Set<string>([".github/pull_request_template.md"]);

const IGNORE_DIRS = ["node_modules", ".git", ".next", "dist", ".turbo"];

// Canonical stamp matcher — tolerates markdown emphasis (** or _) around it.
const STAMP_RE = /Last updated:\**\s*_?\s*\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/;

// Matches any pre-existing (possibly malformed) stamp line to normalize.
const EXISTING_LINE_RE = /^.*\**(?:Date last updated|Last updated):.*$/im;

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())} UTC`;
}

async function listDocs(): Promise<string[]> {
  const glob = new Glob("**/*.md");
  const out: string[] = [];
  for await (const file of glob.scan({ cwd: process.cwd(), dot: false })) {
    if (IGNORE_DIRS.some((d) => file.split("/").includes(d))) continue;
    if (IGNORE.has(file)) continue;
    out.push(file);
  }
  return out.sort();
}

function applyStamp(content: string, stamp: string): string {
  const canonical = `_Last updated: ${stamp}_`;
  // Normalize an existing (non-compliant) stamp line if present.
  if (EXISTING_LINE_RE.test(content)) {
    return content.replace(EXISTING_LINE_RE, canonical);
  }
  // Otherwise append a footer stamp.
  const trimmed = content.replace(/\s+$/, "");
  return `${trimmed}\n\n---\n\n${canonical}\n`;
}

async function main(): Promise<void> {
  const fix = process.argv.includes("--fix");
  const docs = await listDocs();
  const stamp = nowStamp();
  const violations: string[] = [];

  for (const file of docs) {
    const content = await Bun.file(file).text();
    if (STAMP_RE.test(content)) continue;

    if (fix) {
      await Bun.write(file, applyStamp(content, stamp));
      console.log(`stamped: ${file}`);
    } else {
      violations.push(file);
    }
  }

  if (fix) {
    console.log(`\n✓ Docs check: stamped ${docs.length} files scanned.`);
    return;
  }

  if (violations.length > 0) {
    console.error(
      `✗ Docs check failed: ${violations.length} file(s) missing a valid "Last updated: YYYY-MM-DD HH:MM UTC" stamp:\n`,
    );
    for (const v of violations) console.error(`  - ${v}`);
    console.error(`\nRun \`bun run docs:fix\` to stamp them.`);
    process.exit(1);
  }

  console.log(`✓ Docs check passed: ${docs.length} docs all carry a valid timestamp.`);
}

await main();
