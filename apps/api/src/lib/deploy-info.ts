/**
 * Deploy identity + drift visibility (Known Issue #78).
 *
 * Exposes what commit this running process was actually built from, so
 * `/health` can answer "what's live?" without SSHing in and comparing by
 * hand. Pairs with `scripts/check-deploy-drift.sh`, which runs on the box on
 * a timer, compares local HEAD to `origin/main`, and writes a status file
 * this module reads back — the box had served a 10-day-stale build once
 * already (DEVOPS_TRACKER.md §1.7) with nothing to catch it.
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

interface DriftStatus {
  checkedAt: string;
  localCommit: string;
  remoteCommit: string;
  drifted: boolean;
  behindBy: number;
  error?: string;
}

let cachedCommit: string | null = null;

/** Short git SHA of the running checkout, resolved once and cached. */
export function getDeployedCommit(): string {
  if (cachedCommit !== null) {
    return cachedCommit;
  }

  const envCommit = process.env["GIT_COMMIT_SHA"]?.trim();
  if (envCommit) {
    cachedCommit = envCommit.slice(0, 12);
    return cachedCommit;
  }

  try {
    const result = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf-8",
      timeout: 2000,
    });
    const sha = result.stdout?.trim();
    cachedCommit = sha && result.status === 0 ? sha : "unknown";
  } catch {
    cachedCommit = "unknown";
  }

  return cachedCommit;
}

const DRIFT_STATUS_FILE =
  process.env["DEPLOY_DRIFT_STATUS_FILE"] ?? "/opt/alecrae/deploy-drift-status.json";

/**
 * Reads the status file written by `scripts/check-deploy-drift.sh`.
 * Returns null if the file doesn't exist or hasn't been written yet (e.g.
 * local dev, or the timer isn't installed on this box) — never throws.
 */
export function getDriftStatus(): DriftStatus | null {
  try {
    const raw = readFileSync(DRIFT_STATUS_FILE, "utf-8");
    return JSON.parse(raw) as DriftStatus;
  } catch {
    return null;
  }
}
