/**
 * API client for the Programmable Email feature domain
 * (apps/api/src/routes/programs.ts).
 *
 * "Programs" are user-authored TypeScript snippets that run on every email —
 * Apps Script, but type-safe and sandboxed via QuickJS. Each program subscribes
 * to triggers (email.received / email.sent), captures actions (label, archive,
 * reply, …) which the host applies after review, and keeps a run history.
 *
 * Covers all 8 backend endpoints (mounted at /v1/programs in server.ts):
 *   POST   /v1/programs            — create
 *   GET    /v1/programs            — list
 *   GET    /v1/programs/:id        — get one
 *   PUT    /v1/programs/:id        — update
 *   DELETE /v1/programs/:id        — delete
 *   POST   /v1/programs/:id/test   — dry-run against a sample email
 *   GET    /v1/programs/:id/runs   — recent execution history
 *   POST   /v1/programs/:id/toggle — enable/disable
 *
 * Mirrors the featureFetch wrapper in lib/api-features.ts (not exported from
 * there) so this domain has its own typed entry point with silent 401 →
 * refresh → retry handling — same pattern as lib/api-delegation.ts.
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface ProgramsApiError {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

async function programsFetch<T>(
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

  // Silent access-token renewal on expiry — mirrors lib/api.ts apiFetch.
  if (res.status === 401 && !retried && getRefreshToken()) {
    const fresh = await refreshSession();
    if (fresh) {
      return programsFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as ProgramsApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Types (mirror apps/api/src/routes/programs.ts + services/ai-engine types) ─

export type ProgramTrigger = "email.received" | "email.sent";

/** A program row as serialized by the API (ISO timestamps). */
export interface Program {
  id: string;
  accountId: string;
  name: string;
  description: string;
  code: string;
  triggers: ProgramTrigger[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  runCount: number;
  errorCount: number;
}

/**
 * A single captured action from a run. The backend stores a loosely-typed
 * jsonb array (`{ type: string; [key: string]: unknown }`), so `type` is the
 * only guaranteed field; extra keys (name, text, prompt, …) are read
 * defensively in the UI.
 */
export interface ProgramRunAction {
  type: string;
  [key: string]: unknown;
}

/** A serialized run-history row. */
export interface ProgramRun {
  id: string;
  programId: string;
  emailId: string | null;
  startedAt: string;
  durationMs: number;
  actions: ProgramRunAction[];
  logs: string[];
  error: string | null;
}

/** Result payload from the sandbox (services/ai-engine ProgramResult). */
export interface ProgramTestResult {
  actions: ProgramRunAction[];
  logs: string[];
  error?: string;
  durationMs: number;
}

export interface ProgramTestResponse {
  dryRun: boolean;
  result: ProgramTestResult;
  run: ProgramRun;
}

/** A mailbox address on a sample email. */
export interface SampleAddress {
  email: string;
  name: string | null;
}

/**
 * Sample email for a dry-run test. The backend applies generous Zod defaults,
 * so callers only need to supply `from` — everything else is optional.
 */
export interface SampleEmail {
  from: SampleAddress;
  subject?: string;
  body?: string;
  snippet?: string;
  to?: SampleAddress[];
  labels?: string[];
  isUnread?: boolean;
  isStarred?: boolean;
  isNewsletter?: boolean;
  isTransactional?: boolean;
}

export interface CreateProgramPayload {
  name: string;
  description?: string;
  code: string;
  triggers?: ProgramTrigger[];
  enabled?: boolean;
}

export interface UpdateProgramPayload {
  name?: string;
  description?: string;
  code?: string;
  triggers?: ProgramTrigger[];
  enabled?: boolean;
}

export interface TestProgramPayload {
  email: SampleEmail;
  /** Optional override of the stored code (for live editor previews). */
  code?: string;
  timeoutMs?: number;
}

// ─── Programs API (/v1/programs) ──────────────────────────────────────────────

export const programsApi = {
  /** POST /v1/programs — create a program. */
  create(payload: CreateProgramPayload): Promise<{ data: Program }> {
    return programsFetch<{ data: Program }>("/v1/programs", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** GET /v1/programs — list all programs for the account (newest first). */
  list(): Promise<{ data: Program[] }> {
    return programsFetch<{ data: Program[] }>("/v1/programs");
  },

  /** GET /v1/programs/:id — get a single program. */
  get(id: string): Promise<{ data: Program }> {
    return programsFetch<{ data: Program }>(
      `/v1/programs/${encodeURIComponent(id)}`,
    );
  },

  /** PUT /v1/programs/:id — update name, description, code, triggers, enabled. */
  update(id: string, payload: UpdateProgramPayload): Promise<{ data: Program }> {
    return programsFetch<{ data: Program }>(
      `/v1/programs/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
  },

  /** DELETE /v1/programs/:id — delete a program (runs cascade). */
  remove(id: string): Promise<{ data: { deleted: boolean; id: string } }> {
    return programsFetch<{ data: { deleted: boolean; id: string } }>(
      `/v1/programs/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  /** POST /v1/programs/:id/test — dry-run against a sample email. */
  test(
    id: string,
    payload: TestProgramPayload,
  ): Promise<{ data: ProgramTestResponse }> {
    return programsFetch<{ data: ProgramTestResponse }>(
      `/v1/programs/${encodeURIComponent(id)}/test`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  /** GET /v1/programs/:id/runs — recent execution history. */
  runs(id: string, limit?: number): Promise<{ data: ProgramRun[] }> {
    const qs = limit !== undefined ? `?limit=${encodeURIComponent(String(limit))}` : "";
    return programsFetch<{ data: ProgramRun[] }>(
      `/v1/programs/${encodeURIComponent(id)}/runs${qs}`,
    );
  },

  /** POST /v1/programs/:id/toggle — flip enabled on/off. */
  toggle(id: string): Promise<{ data: Program }> {
    return programsFetch<{ data: Program }>(
      `/v1/programs/${encodeURIComponent(id)}/toggle`,
      { method: "POST" },
    );
  },
};
