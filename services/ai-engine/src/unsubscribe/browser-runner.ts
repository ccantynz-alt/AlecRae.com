/**
 * Unsubscribe Browser Runner
 *
 * Drives a real headless Chromium (via Playwright) through an unsubscribe
 * web page, asking Claude to look at a compact representation of the page
 * after every step and decide what to click / type next.
 *
 * The agent loop:
 *
 *   1. Navigate to the URL.
 *   2. Snapshot the page (URL, title, visible text, list of clickables).
 *   3. Ask Claude — given the snapshot — what to do next.
 *      Allowed actions: click, fill, finish.
 *   4. Execute the action and loop, up to MAX_STEPS.
 *   5. Capture before/after screenshots and a step log.
 */

import Anthropic from "@anthropic-ai/sdk";
import { chromium, type Browser, type Page } from "playwright";

// ─── Types ──────────────────────────────────────────────────────────────────

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

interface PageSnapshot {
  url: string;
  title: string;
  visibleText: string;
  clickables: { index: number; tag: string; text: string; selector: string }[];
  inputs: { index: number; type: string; name: string; placeholder: string; selector: string }[];
}

type AgentAction =
  | { type: "click"; selector: string; reason: string }
  | { type: "fill"; selector: string; value: string; reason: string }
  | { type: "finish"; success: boolean; reason: string };

// ─── Configuration ──────────────────────────────────────────────────────────

const SONNET_MODEL = "claude-sonnet-4-6";
const MAX_STEPS = 6;
const NAV_TIMEOUT_MS = 20_000;
const ACTION_TIMEOUT_MS = 8_000;

const CONFIRMATION_PHRASES = [
  "you have been unsubscribed",
  "you've been unsubscribed",
  "successfully unsubscribed",
  "unsubscribe successful",
  "you are now unsubscribed",
  "you will no longer receive",
  "preferences updated",
  "subscription cancelled",
  "subscription canceled",
  "removed from",
  "opted out",
];

// ─── Anthropic singleton ────────────────────────────────────────────────────

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — AI unsubscribe agent is unavailable",
    );
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// ─── Page introspection ─────────────────────────────────────────────────────

async function snapshotPage(page: Page): Promise<PageSnapshot> {
  const data = await page.evaluate(() => {
    function isVisible(el: Element): boolean {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const style = window.getComputedStyle(el as HTMLElement);
      return style.visibility !== "hidden" && style.display !== "none";
    }

    function buildSelector(el: Element, idx: number): string {
      if ((el as HTMLElement).id) return `#${CSS.escape((el as HTMLElement).id)}`;
      return `__agent_idx_${idx}`;
    }

    const clickableEls = Array.from(
      document.querySelectorAll<HTMLElement>(
        'a, button, input[type="submit"], input[type="button"], [role="button"], input[type="checkbox"], input[type="radio"]',
      ),
    ).filter(isVisible);

    const inputEls = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        'input[type="text"], input[type="email"], input:not([type]), textarea',
      ),
    ).filter(isVisible);

    clickableEls.forEach((el, i) => el.setAttribute("data-agent-idx", String(i)));
    inputEls.forEach((el, i) => el.setAttribute("data-agent-input-idx", String(i)));

    const clickables = clickableEls.slice(0, 40).map((el, i) => ({
      index: i,
      tag: el.tagName.toLowerCase(),
      text: (el.textContent ?? (el as HTMLInputElement).value ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120),
      selector: buildSelector(el, i),
    }));

    const inputs = inputEls.slice(0, 20).map((el, i) => ({
      index: i,
      type: el.getAttribute("type") ?? "text",
      name: el.getAttribute("name") ?? "",
      placeholder: el.getAttribute("placeholder") ?? "",
      selector: (el as HTMLElement).id
        ? `#${CSS.escape((el as HTMLElement).id)}`
        : `__input_idx_${i}`,
    }));

    return {
      url: window.location.href,
      title: document.title,
      visibleText: (document.body.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 4000),
      clickables,
      inputs,
    };
  });

  return data as PageSnapshot;
}

function resolveSelector(snap: PageSnapshot, selector: string): string {
  if (selector.startsWith("__agent_idx_")) {
    const idx = Number(selector.replace("__agent_idx_", ""));
    return `[data-agent-idx="${idx}"]`;
  }
  if (selector.startsWith("__input_idx_")) {
    const idx = Number(selector.replace("__input_idx_", ""));
    return `[data-agent-input-idx="${idx}"]`;
  }
  // Pass through the model's literal CSS selector.
  void snap;
  return selector;
}

// ─── Claude planner ─────────────────────────────────────────────────────────

function buildPlannerPrompt(
  snap: PageSnapshot,
  history: string[],
  userEmail: string | undefined,
): string {
  return `You are an autonomous browser agent. Your single job is to UNSUBSCRIBE the user from this email list.

User's email (use only if asked): ${userEmail ?? "unknown@example.com"}

Current page:
  URL: ${snap.url}
  Title: ${snap.title}
  Visible text (truncated):
${snap.visibleText}

Clickable elements:
${snap.clickables.map((c) => `  [${c.selector}] <${c.tag}> "${c.text}"`).join("\n") || "  (none)"}

Input fields:
${snap.inputs.map((i) => `  [${i.selector}] type=${i.type} name="${i.name}" placeholder="${i.placeholder}"`).join("\n") || "  (none)"}

Steps so far:
${history.length > 0 ? history.map((s, i) => `  ${i + 1}. ${s}`).join("\n") : "  (none)"}

Decide the SINGLE next action. Reply with ONLY a JSON object — no prose, no code fence. Schema:

  { "type": "click", "selector": "<one of the selectors above>", "reason": "..." }
  { "type": "fill",  "selector": "<one of the input selectors>", "value": "...", "reason": "..." }
  { "type": "finish","success": true|false, "reason": "..." }

Rules:
- If the page already shows a confirmation that the user has been unsubscribed, return finish/success=true.
- Prefer clicking the most explicit "Unsubscribe" / "Confirm" / "Yes, unsubscribe" button.
- If a checkbox must be ticked to unsubscribe from ALL lists, click it before the confirm button.
- If an email field is required, fill it with the user's email above.
- If the page is irrelevant (e.g. a 404, login wall, captcha) and you cannot proceed, return finish/success=false.
- Never click "Resubscribe", "Subscribe", "Update preferences and stay subscribed", or any link that would re-opt-in.`;
}

async function planNextAction(
  snap: PageSnapshot,
  history: string[],
  userEmail: string | undefined,
): Promise<AgentAction> {
  const client = getClient();
  const response = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 400,
    messages: [{ role: "user", content: buildPlannerPrompt(snap, history, userEmail) }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  // Strip code fences if Claude added them despite instructions.
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { type: "finish", success: false, reason: `Planner returned non-JSON: ${text.slice(0, 200)}` };
  }

  if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
    return { type: "finish", success: false, reason: "Planner returned invalid action shape" };
  }

  const obj = parsed as Record<string, unknown>;
  const type = obj["type"];
  if (type === "click" && typeof obj["selector"] === "string") {
    return {
      type: "click",
      selector: obj["selector"],
      reason: typeof obj["reason"] === "string" ? obj["reason"] : "",
    };
  }
  if (type === "fill" && typeof obj["selector"] === "string" && typeof obj["value"] === "string") {
    return {
      type: "fill",
      selector: obj["selector"],
      value: obj["value"],
      reason: typeof obj["reason"] === "string" ? obj["reason"] : "",
    };
  }
  if (type === "finish") {
    return {
      type: "finish",
      success: obj["success"] === true,
      reason: typeof obj["reason"] === "string" ? obj["reason"] : "",
    };
  }
  return { type: "finish", success: false, reason: "Unknown action type" };
}

// ─── Confirmation detection ─────────────────────────────────────────────────

function findConfirmation(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const phrase of CONFIRMATION_PHRASES) {
    const idx = lower.indexOf(phrase);
    if (idx >= 0) {
      const start = Math.max(0, idx - 30);
      const end = Math.min(text.length, idx + phrase.length + 80);
      return text.slice(start, end).trim();
    }
  }
  return undefined;
}

// ─── Main entry point ──────────────────────────────────────────────────────

export interface RunUnsubscribeOptions {
  /** User's email address — passed to the planner if a form requires it. */
  userEmail?: string;
  /** Override the maximum agent loop iterations. */
  maxSteps?: number;
}

export async function runUnsubscribeFlow(
  url: string,
  options: RunUnsubscribeOptions = {},
): Promise<UnsubscribeResult> {
  const screenshots: string[] = [];
  const steps: string[] = [];
  const maxSteps = options.maxSteps ?? MAX_STEPS;

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 AlecRae-Unsubscribe-Agent/1.0",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(ACTION_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    steps.push(`navigate ${url}`);

    screenshots.push((await page.screenshot({ fullPage: false, type: "png" })).toString("base64"));

    let success = false;
    let confirmationText: string | undefined;

    for (let step = 0; step < maxSteps; step++) {
      const snap = await snapshotPage(page);

      // Short-circuit: confirmation already on page.
      const confirm = findConfirmation(snap.visibleText);
      if (confirm) {
        success = true;
        confirmationText = confirm;
        steps.push(`detected confirmation: "${confirm.slice(0, 80)}"`);
        break;
      }

      const action = await planNextAction(snap, steps, options.userEmail);

      if (action.type === "finish") {
        steps.push(`finish (${action.success ? "success" : "fail"}): ${action.reason}`);
        success = action.success;
        if (action.success) {
          confirmationText = findConfirmation(snap.visibleText) ?? action.reason;
        }
        break;
      }

      const cssSelector = resolveSelector(snap, action.selector);
      try {
        if (action.type === "click") {
          await page.click(cssSelector, { timeout: ACTION_TIMEOUT_MS });
          steps.push(`click ${action.selector} — ${action.reason}`);
        } else {
          await page.fill(cssSelector, action.value, { timeout: ACTION_TIMEOUT_MS });
          steps.push(`fill ${action.selector} = "${action.value}" — ${action.reason}`);
        }
      } catch (err) {
        steps.push(`action failed: ${(err as Error).message}`);
        // Let the planner try again on the next loop iteration.
      }

      // Wait for any navigation / DOM settling.
      try {
        await page.waitForLoadState("networkidle", { timeout: 4_000 });
      } catch {
        /* ignore — some pages never go idle */
      }

      screenshots.push((await page.screenshot({ fullPage: false, type: "png" })).toString("base64"));
    }

    // Final confirmation sweep if we exhausted the loop without finishing.
    if (!success) {
      const finalSnap = await snapshotPage(page);
      const confirm = findConfirmation(finalSnap.visibleText);
      if (confirm) {
        success = true;
        confirmationText = confirm;
        steps.push(`final-sweep confirmation: "${confirm.slice(0, 80)}"`);
      }
    }

    const finalUrl = page.url();
    screenshots.push((await page.screenshot({ fullPage: false, type: "png" })).toString("base64"));

    await context.close();
    return {
      success,
      finalUrl,
      screenshots,
      steps,
      ...(confirmationText !== undefined ? { confirmationText } : {}),
    };
  } catch (err) {
    return {
      success: false,
      finalUrl: url,
      screenshots,
      steps,
      error: (err as Error).message,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
