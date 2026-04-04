/**
 * API Client for the Emailed backend.
 *
 * Typed fetch wrapper that communicates with the /v1/* endpoints.
 * Handles auth tokens, error responses, and response parsing.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ApiError {
  error: {
    type: string;
    message: string;
    code: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
}

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface Message {
  id: string;
  messageId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  subject: string;
  status: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

export interface MessageDetail extends Message {
  deliveryResults: {
    recipient: string;
    status: string;
    mxHost: string | null;
    responseCode: number | null;
    response: string | null;
    attempts: number;
    deliveredAt: string | null;
    nextRetryAt: string | null;
  }[];
}

export interface Domain {
  id: string;
  domain: string;
  verificationStatus: string;
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
  createdAt: string;
}

export interface OverviewStats {
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  opened: number;
  clicked: number;
  deliveryRate: number;
  bounceRate: number;
  openRate: number;
  clickRate: number;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: Record<string, boolean>;
  environment: string;
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface Account {
  id: string;
  name: string;
  planTier: string;
  billingEmail: string;
  emailsSentThisPeriod: number;
  periodStartedAt: string;
  createdAt: string;
}

// ─── Core fetch wrapper ────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("emailed_api_key") ?? ""
      : "";

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
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

// ─── Messages ──────────────────────────────────────────────────────────────

export const messagesApi = {
  send(payload: {
    from: EmailAddress;
    to: EmailAddress[];
    cc?: EmailAddress[];
    bcc?: EmailAddress[];
    replyTo?: EmailAddress;
    subject: string;
    text?: string;
    html?: string;
    tags?: string[];
    scheduledAt?: string;
  }) {
    return apiFetch<{ id: string; messageId: string; status: string }>(
      "/v1/messages/send",
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  get(id: string) {
    return apiFetch<{ data: MessageDetail }>(`/v1/messages/${id}`);
  },

  list(params?: { cursor?: string; limit?: number; status?: string; tag?: string }) {
    const qs = new URLSearchParams();
    if (params?.cursor) qs.set("cursor", params.cursor);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.status) qs.set("status", params.status);
    if (params?.tag) qs.set("tag", params.tag);
    const query = qs.toString();
    return apiFetch<PaginatedResponse<Message>>(
      `/v1/messages${query ? `?${query}` : ""}`,
    );
  },
};

// ─── Domains ───────────────────────────────────────────────────────────────

export const domainsApi = {
  add(domain: string) {
    return apiFetch<{ data: Domain }>("/v1/domains", {
      method: "POST",
      body: JSON.stringify({ domain }),
    });
  },

  list() {
    return apiFetch<{ data: Domain[] }>("/v1/domains");
  },

  get(id: string) {
    return apiFetch<{ data: Domain }>(`/v1/domains/${id}`);
  },

  verify(id: string) {
    return apiFetch<{ data: Domain }>(`/v1/domains/${id}/verify`, {
      method: "POST",
    });
  },

  remove(id: string) {
    return apiFetch<{ deleted: boolean }>(`/v1/domains/${id}`, {
      method: "DELETE",
    });
  },
};

// ─── Analytics ─────────────────────────────────────────────────────────────

export const analyticsApi = {
  overview(params?: { from?: string; to?: string }) {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const query = qs.toString();
    return apiFetch<{ data: OverviewStats }>(
      `/v1/analytics/overview${query ? `?${query}` : ""}`,
    );
  },

  deliverability(params?: { from?: string; to?: string; granularity?: string }) {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.granularity) qs.set("granularity", params.granularity);
    const query = qs.toString();
    return apiFetch<{ data: unknown[] }>(
      `/v1/analytics/deliverability${query ? `?${query}` : ""}`,
    );
  },
};

// ─── Webhooks ──────────────────────────────────────────────────────────────

export const webhooksApi = {
  create(payload: { url: string; events: string[]; description?: string }) {
    return apiFetch<{ data: Webhook }>("/v1/webhooks", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  list() {
    return apiFetch<{ data: Webhook[] }>("/v1/webhooks");
  },

  remove(id: string) {
    return apiFetch<{ deleted: boolean }>(`/v1/webhooks/${id}`, {
      method: "DELETE",
    });
  },
};

// ─── API Keys ──────────────────────────────────────────────────────────────

export const apiKeysApi = {
  create(payload: {
    name: string;
    permissions: Record<string, boolean>;
    environment?: string;
  }) {
    return apiFetch<{ data: ApiKey & { key: string } }>("/v1/api-keys", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  list() {
    return apiFetch<{ data: ApiKey[] }>("/v1/api-keys");
  },

  revoke(id: string) {
    return apiFetch<{ revoked: boolean }>(`/v1/api-keys/${id}`, {
      method: "DELETE",
    });
  },
};

// ─── Account ───────────────────────────────────────────────────────────────

export const accountApi = {
  get() {
    return apiFetch<{ data: Account }>("/v1/account");
  },
};

// ─── Suppressions ──────────────────────────────────────────────────────────

export const suppressionsApi = {
  add(payload: { email: string; domain: string; reason?: string }) {
    return apiFetch<{ data: unknown }>("/v1/suppressions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  list(params?: { domain?: string; reason?: string; cursor?: string }) {
    const qs = new URLSearchParams();
    if (params?.domain) qs.set("domain", params.domain);
    if (params?.reason) qs.set("reason", params.reason);
    if (params?.cursor) qs.set("cursor", params.cursor);
    const query = qs.toString();
    return apiFetch<PaginatedResponse<unknown>>(
      `/v1/suppressions${query ? `?${query}` : ""}`,
    );
  },

  remove(id: string) {
    return apiFetch<{ deleted: boolean }>(`/v1/suppressions/${id}`, {
      method: "DELETE",
    });
  },
};
