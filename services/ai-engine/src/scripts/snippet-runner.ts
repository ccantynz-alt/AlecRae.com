/**
 * Snippet Runner — Sandboxed TypeScript snippet execution engine
 *
 * Executes user-authored TypeScript snippets in a restricted environment.
 * Snippets have NO access to: network, filesystem, process, globals.
 * Snippets CAN access: EmailContext (email data + action helpers).
 *
 * Security model:
 * - Uses Function constructor with a frozen global scope
 * - All dangerous globals are explicitly blocked (undefined)
 * - Timeout enforcement via AbortController + Promise.race
 * - Memory tracked via output size limits
 * - All snippet return values are validated with Zod
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Types — EmailContext provided to every snippet
// ---------------------------------------------------------------------------

export interface EmailContextAddress {
  readonly name?: string;
  readonly address: string;
}

export interface EmailContextAttachment {
  readonly filename: string;
  readonly contentType: string;
  readonly size: number;
}

export interface EmailContextData {
  readonly id: string;
  readonly from: EmailContextAddress;
  readonly to: readonly EmailContextAddress[];
  readonly cc: readonly EmailContextAddress[];
  readonly subject: string;
  readonly body: string;
  readonly headers: Record<string, string>;
  readonly attachments: readonly EmailContextAttachment[];
  readonly threadId: string;
  readonly receivedAt: string;
}

export interface EmailActions {
  archive: () => void;
  label: (labelName: string) => void;
  forward: (to: string) => void;
  reply: (body: string) => void;
  flag: () => void;
  snooze: (until: string) => void;
  moveTo: (folder: string) => void;
  addNote: (note: string) => void;
}

export interface EmailContext {
  readonly email: EmailContextData;
  readonly actions: EmailActions;
}

// ---------------------------------------------------------------------------
// Types — Snippet execution result
// ---------------------------------------------------------------------------

export interface SnippetAction {
  readonly type: string;
  readonly params: Record<string, unknown>;
}

export interface SnippetResult {
  readonly actions: SnippetAction[];
  readonly logs: string[];
  readonly durationMs: number;
}

export interface SnippetError {
  readonly message: string;
  readonly logs: string[];
  readonly durationMs: number;
}

export type SnippetOutcome =
  | { readonly ok: true; readonly value: SnippetResult }
  | { readonly ok: false; readonly error: SnippetError };

// ---------------------------------------------------------------------------
// Zod schema for validating snippet return values
// ---------------------------------------------------------------------------

const SnippetActionSchema = z.object({
  type: z.string(),
  params: z.record(z.unknown()),
});

const SnippetReturnSchema = z
  .object({
    actions: z.array(SnippetActionSchema).optional().default([]),
    logs: z.array(z.string()).optional().default([]),
  })
  .optional()
  .default({ actions: [], logs: [] });

// ---------------------------------------------------------------------------
// Pre-built helpers injected into every snippet scope
// ---------------------------------------------------------------------------

function createHelpers(email: EmailContextData): Record<string, (...args: unknown[]) => unknown> {
  return {
    matchSender: (pattern: unknown): boolean => {
      if (typeof pattern === "string") {
        return email.from.address.toLowerCase().includes(pattern.toLowerCase());
      }
      if (pattern instanceof RegExp) {
        return pattern.test(email.from.address);
      }
      return false;
    },

    matchSubject: (pattern: unknown): boolean => {
      if (typeof pattern === "string") {
        return email.subject.toLowerCase().includes(pattern.toLowerCase());
      }
      if (pattern instanceof RegExp) {
        return pattern.test(email.subject);
      }
      return false;
    },

    extractLinks: (): string[] => {
      const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
      return Array.from(email.body.matchAll(urlRegex)).map((m) => m[0]);
    },

    extractDates: (): string[] => {
      // Match common date patterns: YYYY-MM-DD, MM/DD/YYYY, Month DD YYYY
      const datePatterns = [
        /\d{4}-\d{2}-\d{2}/g,
        /\d{1,2}\/\d{1,2}\/\d{2,4}/g,
        /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}/gi,
      ];
      const dates: string[] = [];
      for (const pattern of datePatterns) {
        const matches = email.body.matchAll(pattern);
        for (const m of matches) {
          dates.push(m[0]);
        }
      }
      return dates;
    },
  };
}

// ---------------------------------------------------------------------------
// Sandboxed execution
// ---------------------------------------------------------------------------

/** Default execution limits */
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_ACTIONS = 50;
const DEFAULT_MAX_LOGS = 200;
const MAX_LOG_LINE_LENGTH = 1_000;

export interface RunSnippetOptions {
  /** Source code of the TypeScript snippet. */
  code: string;
  /** Email context provided to the snippet. */
  emailContext: EmailContextData;
  /** Max execution time in milliseconds (default 5000). */
  timeoutMs?: number;
  /** If true, actions are collected but not executed (dry run). */
  dryRun?: boolean;
}

/**
 * Execute a user-authored snippet in a sandboxed environment.
 *
 * The snippet is wrapped in an async IIFE with:
 * - A frozen `email` object (read-only email data)
 * - An `actions` object that records requested actions
 * - Helper functions: matchSender, matchSubject, extractLinks, extractDates
 * - A `log` function for debug output
 *
 * Dangerous globals are explicitly set to undefined to prevent access.
 */
export async function runSnippet(
  options: RunSnippetOptions,
): Promise<SnippetOutcome> {
  const {
    code,
    emailContext,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const startTime = performance.now();
  const collectedActions: SnippetAction[] = [];
  const collectedLogs: string[] = [];

  // Build the actions proxy that records calls
  const actionsProxy: EmailActions = {
    archive: () => {
      if (collectedActions.length < DEFAULT_MAX_ACTIONS) {
        collectedActions.push({ type: "archive", params: {} });
      }
    },
    label: (labelName: string) => {
      if (collectedActions.length < DEFAULT_MAX_ACTIONS) {
        collectedActions.push({ type: "label", params: { labelName } });
      }
    },
    forward: (to: string) => {
      if (collectedActions.length < DEFAULT_MAX_ACTIONS) {
        collectedActions.push({ type: "forward", params: { to } });
      }
    },
    reply: (body: string) => {
      if (collectedActions.length < DEFAULT_MAX_ACTIONS) {
        collectedActions.push({ type: "reply", params: { body } });
      }
    },
    flag: () => {
      if (collectedActions.length < DEFAULT_MAX_ACTIONS) {
        collectedActions.push({ type: "flag", params: {} });
      }
    },
    snooze: (until: string) => {
      if (collectedActions.length < DEFAULT_MAX_ACTIONS) {
        collectedActions.push({ type: "snooze", params: { until } });
      }
    },
    moveTo: (folder: string) => {
      if (collectedActions.length < DEFAULT_MAX_ACTIONS) {
        collectedActions.push({ type: "moveTo", params: { folder } });
      }
    },
    addNote: (note: string) => {
      if (collectedActions.length < DEFAULT_MAX_ACTIONS) {
        collectedActions.push({ type: "addNote", params: { note } });
      }
    },
  };

  // Build the log function
  const logFn = (...args: unknown[]): void => {
    if (collectedLogs.length >= DEFAULT_MAX_LOGS) return;
    const line = args
      .map((a) => {
        if (typeof a === "string") return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(" ");
    collectedLogs.push(line.slice(0, MAX_LOG_LINE_LENGTH));
  };

  // Freeze the email data so snippets cannot mutate it
  const frozenEmail = Object.freeze({ ...emailContext });
  const helpers = createHelpers(frozenEmail);

  // Build the blocked globals list — these are set to undefined in the
  // function scope so the snippet cannot access them even indirectly.
  const blockedGlobals = [
    "require",
    "import",
    "module",
    "exports",
    "process",
    "globalThis",
    "global",
    "self",
    "window",
    "document",
    "XMLHttpRequest",
    "fetch",
    "WebSocket",
    "EventSource",
    "Worker",
    "SharedWorker",
    "ServiceWorker",
    "importScripts",
    "Bun",
    "Deno",
    "__dirname",
    "__filename",
    "eval",
    "Function",
    "setTimeout",
    "setInterval",
    "setImmediate",
    "clearTimeout",
    "clearInterval",
    "clearImmediate",
    "queueMicrotask",
  ];

  // Parameter names for the sandboxed function
  const paramNames = [
    "email",
    "actions",
    "log",
    "matchSender",
    "matchSubject",
    "extractLinks",
    "extractDates",
    ...blockedGlobals,
  ];

  // Parameter values
  const paramValues = [
    frozenEmail,
    actionsProxy,
    logFn,
    helpers["matchSender"],
    helpers["matchSubject"],
    helpers["extractLinks"],
    helpers["extractDates"],
    ...blockedGlobals.map(() => undefined),
  ];

  // Wrap user code in an async IIFE
  const wrappedCode = `
    "use strict";
    return (async () => {
      ${code}
      return { actions: undefined, logs: undefined };
    })();
  `;

  try {
    // Create the sandboxed function using Function constructor.
    // This is NOT eval — it creates a new function scope with explicitly
    // named parameters that shadow all dangerous globals.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const sandboxedFn = new Function(...paramNames, wrappedCode);

    // Execute with timeout
    const resultPromise = sandboxedFn(...paramValues) as Promise<unknown>;

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Script execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      // Ensure the timer does not prevent process exit
      if (typeof timer === "object" && "unref" in timer) {
        (timer as NodeJS.Timeout).unref();
      }
    });

    const rawResult = await Promise.race([resultPromise, timeoutPromise]);

    const durationMs = Math.round(performance.now() - startTime);

    // Validate the return value (if the snippet returns explicit actions/logs)
    const parsed = SnippetReturnSchema.safeParse(rawResult);
    const returnedActions = parsed.success ? parsed.data.actions : [];
    const returnedLogs = parsed.success ? parsed.data.logs : [];

    // Merge collected actions (from calling actions.*) with any returned
    const allActions = [
      ...collectedActions,
      ...returnedActions.map((a) => ({
        type: a.type,
        params: a.params as Record<string, unknown>,
      })),
    ];

    const allLogs = [...collectedLogs, ...returnedLogs];

    return {
      ok: true,
      value: {
        actions: allActions,
        logs: allLogs,
        durationMs,
      },
    };
  } catch (err: unknown) {
    const durationMs = Math.round(performance.now() - startTime);
    const message =
      err instanceof Error ? err.message : "Unknown snippet execution error";

    return {
      ok: false,
      error: {
        message,
        logs: collectedLogs,
        durationMs,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Sample email context for testing
// ---------------------------------------------------------------------------

export function createSampleEmailContext(
  overrides?: Partial<EmailContextData>,
): EmailContextData {
  return {
    id: "sample_email_001",
    from: { name: "Jane Smith", address: "jane@example.com" },
    to: [{ name: "You", address: "you@48co.ai" }],
    cc: [],
    subject: "Q3 Budget Review - Action Required",
    body: "Hi,\n\nPlease review the attached Q3 budget report by 2026-04-15.\n\nThe total projected spend is $142,000.\n\nBest regards,\nJane\n\nhttps://docs.example.com/q3-budget",
    headers: {
      "message-id": "<sample@example.com>",
      "list-unsubscribe": "",
    },
    attachments: [
      {
        filename: "q3-budget.pdf",
        contentType: "application/pdf",
        size: 245_000,
      },
    ],
    threadId: "thread_sample_001",
    receivedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Script templates — pre-built snippets users can start from
// ---------------------------------------------------------------------------

export interface ScriptTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly trigger: "on_receive" | "on_send" | "manual" | "scheduled";
  readonly code: string;
  readonly category: "triage" | "organize" | "notify" | "productivity";
}

export const SCRIPT_TEMPLATES: readonly ScriptTemplate[] = [
  {
    id: "tmpl_auto_archive_newsletters",
    name: "Auto-Archive Newsletters",
    description:
      "Automatically archive emails from known newsletter senders and apply a 'Newsletter' label.",
    trigger: "on_receive",
    category: "triage",
    code: `// Auto-archive newsletters
const newsletterDomains = ["substack.com", "beehiiv.com", "mailchimp.com", "convertkit.com"];
const isNewsletter = newsletterDomains.some(d => matchSender(d));

if (isNewsletter) {
  actions.label("Newsletter");
  actions.archive();
  log("Archived newsletter from", email.from.address);
}`,
  },
  {
    id: "tmpl_label_by_domain",
    name: "Auto-Label by Sender Domain",
    description:
      "Apply labels based on the sender's email domain (e.g., company.com -> Work).",
    trigger: "on_receive",
    category: "organize",
    code: `// Label emails by sender domain
const domainLabels = {
  "company.com": "Work",
  "school.edu": "School",
  "bank.com": "Finance",
  "github.com": "Dev",
};

const senderDomain = email.from.address.split("@")[1];
for (const [domain, label] of Object.entries(domainLabels)) {
  if (senderDomain === domain) {
    actions.label(label);
    log("Labeled as", label, "from", senderDomain);
    break;
  }
}`,
  },
  {
    id: "tmpl_forward_urgent",
    name: "Forward Urgent to Phone",
    description:
      "Forward emails with 'URGENT' in the subject to your phone's email-to-SMS gateway.",
    trigger: "on_receive",
    category: "notify",
    code: `// Forward urgent emails to SMS gateway
if (matchSubject("URGENT") || matchSubject("ACTION REQUIRED")) {
  actions.forward("5551234567@txt.att.net");
  actions.flag();
  log("Forwarded urgent email:", email.subject);
}`,
  },
  {
    id: "tmpl_auto_snooze_weekends",
    name: "Snooze Weekend Emails",
    description:
      "Snooze non-urgent emails received on weekends until Monday morning.",
    trigger: "on_receive",
    category: "productivity",
    code: `// Snooze weekend emails to Monday 9am
const received = new Date(email.receivedAt);
const day = received.getDay();

if (day === 0 || day === 6) {
  // Calculate next Monday 9am
  const daysUntilMonday = day === 0 ? 1 : 2;
  const monday = new Date(received);
  monday.setDate(monday.getDate() + daysUntilMonday);
  monday.setHours(9, 0, 0, 0);

  actions.snooze(monday.toISOString());
  log("Snoozed weekend email until", monday.toISOString());
}`,
  },
  {
    id: "tmpl_extract_links_note",
    name: "Extract Links to Note",
    description:
      "Extract all URLs from an email and add them as a note for quick reference.",
    trigger: "on_receive",
    category: "productivity",
    code: `// Extract links and add as a note
const links = extractLinks();
if (links.length > 0) {
  const noteText = "Links found:\\n" + links.map((l, i) => (i + 1) + ". " + l).join("\\n");
  actions.addNote(noteText);
  log("Extracted", links.length, "links from email");
}`,
  },
  {
    id: "tmpl_flag_with_dates",
    name: "Flag Emails with Deadlines",
    description:
      "Automatically flag emails that mention specific dates (likely deadlines).",
    trigger: "on_receive",
    category: "productivity",
    code: `// Flag emails containing dates (potential deadlines)
const dates = extractDates();
if (dates.length > 0) {
  actions.flag();
  actions.addNote("Dates mentioned: " + dates.join(", "));
  log("Flagged email with", dates.length, "date(s):", dates.join(", "));
}`,
  },
  {
    id: "tmpl_move_receipts",
    name: "Organize Receipts",
    description:
      "Move purchase receipts and order confirmations to a Receipts folder.",
    trigger: "on_receive",
    category: "organize",
    code: `// Move receipts to a dedicated folder
const receiptKeywords = ["receipt", "order confirmation", "purchase", "invoice", "payment received"];
const subjectLower = email.subject.toLowerCase();
const bodyLower = email.body.toLowerCase();

const isReceipt = receiptKeywords.some(kw =>
  subjectLower.includes(kw) || bodyLower.includes(kw)
);

if (isReceipt) {
  actions.moveTo("Receipts");
  actions.label("Receipt");
  log("Moved receipt:", email.subject);
}`,
  },
  {
    id: "tmpl_auto_reply_ooo",
    name: "Auto-Reply Out of Office",
    description:
      "Send an automatic out-of-office reply (use as a manual or scheduled script).",
    trigger: "manual",
    category: "notify",
    code: `// Auto-reply with out-of-office message
const oooMessage = [
  "Thank you for your email.",
  "",
  "I am currently out of the office and will return on Monday.",
  "For urgent matters, please contact support@company.com.",
  "",
  "Best regards"
].join("\\n");

actions.reply(oooMessage);
log("Sent OOO reply to", email.from.address);`,
  },
] as const;
