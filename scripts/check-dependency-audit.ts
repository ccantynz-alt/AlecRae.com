/**
 * Dependency audit gate.
 *
 * Replaces the `npx audit-ci --config audit-ci.json || true` step, which
 * could never have worked: audit-ci resolves a package manager from
 * package-lock.json / yarn.lock / pnpm-lock.yaml, and this repo has none of
 * them (it is a Bun workspace with bun.lock). Every run errored out on
 * "Cannot establish package-manager type" and `|| true` swallowed it, so the
 * "Dependency Audit" job reported green while auditing nothing — the same
 * control-that-does-nothing class as the preflight script (issue #150) and
 * the e2e suite that runs nowhere (issue #143). The step's own comment
 * ("Bun does not have a built-in audit command yet") was stale: `bun audit`
 * exists and works against bun.lock.
 *
 * Policy, and why it is not simply "fail on anything":
 *
 *   - CRITICAL advisories fail the build, EXCEPT ones listed in
 *     `KNOWN_CRITICAL` with a stated reason. A new critical is therefore
 *     loud, which is the property that was missing entirely.
 *   - high / moderate / low are REPORTED, not blocking. There are currently
 *     ~140 of them, nearly all transitive dev-tooling. A gate nobody can
 *     pass is a gate nobody reads, and turning CI permanently red would
 *     bury the criticals this exists to surface. The counts are printed on
 *     every run so the number cannot quietly grow unnoticed.
 *
 * Run: bun run scripts/check-dependency-audit.ts
 */

interface Advisory {
  id: number;
  url: string;
  title: string;
  severity: "critical" | "high" | "moderate" | "low" | "info";
}

/**
 * Criticals accepted for now, each with the reason it is not blocking.
 * Removing a package from this list is how it becomes blocking again —
 * so an accepted risk has to be re-stated deliberately, not inherited.
 */
const KNOWN_CRITICAL: Record<string, string> = {
  // Verified 2026-08-05 against `bun audit`: pulled in only by
  // @alecrae/mobile › expo, @alecrae/desktop › electron-builder and
  // @alecrae/infrastructure › @pulumi/pulumi. Neither apps/api nor
  // services/mta reaches it, so no request path parses attacker-supplied
  // tar input.
  tar: "build/packaging chain only (expo, electron-builder, pulumi); no runtime request path reaches it",
  "shell-quote":
    "dev tooling only — @pulumi/eks, drizzle-kit, react-native; never invoked by the API or MTA at runtime",
  vitest:
    "test runner; the advisory requires the Vitest UI server to be listening, which CI and production never start",
};

async function main(): Promise<void> {
  const proc = Bun.spawn(["bun", "audit", "--json"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const raw = await new Response(proc.stdout).text();
  await proc.exited;

  const jsonStart = raw.indexOf("{");
  if (jsonStart === -1) {
    console.error("[dep-audit] `bun audit --json` produced no JSON. Output:\n" + raw.slice(0, 500));
    process.exit(1);
  }

  let parsed: Record<string, Advisory[]>;
  try {
    parsed = JSON.parse(raw.slice(jsonStart)) as Record<string, Advisory[]>;
  } catch (err) {
    console.error("[dep-audit] Could not parse audit output:", err);
    process.exit(1);
  }

  const counts = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };
  const blocking: { pkg: string; advisory: Advisory }[] = [];
  const accepted: { pkg: string; advisory: Advisory }[] = [];

  for (const [pkg, advisories] of Object.entries(parsed)) {
    for (const advisory of advisories) {
      const severity = advisory.severity ?? "info";
      if (severity in counts) counts[severity as keyof typeof counts] += 1;
      if (severity !== "critical") continue;
      if (pkg in KNOWN_CRITICAL) accepted.push({ pkg, advisory });
      else blocking.push({ pkg, advisory });
    }
  }

  console.log(
    `[dep-audit] ${counts.critical} critical, ${counts.high} high, ` +
      `${counts.moderate} moderate, ${counts.low} low`,
  );

  if (accepted.length > 0) {
    console.log(`\n[dep-audit] Accepted criticals (${accepted.length}) — reason recorded:`);
    for (const { pkg, advisory } of accepted) {
      console.log(`  • ${pkg}: ${advisory.title}`);
      console.log(`    accepted because: ${KNOWN_CRITICAL[pkg]}`);
      console.log(`    ${advisory.url}`);
    }
  }

  if (blocking.length > 0) {
    console.error(`\n[dep-audit] BLOCKING — ${blocking.length} new critical advisory(ies):`);
    for (const { pkg, advisory } of blocking) {
      console.error(`  ✖ ${pkg}: ${advisory.title}`);
      console.error(`    ${advisory.url}`);
    }
    console.error(
      "\nFix the dependency, or — if it is genuinely not reachable — add it to " +
        "KNOWN_CRITICAL in scripts/check-dependency-audit.ts WITH the reason.",
    );
    process.exit(1);
  }

  console.log("\n[dep-audit] No unreviewed critical advisories.");
}

await main();
