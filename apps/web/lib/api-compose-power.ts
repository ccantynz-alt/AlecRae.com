/**
 * API clients for the "compose power" feature domains:
 *
 *   1. Compose-Assist (apps/api/src/routes/compose-assist.ts) — mounted at
 *      /v1/compose-assist. NB: despite the "AI writing help" framing, this route
 *      is the B7 calendar-slot assistant (detect meeting intent → suggest slots →
 *      format slots for insertion). suggest-slots is already wired into the compose
 *      page via ComposeEditor's onRequestCalendarSlots, so this client exposes the
 *      two remaining endpoints:
 *        POST /v1/compose-assist/detect-meeting   — detect meeting intent in draft
 *        POST /v1/compose-assist/insert-slots     — format slots as markdown/text/html
 *
 *   2. Spell Check (apps/api/src/routes/spellcheck.ts) — mounted at
 *      /v1/compose/spellcheck:
 *        POST   /v1/compose/spellcheck                  — check text
 *        GET    /v1/compose/spellcheck/languages        — supported languages
 *        POST   /v1/compose/spellcheck/dictionary       — add custom word
 *        DELETE /v1/compose/spellcheck/dictionary/:word — remove custom word
 *        GET    /v1/compose/spellcheck/dictionary       — list custom words
 *
 *   3. Email Recall (apps/api/src/routes/recall.ts) — mounted at /v1/recall:
 *        POST /v1/recall/enable         — enable link-based recall for a sent email
 *        POST /v1/recall/revoke/:id     — revoke access (id = emailId)
 *        GET  /v1/recall/status/:id     — recall status (id = emailId)
 *        POST /v1/recall/self-destruct  — set an auto-destruct timer
 *      (GET /v1/recall/view/:token is the public unauthenticated viewer — not called here.)
 *
 * All authenticated calls use the shared 401 → refreshSession → retry pattern,
 * mirroring lib/api-delegation.ts.
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface ComposePowerApiError {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

async function composePowerFetch<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const token = getAccessToken();

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // Silent access-token renewal on expiry — mirrors lib/api-delegation.ts.
  if (res.status === 401 && !retried && getRefreshToken()) {
    const fresh = await refreshSession();
    if (fresh) {
      return composePowerFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as ComposePowerApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Compose-Assist (calendar-slot) types ────────────────────────────────────

export interface ExtractedTime {
  readonly raw: string;
  readonly parsed: string | null;
}

export interface MeetingIntentResult {
  readonly hasMeetingIntent: boolean;
  readonly confidence: number;
  readonly extractedTimes: readonly ExtractedTime[];
  readonly suggestedDurationMinutes?: number;
}

export interface FormattedSlot {
  readonly start: string;
  readonly end: string;
  readonly formattedRange: string;
  readonly durationMinutes: number;
  readonly score: number;
  readonly reasoning: string;
}

export type SlotInsertFormat = "markdown" | "text" | "html";

export interface InsertSlotsResult {
  readonly format: SlotInsertFormat;
  readonly content: string;
  readonly slotCount: number;
}

// ─── Spell Check types ───────────────────────────────────────────────────────

export interface SpellCheckIssue {
  readonly offset: number;
  readonly length: number;
  readonly word: string;
  readonly suggestions: readonly string[];
  readonly confidence: number;
  readonly language: string;
}

export interface SpellCheckResult {
  readonly issues: readonly SpellCheckIssue[];
  readonly detectedLanguage: string;
  readonly wordCount: number;
  readonly issueCount: number;
  readonly processingTimeMs: number;
}

export interface SpellCheckLanguage {
  readonly code: string;
  readonly name: string;
}

export interface CustomDictionaryWord {
  readonly id: string;
  readonly word: string;
  readonly language: string | null;
  readonly createdAt: string;
}

// ─── Recall types ────────────────────────────────────────────────────────────

export type RecallStatus = "active" | "revoked" | "expired";

export interface EnableRecallResult {
  readonly emailId: string;
  readonly token: string;
  readonly viewUrl: string;
  readonly status: RecallStatus;
  readonly viewCount?: number;
  readonly message?: string;
}

export interface RecallStatusResult {
  readonly emailId: string;
  readonly status: RecallStatus;
  readonly viewCount: number;
  readonly lastViewedAt: string | null;
  readonly revokedAt: string | null;
  readonly selfDestructAt: string | null;
  readonly createdAt: string;
}

export interface RevokeRecallResult {
  readonly emailId: string;
  readonly status: RecallStatus;
  readonly revokedAt: string;
  readonly message: string;
  readonly totalViews: number;
}

// ─── Compose-Assist API (/v1/compose-assist) ─────────────────────────────────

export const composeAssistApi = {
  /** POST /v1/compose-assist/detect-meeting — detect meeting intent in draft text. */
  detectMeeting(text: string): Promise<{ data: MeetingIntentResult }> {
    return composePowerFetch<{ data: MeetingIntentResult }>(
      "/v1/compose-assist/detect-meeting",
      { method: "POST", body: JSON.stringify({ text }) },
    );
  },

  /** POST /v1/compose-assist/insert-slots — format slots for insertion into the draft. */
  insertSlots(
    slots: readonly FormattedSlot[],
    options?: { format?: SlotInsertFormat; intro?: string },
  ): Promise<{ data: InsertSlotsResult }> {
    const payload: {
      slots: readonly FormattedSlot[];
      format?: SlotInsertFormat;
      intro?: string;
    } = { slots };
    if (options?.format) payload.format = options.format;
    if (options?.intro) payload.intro = options.intro;
    return composePowerFetch<{ data: InsertSlotsResult }>(
      "/v1/compose-assist/insert-slots",
      { method: "POST", body: JSON.stringify(payload) },
    );
  },
};

// ─── Spell Check API (/v1/compose/spellcheck) ────────────────────────────────

export const spellcheckApi = {
  /** POST /v1/compose/spellcheck — run spell check on text. */
  check(
    text: string,
    options?: { language?: string; customWords?: readonly string[] },
  ): Promise<{ data: SpellCheckResult }> {
    const payload: {
      text: string;
      language?: string;
      customWords?: readonly string[];
    } = { text };
    if (options?.language) payload.language = options.language;
    if (options?.customWords) payload.customWords = options.customWords;
    return composePowerFetch<{ data: SpellCheckResult }>(
      "/v1/compose/spellcheck",
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  /** GET /v1/compose/spellcheck/languages — list supported languages. */
  languages(): Promise<{ data: { languages: SpellCheckLanguage[] } }> {
    return composePowerFetch<{ data: { languages: SpellCheckLanguage[] } }>(
      "/v1/compose/spellcheck/languages",
    );
  },

  /** POST /v1/compose/spellcheck/dictionary — add a word to the custom dictionary. */
  addWord(
    word: string,
    language?: string,
  ): Promise<{ data: { id: string; word: string; language: string | null } }> {
    const payload: { word: string; language?: string } = { word };
    if (language) payload.language = language;
    return composePowerFetch<{
      data: { id: string; word: string; language: string | null };
    }>("/v1/compose/spellcheck/dictionary", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** DELETE /v1/compose/spellcheck/dictionary/:word — remove a word. */
  removeWord(
    word: string,
  ): Promise<{ data: { deleted: boolean; word: string } }> {
    return composePowerFetch<{ data: { deleted: boolean; word: string } }>(
      `/v1/compose/spellcheck/dictionary/${encodeURIComponent(word)}`,
      { method: "DELETE" },
    );
  },

  /** GET /v1/compose/spellcheck/dictionary — list custom dictionary words. */
  listDictionary(options?: {
    language?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    data: {
      words: CustomDictionaryWord[];
      pagination: { limit: number; offset: number; count: number };
    };
  }> {
    const params = new URLSearchParams();
    if (options?.language) params.set("language", options.language);
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.offset !== undefined)
      params.set("offset", String(options.offset));
    const qs = params.toString();
    return composePowerFetch<{
      data: {
        words: CustomDictionaryWord[];
        pagination: { limit: number; offset: number; count: number };
      };
    }>(`/v1/compose/spellcheck/dictionary${qs ? `?${qs}` : ""}`);
  },
};

// ─── Recall API (/v1/recall) ─────────────────────────────────────────────────

export const recallApi = {
  /** POST /v1/recall/enable — enable link-based recall for a sent email. */
  enable(emailId: string): Promise<{ data: EnableRecallResult }> {
    return composePowerFetch<{ data: EnableRecallResult }>(
      "/v1/recall/enable",
      { method: "POST", body: JSON.stringify({ emailId }) },
    );
  },

  /** POST /v1/recall/revoke/:id — revoke access to a recalled email (id = emailId). */
  revoke(emailId: string): Promise<{ data: RevokeRecallResult }> {
    return composePowerFetch<{ data: RevokeRecallResult }>(
      `/v1/recall/revoke/${encodeURIComponent(emailId)}`,
      { method: "POST" },
    );
  },

  /** GET /v1/recall/status/:id — check recall status (id = emailId). */
  status(emailId: string): Promise<{ data: RecallStatusResult }> {
    return composePowerFetch<{ data: RecallStatusResult }>(
      `/v1/recall/status/${encodeURIComponent(emailId)}`,
    );
  },

  /** POST /v1/recall/self-destruct — set an auto-destruct timer (in minutes). */
  selfDestruct(
    emailId: string,
    minutes: number,
  ): Promise<{
    data: {
      emailId: string;
      selfDestructAt: string;
      minutesRemaining: number;
      message: string;
    };
  }> {
    return composePowerFetch<{
      data: {
        emailId: string;
        selfDestructAt: string;
        minutesRemaining: number;
        message: string;
      };
    }>("/v1/recall/self-destruct", {
      method: "POST",
      body: JSON.stringify({ emailId, minutes }),
    });
  },
};
