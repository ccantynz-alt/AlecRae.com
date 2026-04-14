/**
 * AlecRae Mobile — API Client
 *
 * Typed fetch wrapper that communicates with the AlecRae /v1/* endpoints.
 * Uses expo-secure-store for token persistence (never localStorage).
 * Falls back to the configured API_URL or localhost for development.
 */

import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

// ─── Configuration ────────────────────────────────────────────────────────

const EXTRA = Constants.expoConfig?.extra as
  | Record<string, unknown>
  | undefined;

const API_BASE: string =
  (typeof EXTRA?.["apiUrl"] === "string" ? EXTRA["apiUrl"] : undefined) ??
  "http://localhost:3001";

const AUTH_TOKEN_KEY = "alecrae_auth_token";

// ─── Types ────────────────────────────────────────────────────────────────

export interface ApiError {
  readonly error: {
    readonly type: string;
    readonly message: string;
    readonly code: string;
    readonly details?: unknown;
  };
}

export interface EmailAddress {
  readonly email: string;
  readonly name?: string;
}

export interface InboxThread {
  readonly id: string;
  readonly from: EmailAddress;
  readonly to: readonly EmailAddress[];
  readonly subject: string;
  readonly preview: string;
  readonly unread: boolean;
  readonly starred: boolean;
  readonly hasAttachments: boolean;
  readonly messageCount: number;
  readonly receivedAt: string;
  readonly labels: readonly string[];
}

export interface ThreadDetail {
  readonly id: string;
  readonly subject: string;
  readonly messages: readonly ThreadMessage[];
}

export interface ThreadMessage {
  readonly id: string;
  readonly from: EmailAddress;
  readonly to: readonly EmailAddress[];
  readonly cc: readonly EmailAddress[];
  readonly subject: string;
  readonly textBody: string | null;
  readonly htmlBody: string | null;
  readonly receivedAt: string;
  readonly attachments: readonly {
    readonly filename: string;
    readonly contentType: string;
    readonly size: number;
  }[];
}

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: string;
  readonly accountId: string;
}

export interface AuthResponse {
  readonly token: string;
  readonly user: AuthUser;
}

export interface PaginatedResponse<T> {
  readonly data: readonly T[];
  readonly cursor: string | null;
  readonly hasMore: boolean;
}

export interface SearchResult {
  readonly id: string;
  readonly subject: string;
  readonly from: EmailAddress;
  readonly snippet: string;
  readonly createdAt: string;
}

export interface SearchResponse {
  readonly data: readonly SearchResult[];
  readonly totalHits: number;
  readonly processingTimeMs: number;
  readonly query: string;
}

export interface UserSettings {
  readonly theme: "light" | "dark" | "system";
  readonly density: "compact" | "comfortable" | "spacious";
  readonly accentColor: string;
  readonly notifications: boolean;
  readonly signature: string;
}

// ─── Token management ─────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
}

export async function hasToken(): Promise<boolean> {
  const token = await getToken();
  return token !== null && token.length > 0;
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────

export const authApi = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await apiFetch<{ data: AuthResponse }>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await setToken(res.data.token);
    return res.data;
  },

  async register(payload: {
    email: string;
    password: string;
    name: string;
    accountName?: string;
  }): Promise<AuthResponse> {
    const res = await apiFetch<{ data: AuthResponse }>("/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await setToken(res.data.token);
    return res.data;
  },

  async logout(): Promise<void> {
    await clearToken();
  },

  async me(): Promise<AuthUser> {
    const res = await apiFetch<{ data: AuthUser }>("/v1/auth/me");
    return res.data;
  },
};

// ─── Inbox ────────────────────────────────────────────────────────────────

export const inboxApi = {
  async list(params?: {
    cursor?: string;
    limit?: number;
    mailbox?: string;
  }): Promise<PaginatedResponse<InboxThread>> {
    const qs = new URLSearchParams();
    if (params?.cursor) qs.set("cursor", params.cursor);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.mailbox) qs.set("mailbox", params.mailbox);
    const query = qs.toString();
    return apiFetch<PaginatedResponse<InboxThread>>(
      `/v1/inbox${query ? `?${query}` : ""}`,
    );
  },

  async getThread(threadId: string): Promise<ThreadDetail> {
    const res = await apiFetch<{ data: ThreadDetail }>(
      `/v1/inbox/threads/${threadId}`,
    );
    return res.data;
  },

  async archive(threadId: string): Promise<void> {
    await apiFetch(`/v1/inbox/threads/${threadId}/archive`, {
      method: "POST",
    });
  },

  async markRead(threadId: string): Promise<void> {
    await apiFetch(`/v1/inbox/threads/${threadId}/read`, { method: "POST" });
  },

  async snooze(threadId: string, until: string): Promise<void> {
    await apiFetch(`/v1/inbox/threads/${threadId}/snooze`, {
      method: "POST",
      body: JSON.stringify({ until }),
    });
  },

  async deleteThread(threadId: string): Promise<void> {
    await apiFetch(`/v1/inbox/threads/${threadId}`, { method: "DELETE" });
  },
};

// ─── Messages ─────────────────────────────────────────────────────────────

export const messagesApi = {
  async send(payload: {
    from: EmailAddress;
    to: readonly EmailAddress[];
    cc?: readonly EmailAddress[];
    bcc?: readonly EmailAddress[];
    subject: string;
    text?: string;
    html?: string;
  }): Promise<{ id: string; messageId: string; status: string }> {
    return apiFetch("/v1/messages/send", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async search(params: {
    q: string;
    mailbox?: string;
    limit?: number;
    offset?: number;
  }): Promise<SearchResponse> {
    const qs = new URLSearchParams();
    qs.set("q", params.q);
    if (params.mailbox) qs.set("mailbox", params.mailbox);
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.offset) qs.set("offset", String(params.offset));
    return apiFetch<SearchResponse>(
      `/v1/messages/search?${qs.toString()}`,
    );
  },
};

// ─── Settings ─────────────────────────────────────────────────────────────

export const settingsApi = {
  async get(): Promise<UserSettings> {
    const res = await apiFetch<{ data: UserSettings }>("/v1/account/settings");
    return res.data;
  },

  async update(settings: Partial<UserSettings>): Promise<UserSettings> {
    const res = await apiFetch<{ data: UserSettings }>(
      "/v1/account/settings",
      { method: "PATCH", body: JSON.stringify(settings) },
    );
    return res.data;
  },
};
