/**
 * Unsubscribe Browser Runner — DISABLED
 *
 * The original implementation drove headless Chromium via Playwright. Per
 * CLAUDE.md Forbidden Rule #26, Playwright is rejected from this codebase
 * because Microsoft owns it and Outlook is a direct competitor. Puppeteer
 * (Google / Gmail) is rejected on the same grounds.
 *
 * The AI unsubscribe agent (B3 feature) is intentionally non-functional until
 * Craig chooses a replacement automation strategy. Candidates that are NOT
 * forbidden:
 *
 *   - Selenium WebDriver (Apache, vendor-neutral)
 *   - Raw Chrome DevTools Protocol via chrome-launcher + chrome-remote-interface
 *   - GateTest.ai's automation API, when its surface area covers product flows
 *     beyond CI gating
 *
 * Adding any of those is a new dependency and therefore requires Craig's
 * authorization (CLAUDE.md Boss Rule §2 + Forbidden #12).
 *
 * The route at apps/api/src/routes/unsubscribe.ts continues to call this
 * module. It will receive a structured UnsubscribeResult with success=false
 * and a human-readable error so the UI can render a clear "AI unsubscribe is
 * temporarily unavailable — please use the link directly" message.
 */

// ─── Types (kept stable so callers don't break) ──────────────────────────────

export interface UnsubscribeResult {
  success: boolean;
  finalUrl: string;
  /** Base64-encoded PNG screenshots, in chronological order. */
  screenshots: string[];
  /** Human-readable log of every step the agent took. */
  steps: string[];
  /** A confirmation snippet from the final page, if found. */
  confirmationText?: string;
  error?: string;
}

export interface RunUnsubscribeOptions {
  /** User's email address — passed to the planner if a form requires it. */
  userEmail?: string;
  /** Override the maximum agent loop iterations. */
  maxSteps?: number;
}

// ─── Disabled stub ──────────────────────────────────────────────────────────

const DISABLED_REASON =
  "AI unsubscribe agent is temporarily unavailable. The browser automation " +
  "library (Playwright) was removed per CLAUDE.md rule 26 (competitor product). " +
  "A replacement is pending Craig's authorization. Please use the unsubscribe " +
  "link from your email client directly.";

export async function runUnsubscribeFlow(
  url: string,
  _options: RunUnsubscribeOptions = {},
): Promise<UnsubscribeResult> {
  return {
    success: false,
    finalUrl: url,
    screenshots: [],
    steps: ["agent_disabled"],
    error: DISABLED_REASON,
  };
}
