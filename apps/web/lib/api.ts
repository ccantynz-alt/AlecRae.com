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

export interface PasskeyRegisterChallengeResponse {
  challengeId: string;
  publicKey: {
    challenge: string;
    rp: { name: string; id: string };
    user: { id: string; name: string; displayName: string };
    pubKeyCredParams: Array<{ alg: number; type: "public-key" }>;
    timeout: number;
    authenticatorSelection: {
      authenticatorAttachment: "platform";
      residentKey: "preferred";
      userVerification: "preferred";
    };
    attestation: "none";
  };
  _registration: {
    email: string;
    name: string;
    userId: string;
  };
}

export interface PasskeyLoginChallengeResponse {
  challengeId: string;
  publicKey: {
    challenge: string;
    rpId: string;
    timeout: number;
    userVerification: "preferred";
    allowCredentials?: Array<{
      type: "public-key";
      id: string;
      transports?: string[];
    }>;
  };
}

/** Serialized PublicKeyCredential for registration (attestation). */
export interface PublicKeyCredentialJSON {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    clientDataJSON: string;
    attestationObject: string;
    publicKey?: string;
    publicKeyAlgorithm?: number;
    transports?: string[];
    authenticatorData?: string;
  };
  authenticatorAttachment?: string;
}

/** Serialized PublicKeyCredential for authentication (assertion). */
export interface PublicKeyCredentialAssertionJSON {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
  authenticatorAttachment?: string;
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

  async me(): Promise<{ data: AuthResponse["user"] }> {
    return apiFetch<{ data: AuthResponse["user"] }>("/v1/auth/me");
  },

  /** Request a WebAuthn registration challenge from the server. */
  async passkeyRegisterChallenge(payload: {
    email: string;
    name: string;
  }): Promise<PasskeyRegisterChallengeResponse> {
    const res = await fetch(`${API_BASE}/v1/auth/passkey/register/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as ApiError | null;
      throw new Error(err?.error?.message ?? "Failed to create passkey challenge");
    }

    const data = (await res.json()) as { data: PasskeyRegisterChallengeResponse };
    return data.data;
  },

  /** Verify a WebAuthn registration attestation and create the account. */
  async passkeyRegisterVerify(payload: {
    challengeId: string;
    credential: PublicKeyCredentialJSON;
    _registration: { email: string; name: string; userId: string };
  }): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/v1/auth/passkey/register/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as ApiError | null;
      throw new Error(err?.error?.message ?? "Passkey registration failed");
    }

    const data = (await res.json()) as { data: AuthResponse };

    if (typeof window !== "undefined") {
      localStorage.setItem("emailed_api_key", data.data.token);
      document.cookie = `emailed_session=${data.data.token}; path=/; max-age=${7 * 86400}; SameSite=Lax`;
    }

    return data.data;
  },

  /** Request a WebAuthn authentication challenge from the server. */
  async passkeyLoginChallenge(payload?: {
    email?: string;
  }): Promise<PasskeyLoginChallengeResponse> {
    const res = await fetch(`${API_BASE}/v1/auth/passkey/login/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {}),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as ApiError | null;
      throw new Error(err?.error?.message ?? "Failed to create login challenge");
    }

    const data = (await res.json()) as { data: PasskeyLoginChallengeResponse };
    return data.data;
  },

  /** Verify a WebAuthn authentication assertion and log in. */
  async passkeyLoginVerify(payload: {
    challengeId: string;
    credential: PublicKeyCredentialAssertionJSON;
  }): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/v1/auth/passkey/login/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as ApiError | null;
      throw new Error(err?.error?.message ?? "Passkey login failed");
    }

    const data = (await res.json()) as { data: AuthResponse };

    if (typeof window !== "undefined") {
      localStorage.setItem("emailed_api_key", data.data.token);
      document.cookie = `emailed_session=${data.data.token}; path=/; max-age=${7 * 86400}; SameSite=Lax`;
    }

    return data.data;
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

// ─── Newsletter Summary (S6) ──────────────────────────────────────────────

export interface NewsletterSummaryData {
  headline: string;
  bullets: string[];
  keyLink?: string;
  estimatedReadTime: number;
  topics: string[];
}

export interface NewsletterSummaryResponse {
  emailId: string;
  summary: NewsletterSummaryData;
}

export const newsletterSummaryApi = {
  /** Summarize a newsletter email by its ID. */
  getByEmailId(emailId: string): Promise<{ data: NewsletterSummaryResponse }> {
    return apiFetch<{ data: NewsletterSummaryResponse }>(
      `/v1/emails/${emailId}/summary`,
    );
  },

  /** Summarize newsletter content directly (POST). */
  summarize(payload: {
    htmlBody?: string;
    textBody?: string;
    subject: string;
  }): Promise<{ data: NewsletterSummaryData }> {
    return apiFetch<{ data: NewsletterSummaryData }>("/v1/explain/newsletter", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};

// ─── Email Explainer (S7) ─────────────────────────────────────────────────

export interface SuggestedActionData {
  action: string;
  reasoning: string;
}

export interface EmailExplanationData {
  senderSummary: string;
  relationshipContext: string;
  whyItsHere: string;
  suggestedActions: SuggestedActionData[];
  urgencyLevel: "low" | "medium" | "high" | "urgent";
}

export interface EmailExplanationResponse {
  emailId: string;
  explanation: EmailExplanationData;
}

export const emailExplainerApi = {
  /** Explain an email by its ID. */
  getByEmailId(emailId: string): Promise<{ data: EmailExplanationResponse }> {
    return apiFetch<{ data: EmailExplanationResponse }>(
      `/v1/emails/${emailId}/explain`,
    );
  },

  /** Explain email content directly (POST). */
  explain(payload: {
    email: {
      from: string;
      subject: string;
      body: string;
      date: string;
    };
    senderHistory: {
      totalEmails: number;
      lastContacted: string | null;
      isKnown: boolean;
    };
    accountContext: {
      inboxCategories: string[];
    };
  }): Promise<{ data: EmailExplanationData }> {
    return apiFetch<{ data: EmailExplanationData }>("/v1/explain/email", {
      method: "POST",
      body: JSON.stringify(payload),
    });
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
