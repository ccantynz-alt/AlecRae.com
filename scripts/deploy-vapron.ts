#!/usr/bin/env bun
/**
 * Deploy AlecRae to Vapron (the permanent platform — see CLAUDE.md).
 *
 * Calls `aiDeploy.quickDeploy` on the Vapron tRPC API with this repository's
 * URL. Vapron clones the repo and runs the root `start` script (the API,
 * one-app-from-root; see package.json `start` / `build:api`).
 *
 * Usage:
 *   VAPRON_API_KEY=vpk_... bun run deploy:vapron
 *   VAPRON_API_KEY=vpk_... bun run deploy:vapron -- --repo https://github.com/org/repo
 *
 * Required: VAPRON_API_KEY (vpk_*). Optional: VAPRON_BASE_URL override.
 * Runbook: docs/infra/vapron-go-live.md
 */

import { isVapronConfigured, vapron } from "../apps/api/src/lib/vapron.js";

const DEFAULT_REPO_URL = "https://github.com/ccantynz-alt/AlecRae.com";

function parseRepoArg(argv: string[]): string {
  const i = argv.indexOf("--repo");
  const fromFlag = i >= 0 ? argv[i + 1] : undefined;
  return fromFlag ?? process.env["VAPRON_DEPLOY_REPO_URL"] ?? DEFAULT_REPO_URL;
}

async function main(): Promise<void> {
  if (!isVapronConfigured()) {
    console.error(
      "✗ VAPRON_API_KEY is not set. Get a vpk_* key from the Vapron dashboard " +
        "and re-run:\n    VAPRON_API_KEY=vpk_... bun run deploy:vapron\n" +
        "  See docs/infra/vapron-go-live.md for the full go-live checklist.",
    );
    process.exit(1);
  }

  const repoUrl = parseRepoArg(process.argv.slice(2));
  console.error(`→ Deploying ${repoUrl} via Vapron aiDeploy.quickDeploy ...`);

  try {
    const result = await vapron.aiDeploy.quickDeploy({ repoUrl });
    console.error("✓ Vapron accepted the deploy. Response:");
    console.log(JSON.stringify(result, null, 2));
    console.error(
      "\nNext: run the post-deploy checklist in docs/infra/vapron-go-live.md " +
        "(env vars, db:migrate, domain, health check).",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Deploy failed: ${message}`);
    process.exit(1);
  }
}

await main();
