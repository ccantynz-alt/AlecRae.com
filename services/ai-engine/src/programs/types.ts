/**
 * AlecRae Programmable Email — Public Types
 *
 * These types are exposed to user-authored TypeScript snippets that run
 * inside the AlecRae sandbox on every email. They are also published as a
 * standalone declaration package (`@alecrae/programs`) so users get full
 * IntelliSense in their editor.
 *
 * @example A minimal user program
 * ```ts
 * // Auto-archive newsletters and label them.
 * export default function (email: ProgramEmail, actions: ProgramActions): void {
 *   if (email.isNewsletter) {
 *     actions.label("Newsletters");
 *     actions.archive();
 *   }
 * }
 * ```
 *
 * @example AI-assisted triage
 * ```ts
 * export default async function (email: ProgramEmail, actions: ProgramActions) {
 *   const summary = await actions.runAI(`Summarise this email in one line: ${email.body}`);
 *   if (summary.toLowerCase().includes("invoice")) {
 *     actions.label("Finance");
 *     actions.star();
 *   }
 * }
 * ```
 */

/** A single email header pair. Header names are case-insensitive. */
export interface ProgramEmailHeader {
  readonly name: string;
  readonly value: string;
}

/** A typed mailbox address. */
export interface ProgramAddress {
  readonly email: string;
  readonly name: string | null;
}

/** Read-only attachment metadata exposed to user programs. */
export interface ProgramAttachment {
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

/**
 * The email object passed to every user program. Fully read-only —
 * the only way to mutate state is through the `actions` API.
 */
export interface ProgramEmail {
  readonly id: string;
  readonly messageId: string;
  readonly threadId: string | null;
  readonly from: ProgramAddress;
  readonly to: readonly ProgramAddress[];
  readonly cc: readonly ProgramAddress[];
  readonly bcc: readonly ProgramAddress[];
  readonly replyTo: ProgramAddress | null;
  readonly subject: string;
  readonly body: string;
  readonly bodyHtml: string | null;
  readonly snippet: string;
  readonly headers: readonly ProgramEmailHeader[];
  readonly labels: readonly string[];
  readonly attachments: readonly ProgramAttachment[];
  readonly isUnread: boolean;
  readonly isStarred: boolean;
  readonly isNewsletter: boolean;
  readonly isTransactional: boolean;
  readonly receivedAt: string; // ISO 8601
  readonly sizeBytes: number;
}

// ─── Action discriminated union ──────────────────────────────────────────────

export type ProgramAction =
  | { readonly type: "archive" }
  | { readonly type: "trash" }
  | { readonly type: "star" }
  | { readonly type: "unstar" }
  | { readonly type: "markRead" }
  | { readonly type: "markUnread" }
  | { readonly type: "label"; readonly name: string }
  | { readonly type: "removeLabel"; readonly name: string }
  | { readonly type: "reply"; readonly text: string }
  | { readonly type: "forward"; readonly to: string; readonly note?: string }
  | { readonly type: "snooze"; readonly until: string }
  | { readonly type: "runAI"; readonly prompt: string; readonly response: string };

/**
 * The mutation API exposed to user programs. Every method is fire-and-forget
 * from the program's perspective: it pushes an action onto the queue, which
 * the host applies after the program finishes executing.
 *
 * `runAI` is special — it is awaitable and returns a string response from
 * the host LLM, while still being recorded as an action for auditability.
 */
export interface ProgramActions {
  archive(): void;
  trash(): void;
  star(): void;
  unstar(): void;
  markRead(): void;
  markUnread(): void;
  label(name: string): void;
  removeLabel(name: string): void;
  reply(text: string): void;
  forward(to: string, note?: string): void;
  /** @param until ISO 8601 datetime */
  snooze(until: string | Date): void;
  /** Awaitable. Calls the host LLM and returns its text response. */
  runAI(prompt: string): Promise<string>;
}

/** Result returned from `runProgram`. */
export interface ProgramResult {
  readonly actions: readonly ProgramAction[];
  readonly logs: readonly string[];
  readonly error?: string;
  readonly durationMs: number;
}

/** Trigger types a program can subscribe to. */
export type ProgramTrigger = "email.received" | "email.sent";
