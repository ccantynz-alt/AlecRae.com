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
  preview: string;
  status: string;
  tags: string[];
  hasAttachments: boolean;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

export interface MessageDetail extends Message {
  textBody: string | null;
  htmlBody: string | null;
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

// ─── Auth ──────────────────────────────────────────────────────────────────

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    accountId: string;
  };
}

export const authApi = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as ApiError | null;
      throw new Error(err?.error?.message ?? "Login failed");
    }

    const data = (await res.json()) as { data: AuthResponse };

    // Store token
    if (typeof window !== "undefined") {
      localStorage.setItem("emailed_api_key", data.data.token);
      document.cookie = `emailed_session=${data.data.token}; path=/; max-age=${7 * 86400}; SameSite=Lax`;
    }

    return data.data;
  },

  async register(payload: {
    email: string;
    password: string;
    name: string;
    accountName?: string;
  }): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as ApiError | null;
      throw new Error(err?.error?.message ?? "Registration failed");
    }

    const data = (await res.json()) as { data: AuthResponse };

    if (typeof window !== "undefined") {
      localStorage.setItem("emailed_api_key", data.data.token);
      document.cookie = `emailed_session=${data.data.token}; path=/; max-age=${7 * 86400}; SameSite=Lax`;
    }

    return data.data;
  },

  logout() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("emailed_api_key");
      document.cookie = "emailed_session=; path=/; max-age=0";
    }
  },

  async me() {
    return apiFetch<{ data: AuthResponse["user"] }>("/v1/auth/me");
  },
};

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

  search(params: { q: string; mailbox?: string; limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    qs.set("q", params.q);
    if (params.mailbox) qs.set("mailbox", params.mailbox);
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.offset) qs.set("offset", String(params.offset));
    return apiFetch<{
      data: Array<{
        id: string;
        subject: string;
        from: EmailAddress;
        snippet: string;
        createdAt: string;
      }>;
      totalHits: number;
      processingTimeMs: number;
      query: string;
    }>(`/v1/messages/search?${qs.toString()}`);
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

export interface TimeseriesPoint {
  timestamp: string;
  sent: number;
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
}

export interface DomainStats {
  domainId: string;
  domain: string;
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  deliveryRate: number;
  bounceRate: number;
}

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

  timeseries(params?: { from?: string; to?: string; granularity?: string }) {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.granularity) qs.set("granularity", params.granularity);
    const query = qs.toString();
    return apiFetch<{ data: TimeseriesPoint[]; meta: { from: string; to: string; granularity: string } }>(
      `/v1/analytics/timeseries${query ? `?${query}` : ""}`,
    );
  },

  domains(params?: { from?: string; to?: string }) {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const query = qs.toString();
    return apiFetch<{ data: DomainStats[]; meta: { from: string; to: string } }>(
      `/v1/analytics/domains${query ? `?${query}` : ""}`,
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

  test(id: string) {
    return apiFetch<{ data: { success: boolean; eventId: string; eventType: string; message: string } }>(
      `/v1/webhooks/${id}/test`,
      { method: "POST" },
    );
  },

  update(id: string, payload: { url?: string; events?: string[]; description?: string; active?: boolean }) {
    return apiFetch<{ data: Webhook }>(`/v1/webhooks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  deliveries(id: string, params?: { limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return apiFetch<{ data: Array<{ id: string; eventId: string; statusCode: number | null; success: boolean; attemptCount: number; createdAt: string }> }>(
      `/v1/webhooks/${id}/deliveries${query ? `?${query}` : ""}`,
    );
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

  updateProfile(payload: { name?: string; email?: string }) {
    return apiFetch<{ data: { id: string; email: string; name: string; role: string; accountId: string } }>(
      "/v1/account/profile",
      {
        method: "PUT",
        body: JSON.stringify(payload),
      },
    );
  },

  deleteAccount() {
    return apiFetch<{ deleted: boolean }>("/v1/account", {
      method: "DELETE",
    });
  },
};

// ─── Billing ──────────────────────────────────────────────────────────────

export interface BillingPlan {
  planId: string;
  name: string;
  limits: {
    emailsPerMonth: number;
    domains: number;
    webhooks: number;
  };
  usage: {
    emailsSent: number;
    percentUsed: number;
  };
  periodStartedAt: string;
}

export interface BillingUsage {
  emailsSent: number;
  emailsLimit: number;
  percentUsed: number;
  periodStartedAt: string;
  planTier: string;
  limitExceeded: boolean;
}

export const billingApi = {
  getPlan() {
    return apiFetch<{ data: BillingPlan }>("/v1/billing/plan");
  },

  getUsage() {
    return apiFetch<{ data: BillingUsage }>("/v1/billing/usage");
  },

  createCheckout(planId: string, successUrl: string, cancelUrl: string) {
    return apiFetch<{ data: { sessionId: string; url: string } }>(
      "/v1/billing/checkout",
      {
        method: "POST",
        body: JSON.stringify({ planId, successUrl, cancelUrl }),
      },
    );
  },

  createPortal(returnUrl: string) {
    return apiFetch<{ data: { url: string } }>("/v1/billing/portal", {
      method: "POST",
      body: JSON.stringify({ returnUrl }),
    });
  },
};

// ─── Templates ────────────────────────────────────────────────────────────

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlBody: string | null;
  textBody: string | null;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export const templatesApi = {
  create(payload: {
    name: string;
    subject: string;
    htmlBody?: string;
    textBody?: string;
  }) {
    return apiFetch<{ data: EmailTemplate }>("/v1/templates", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  list() {
    return apiFetch<{ data: EmailTemplate[] }>("/v1/templates");
  },

  get(id: string) {
    return apiFetch<{ data: EmailTemplate }>(`/v1/templates/${id}`);
  },

  update(
    id: string,
    payload: {
      name?: string;
      subject?: string;
      htmlBody?: string;
      textBody?: string;
    },
  ) {
    return apiFetch<{ data: EmailTemplate }>(`/v1/templates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  remove(id: string) {
    return apiFetch<{ deleted: boolean }>(`/v1/templates/${id}`, {
      method: "DELETE",
    });
  },
};

// ─── Suppressions ──────────────────────────────────────────────────────────

export interface Suppression {
  id: string;
  email: string;
  domain: string;
  reason: "bounce" | "complaint" | "unsubscribe" | "manual";
  source: string | null;
  createdAt: string;
}

export const suppressionsApi = {
  add(payload: { email: string; domain: string; reason?: string }) {
    return apiFetch<{ data: Suppression }>("/v1/suppressions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  list(params?: { domain?: string; reason?: string; cursor?: string; search?: string }) {
    const qs = new URLSearchParams();
    if (params?.domain) qs.set("domain", params.domain);
    if (params?.reason) qs.set("reason", params.reason);
    if (params?.cursor) qs.set("cursor", params.cursor);
    if (params?.search) qs.set("search", params.search);
    const query = qs.toString();
    return apiFetch<PaginatedResponse<Suppression>>(
      `/v1/suppressions${query ? `?${query}` : ""}`,
    );
  },

  remove(id: string) {
    return apiFetch<{ deleted: boolean }>(`/v1/suppressions/${id}`, {
      method: "DELETE",
    });
  },

  check(email: string) {
    return apiFetch<{ data: { suppressed: boolean; entry: Suppression | null } }>(
      `/v1/suppressions/check?email=${encodeURIComponent(email)}`,
    );
  },

  importCsv(csvContent: string) {
    return apiFetch<{ data: { imported: number; skipped: number; errors: string[] } }>(
      "/v1/suppressions/import",
      {
        method: "POST",
        body: JSON.stringify({ csv: csvContent }),
      },
    );
  },
};

// ─── Bounces ──────────────────────────────────────────────────────────────

export interface Bounce {
  id: string;
  recipient: string;
  type: "hard" | "soft";
  category: string;
  diagnosticCode: string | null;
  mxHost: string | null;
  messageId: string | null;
  createdAt: string;
}

export interface BounceStats {
  total: number;
  hard: number;
  soft: number;
  complaintRate: number;
  bounceRate: number;
  trending: Array<{
    date: string;
    hard: number;
    soft: number;
  }>;
}

export const bouncesApi = {
  list(params?: { type?: string; from?: string; to?: string; cursor?: string; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.type) qs.set("type", params.type);
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.cursor) qs.set("cursor", params.cursor);
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return apiFetch<PaginatedResponse<Bounce>>(
      `/v1/bounces${query ? `?${query}` : ""}`,
    );
  },

  stats(params?: { from?: string; to?: string }) {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const query = qs.toString();
    return apiFetch<{ data: BounceStats }>(
      `/v1/bounces/stats${query ? `?${query}` : ""}`,
    );
  },
};
