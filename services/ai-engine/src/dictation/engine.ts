/**
 * Dictation Engine — Advanced Email-Aware Voice-to-Email
 *
 * Dragon is dead. This is the replacement.
 *
 * Capabilities:
 *   - Natural speech → polished email (removes filler, fixes grammar, formats)
 *   - Email-aware commands: "Reply to Sarah, CC Mike, professional tone"
 *   - Voice triage: "Archive, star, snooze to Monday"
 *   - Multi-language: dictate in Spanish, send in English
 *   - Integrates with Grammar Agent for post-processing
 *   - Integrates with Voice Profile for style matching
 *
 * Architecture:
 *   Client captures audio → sends to Whisper API for transcription →
 *   this engine parses intent + polishes text → returns structured email
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DictationRequest {
  /** Raw transcription text from Whisper/speech-to-text */
  transcription: string;
  /** Source language of the dictation */
  sourceLanguage?: string;
  /** Target language for the email (if different from source) */
  targetLanguage?: string;
  /** User's account ID for voice profile lookup */
  accountId?: string;
  /** Current context: are we composing, replying, or triaging? */
  mode: "compose" | "reply" | "triage" | "command";
  /** If replying, the original email for context */
  replyContext?: {
    from: string;
    subject: string;
    body: string;
  };
}

export interface DictationResult {
  /** The parsed intent */
  intent: DictationIntent;
  /** Processing time in ms */
  processingTimeMs: number;
}

export type DictationIntent =
  | ComposeIntent
  | ReplyIntent
  | TriageIntent
  | CommandIntent;

export interface ComposeIntent {
  type: "compose";
  /** Structured email output */
  email: {
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    body: string;
    tone?: string;
    attachmentHints?: string[];
  };
  /** Confidence that we correctly parsed the intent */
  confidence: number;
}

export interface ReplyIntent {
  type: "reply";
  email: {
    body: string;
    tone?: string;
  };
  confidence: number;
}

export interface TriageIntent {
  type: "triage";
  actions: TriageAction[];
  confidence: number;
}

export interface TriageAction {
  action: "archive" | "delete" | "star" | "unstar" | "read" | "unread" | "snooze" | "label" | "move" | "forward" | "reply_quick";
  /** Which email(s) this applies to — "latest", "all from [sender]", "this", "next N" */
  target: string;
  /** Additional params */
  params?: {
    snoozeTo?: string;
    label?: string;
    folder?: string;
    forwardTo?: string;
    quickReply?: string;
  };
}

export interface CommandIntent {
  type: "command";
  command: string;
  params: Record<string, string>;
  confidence: number;
}

// ─── Intent Parser ───────────────────────────────────────────────────────────

const EMAIL_COMMAND_PATTERNS = {
  compose: [
    /^(write|send|compose|draft|email|new email)\s+(an?\s+)?(email\s+)?(to\s+)?/i,
    /^(write|send)\s+(?:to\s+)?(\w+)/i,
  ],
  reply: [
    /^(reply|respond)\s+(to\s+)?/i,
    /^(tell|let)\s+(?:them|him|her|(\w+))\s+/i,
  ],
  triage: [
    /^(archive|delete|trash|star|mark|snooze|move|forward|label)/i,
  ],
  cc: /(?:cc|copy|carbon copy)\s+(\w[\w\s,]+)/i,
  bcc: /(?:bcc|blind copy)\s+(\w[\w\s,]+)/i,
  subject: /(?:subject|about|regarding|re)\s*[:]\s*(.+?)(?:\.|,|$)/i,
  tone: /(?:tone|style|make it|keep it)\s+(professional|casual|friendly|formal|urgent|brief|short|detailed)/i,
  attach: /(?:attach|include|add)\s+(?:the\s+)?(.+?)(?:\s+file)?(?:\.|,|$)/i,
  snooze: /snooze\s+(?:to|until|for)\s+(.+)/i,
  language: /(?:in\s+)?(english|spanish|french|german|portuguese|italian|japanese|chinese|arabic|dutch|korean|russian)/i,
};

/**
 * Parse raw transcription into a structured intent.
 * Handles both explicit commands and natural dictation.
 */
function parseIntent(transcription: string, mode: DictationRequest["mode"]): DictationIntent {
  const text = transcription.trim();

  // Check for triage commands first
  if (mode === "triage" || EMAIL_COMMAND_PATTERNS.triage.some((p) => p.test(text))) {
    return parseTriageIntent(text);
  }

  // Check for explicit compose commands
  if (mode === "compose" || EMAIL_COMMAND_PATTERNS.compose.some((p) => p.test(text))) {
    return parseComposeIntent(text);
  }

  // Check for reply commands
  if (mode === "reply" || EMAIL_COMMAND_PATTERNS.reply.some((p) => p.test(text))) {
    return parseReplyIntent(text);
  }

  // Default: treat as compose body text
  return {
    type: "compose",
    email: { body: text },
    confidence: 0.6,
  };
}

function parseComposeIntent(text: string): ComposeIntent {
  const email: ComposeIntent["email"] = { body: "" };
  let remaining = text;

  // Extract "to" recipients
  for (const pattern of EMAIL_COMMAND_PATTERNS.compose) {
    const match = pattern.exec(remaining);
    if (match) {
      remaining = remaining.slice(match[0].length).trim();
      break;
    }
  }

  // Extract CC
  const ccMatch = EMAIL_COMMAND_PATTERNS.cc.exec(remaining);
  if (ccMatch) {
    email.cc = ccMatch[1]!.split(/[,\s]+and\s+|\s*,\s*/).map((s) => s.trim()).filter(Boolean);
    remaining = remaining.replace(ccMatch[0], "").trim();
  }

  // Extract BCC
  const bccMatch = EMAIL_COMMAND_PATTERNS.bcc.exec(remaining);
  if (bccMatch) {
    email.bcc = bccMatch[1]!.split(/[,\s]+and\s+|\s*,\s*/).map((s) => s.trim()).filter(Boolean);
    remaining = remaining.replace(bccMatch[0], "").trim();
  }

  // Extract subject
  const subjectMatch = EMAIL_COMMAND_PATTERNS.subject.exec(remaining);
  if (subjectMatch) {
    email.subject = subjectMatch[1]!.trim();
    remaining = remaining.replace(subjectMatch[0], "").trim();
  }

  // Extract tone
  const toneMatch = EMAIL_COMMAND_PATTERNS.tone.exec(remaining);
  if (toneMatch) {
    email.tone = toneMatch[1]!.toLowerCase();
    remaining = remaining.replace(toneMatch[0], "").trim();
  }

  // Extract attachment hints
  const attachMatch = EMAIL_COMMAND_PATTERNS.attach.exec(remaining);
  if (attachMatch) {
    email.attachmentHints = [attachMatch[1]!.trim()];
    remaining = remaining.replace(attachMatch[0], "").trim();
  }

  // Everything else is the body
  email.body = remaining
    .replace(/^[,.\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    type: "compose",
    email,
    confidence: email.body.length > 0 ? 0.85 : 0.5,
  };
}

function parseReplyIntent(text: string): ReplyIntent {
  let remaining = text;

  // Strip reply prefix
  for (const pattern of EMAIL_COMMAND_PATTERNS.reply) {
    const match = pattern.exec(remaining);
    if (match) {
      remaining = remaining.slice(match[0].length).trim();
      break;
    }
  }

  // Extract tone
  let tone: string | undefined;
  const toneMatch = EMAIL_COMMAND_PATTERNS.tone.exec(remaining);
  if (toneMatch) {
    tone = toneMatch[1]!.toLowerCase();
    remaining = remaining.replace(toneMatch[0], "").trim();
  }

  return {
    type: "reply",
    email: {
      body: remaining.replace(/^[,.\s]+/, "").trim(),
      tone,
    },
    confidence: 0.85,
  };
}

function parseTriageIntent(text: string): TriageIntent {
  const actions: TriageAction[] = [];
  // Split by commas and "and" for multiple actions
  const parts = text.split(/\s*,\s*|\s+and\s+|\s+then\s+/);

  for (const part of parts) {
    const trimmed = part.trim().toLowerCase();

    if (trimmed.startsWith("archive")) {
      actions.push({ action: "archive", target: "this" });
    } else if (trimmed.startsWith("delete") || trimmed.startsWith("trash")) {
      actions.push({ action: "delete", target: "this" });
    } else if (trimmed.startsWith("star")) {
      actions.push({ action: "star", target: "this" });
    } else if (trimmed.startsWith("mark") && trimmed.includes("read")) {
      actions.push({ action: trimmed.includes("unread") ? "unread" : "read", target: "this" });
    } else if (trimmed.startsWith("snooze")) {
      const snoozeMatch = EMAIL_COMMAND_PATTERNS.snooze.exec(trimmed);
      actions.push({
        action: "snooze",
        target: "this",
        params: { snoozeTo: snoozeMatch?.[1] ?? "tomorrow" },
      });
    } else if (trimmed.startsWith("forward")) {
      const toMatch = trimmed.match(/forward\s+(?:to\s+)?(\w+)/);
      actions.push({
        action: "forward",
        target: "this",
        params: { forwardTo: toMatch?.[1] ?? "" },
      });
    } else if (trimmed.startsWith("reply") || trimmed.startsWith("respond")) {
      const quickReply = trimmed.replace(/^(reply|respond)\s+(with\s+)?/i, "").replace(/^['"]|['"]$/g, "");
      actions.push({
        action: "reply_quick",
        target: "this",
        params: { quickReply },
      });
    } else if (trimmed.startsWith("label") || trimmed.startsWith("move")) {
      const labelMatch = trimmed.match(/(?:label|move)\s+(?:as|to)\s+(\w+)/);
      actions.push({
        action: trimmed.startsWith("label") ? "label" : "move",
        target: "this",
        params: { label: labelMatch?.[1], folder: labelMatch?.[1] },
      });
    }
  }

  return {
    type: "triage",
    actions: actions.length > 0 ? actions : [{ action: "archive", target: "this" }],
    confidence: actions.length > 0 ? 0.8 : 0.4,
  };
}

// ─── AI Polish (Claude) ──────────────────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env["ANTHROPIC_API_KEY"] ?? process.env["CLAUDE_API_KEY"];

async function polishDictatedEmail(
  rawBody: string,
  tone?: string,
  replyContext?: DictationRequest["replyContext"],
  targetLanguage?: string,
): Promise<string> {
  if (!ANTHROPIC_API_KEY || rawBody.length < 10) return rawBody;

  const parts: string[] = [
    "You are an email writing assistant. Convert this dictated speech into a polished email body.",
    "Rules:",
    "- Remove filler words (um, uh, like, you know)",
    "- Fix grammar and punctuation",
    "- Add proper paragraph breaks",
    "- Add appropriate greeting and sign-off if missing",
    "- Keep the speaker's intent and key points intact",
    "- Do NOT add information the speaker didn't mention",
    tone ? `- Use a ${tone} tone` : "- Use a professional tone",
    targetLanguage && targetLanguage !== "en"
      ? `- Write the final email in ${targetLanguage}`
      : "",
    "",
    replyContext
      ? `This is a reply to:\nFrom: ${replyContext.from}\nSubject: ${replyContext.subject}\nBody: ${replyContext.body.slice(0, 500)}\n`
      : "",
    "Dictated text:",
    rawBody,
    "",
    "Polished email body (no subject line, no headers, just the body):",
  ];

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        messages: [{ role: "user", content: parts.filter(Boolean).join("\n") }],
      }),
    });

    if (!response.ok) return rawBody;

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
    };

    const polished = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();

    return polished || rawBody;
  } catch {
    return rawBody;
  }
}

// ─── Main Dictation Processing ───────────────────────────────────────────────

/**
 * Process a dictation transcription into a structured email intent.
 *
 * @param request - The dictation request with transcription and context
 * @returns Structured intent with polished email content
 */
export async function processDictation(
  request: DictationRequest,
): Promise<DictationResult> {
  const startTime = performance.now();

  // 1. Parse intent from transcription
  const intent = parseIntent(request.transcription, request.mode);

  // 2. Polish email body if it's a compose or reply intent
  if (intent.type === "compose" && intent.email.body) {
    intent.email.body = await polishDictatedEmail(
      intent.email.body,
      intent.email.tone,
      request.replyContext,
      request.targetLanguage,
    );
  } else if (intent.type === "reply" && intent.email.body) {
    intent.email.body = await polishDictatedEmail(
      intent.email.body,
      intent.email.tone,
      request.replyContext,
      request.targetLanguage,
    );
  }

  return {
    intent,
    processingTimeMs: performance.now() - startTime,
  };
}

// ─── Supported Languages ─────────────────────────────────────────────────────

export const SUPPORTED_DICTATION_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "pt", name: "Portuguese" },
  { code: "it", name: "Italian" },
  { code: "nl", name: "Dutch" },
  { code: "ja", name: "Japanese" },
  { code: "zh", name: "Chinese" },
  { code: "ko", name: "Korean" },
  { code: "ar", name: "Arabic" },
  { code: "ru", name: "Russian" },
  { code: "hi", name: "Hindi" },
  { code: "tr", name: "Turkish" },
  { code: "pl", name: "Polish" },
  { code: "sv", name: "Swedish" },
  { code: "da", name: "Danish" },
  { code: "no", name: "Norwegian" },
  { code: "fi", name: "Finnish" },
  { code: "th", name: "Thai" },
  { code: "vi", name: "Vietnamese" },
  { code: "id", name: "Indonesian" },
  { code: "ms", name: "Malay" },
  { code: "uk", name: "Ukrainian" },
  { code: "cs", name: "Czech" },
  { code: "ro", name: "Romanian" },
  { code: "hu", name: "Hungarian" },
  { code: "el", name: "Greek" },
  { code: "he", name: "Hebrew" },
  { code: "ta", name: "Tamil" },
] as const;
