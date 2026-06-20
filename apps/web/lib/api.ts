/**
 * API Client for the AlecRae backend.
 *
 * Typed fetch wrapper that communicates with the /v1/* endpoints.
 * Handles auth tokens, error responses, and response parsing.
 */

import { getApiBase } from "./api-base";
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
  setSession,
} from "./auth-token";

const API_BASE = getApiBase();

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
  status: string;
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
  /** Long-lived rotating refresh token — captured so the client can renew the
   *  short-lived access token silently instead of logging the user out. */
  refreshToken?: string;
  expiresIn?: number;
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
    pubKeyCredParams: { alg: number; type: "public-key" }[];
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
    allowCredentials?: {
      type: "public-key";
      id: string;
      transports?: string[];
    }[];
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
    setSession(data.data.token, data.data.refreshToken);

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

    setSession(data.data.token, data.data.refreshToken);

    return data.data;
  },

  /** URL that starts the "Sign in with Google" (identity) flow on the API. */
  googleSignInUrl(): string {
    return `${API_BASE}/v1/auth/google`;
  },

  /**
   * Persist a session handed back by the Google sign-in callback. Mirrors the
   * storage used by login/register/passkey so the rest of the app just works.
   * The refresh token (if the callback forwards one) enables silent renewal.
   */
  completeGoogleSignIn(token: string, refreshToken?: string | null): void {
    setSession(token, refreshToken ?? null);
  },

  logout() {
    clearSession();
  },

  async me(): Promise<{ data: AuthResponse["user"] }> {
    return apiFetch<{ data: AuthResponse["user"] }>("/v1/auth/me");
  },

  async updateProfile(payload: {
    name?: string;
    email?: string;
  }): Promise<{ data: AuthResponse["user"] }> {
    return apiFetch<{ data: AuthResponse["user"] }>("/v1/auth/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async deleteAccount(): Promise<{
    data: {
      status: "scheduled_for_deletion";
      scheduledDeletionAt: string;
      message: string;
    };
  }> {
    return apiFetch("/v1/auth/me", { method: "DELETE" });
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

    setSession(data.data.token, data.data.refreshToken);

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

    setSession(data.data.token, data.data.refreshToken);

    return data.data;
  },
};

// ─── Core fetch wrapper ────────────────────────────────────────────────────

async function apiFetch<T>(
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

  // Access token expired → renew silently with the refresh token and retry
  // once, rather than surfacing "invalid or expired bearer token" to the user.
  if (res.status === 401 && !retried && getRefreshToken()) {
    const fresh = await refreshSession();
    if (fresh) {
      return apiFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Connected accounts ─────────────────────────────────────────────────────

export interface ConnectedEmailAccount {
  id: string;
  provider: string;
  email: string;
  displayName: string | null;
  status: string;
  lastSyncAt: string | null;
  createdAt: string;
}

export const connectApi = {
  listAccounts(): Promise<{ data: ConnectedEmailAccount[] }> {
    return apiFetch("/v1/connect/accounts");
  },

  /** Fetch the Google OAuth consent URL (authenticated), then navigate to it. */
  gmailAuthUrl(): Promise<{ data: { url: string } }> {
    return apiFetch("/v1/connect/gmail");
  },

  /** Fetch the Microsoft OAuth consent URL (authenticated), then navigate to it. */
  outlookAuthUrl(): Promise<{ data: { url: string } }> {
    return apiFetch("/v1/connect/outlook");
  },
};

// ─── Admin (platform administration) ─────────────────────────────────────────

export interface AdminStats {
  totals: {
    sent: number;
    delivered: number;
    bounced: number;
    complained: number;
    queued: number;
    failed: number;
    deferred: number;
    opened: number;
    clicked: number;
    deliveryRate: number;
    bounceRate: number;
    openRate: number;
    clickRate: number;
  };
  last24h: {
    sent: number;
    delivered: number;
    bounced: number;
    queued: number;
    failed: number;
    deferred: number;
  };
  platform: {
    totalAccounts: number;
    totalDomains: number;
    totalUsers: number;
  };
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  accountId: string;
  accountName: string | null;
  plan: string;
  emailsSentThisPeriod: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminDomain {
  id: string;
  accountId: string;
  domain: string;
  status: string;
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
  returnPathVerified: boolean;
  isActive: boolean;
  isDefault: boolean;
  messagesSent24h: number;
  createdAt: string;
  verifiedAt: string | null;
}

export interface AdminMessage {
  id: string;
  accountId: string;
  messageId: string | null;
  from: { email: string; name: string | null };
  to: { email: string; name?: string | null }[] | null;
  subject: string | null;
  status: string;
  tags: string[] | null;
  createdAt: string;
  sentAt: string | null;
}

export interface AdminEvent {
  id: string;
  accountId: string;
  emailId: string | null;
  messageId: string | null;
  type: string;
  recipient: string | null;
  timestamp: string;
  bounceCategory: string | null;
  url: string | null;
}

export interface AdminDlqRecord {
  jobId: string;
  jobName: string;
  failedReason: string;
  attemptsMade: number;
  timestamp: string;
  status: "pending_retry" | "permanently_failed";
  retryScheduledAt: string | null;
}

export interface AdminDlq {
  stats: { total: number; pendingRetry: number; permanentlyFailed: number };
  records: AdminDlqRecord[];
}

export const adminApi = {
  stats(): Promise<{ data: AdminStats }> {
    return apiFetch("/v1/admin/stats");
  },
  users(): Promise<{ data: AdminUser[] }> {
    return apiFetch("/v1/admin/users");
  },
  domains(): Promise<{ data: AdminDomain[] }> {
    return apiFetch("/v1/admin/domains");
  },
  messages(params?: { limit?: number; status?: string }): Promise<{ data: AdminMessage[] }> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.status) qs.set("status", params.status);
    const query = qs.toString();
    return apiFetch(`/v1/admin/messages${query ? `?${query}` : ""}`);
  },
  events(params?: { limit?: number; type?: string }): Promise<{ data: AdminEvent[] }> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.type) qs.set("type", params.type);
    const query = qs.toString();
    return apiFetch(`/v1/admin/events${query ? `?${query}` : ""}`);
  },
  dlq(): Promise<{ data: AdminDlq }> {
    return apiFetch("/v1/admin/dlq");
  },
  clearDlqRecord(jobId: string): Promise<{ data: { cleared: boolean } }> {
    return apiFetch(`/v1/admin/dlq/${encodeURIComponent(jobId)}`, { method: "DELETE" });
  },
  clearFailedDlq(): Promise<{ data: { cleared: number } }> {
    return apiFetch("/v1/admin/dlq/clear", { method: "POST" });
  },
};

// ─── Mailboxes (native addresses on a verified domain) ───────────────────────

export interface Mailbox {
  id: string;
  accountId: string;
  domainId: string;
  localPart: string;
  address: string;
  displayName: string | null;
  forwardTo: string[] | null;
  isActive: boolean;
  createdAt?: string;
}

export const mailboxesApi = {
  list(): Promise<{ data: Mailbox[] }> {
    return apiFetch("/v1/mailboxes");
  },
  create(payload: {
    address: string;
    displayName?: string;
    forwardTo?: string[];
  }): Promise<Mailbox> {
    return apiFetch("/v1/mailboxes", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  remove(id: string): Promise<{ deleted: boolean; id: string }> {
    return apiFetch(`/v1/mailboxes/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

// ─── Organizations / Team ────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerAccountId: string;
  domain: string | null;
  logoUrl: string | null;
  settings: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface OrgMember {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface OrgInvitation {
  id: string;
  accountId: string;
  invitedBy?: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  acceptedAt?: string | null;
  createdAt: string;
}

export type OrgRole = "admin" | "member" | "viewer";

export const organizationsApi = {
  get(): Promise<{ data: Organization[] }> {
    return apiFetch("/v1/organizations");
  },
  create(payload: { name: string; slug: string; domain?: string | null }): Promise<{ data: Organization }> {
    return apiFetch("/v1/organizations", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  members(): Promise<{ data: OrgMember[] }> {
    return apiFetch("/v1/organizations/members");
  },
  invitations(status?: string): Promise<{ data: OrgInvitation[] }> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return apiFetch(`/v1/organizations/invitations${qs}`);
  },
  invite(payload: { email: string; role: OrgRole }): Promise<{ data: OrgInvitation }> {
    return apiFetch("/v1/organizations/invitations", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  revokeInvitation(invitationId: string): Promise<unknown> {
    return apiFetch(`/v1/organizations/invitations/${encodeURIComponent(invitationId)}`, {
      method: "DELETE",
    });
  },
  changeRole(userId: string, role: OrgRole): Promise<unknown> {
    return apiFetch(`/v1/organizations/members/${encodeURIComponent(userId)}/role`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    });
  },
  removeMember(userId: string): Promise<unknown> {
    return apiFetch(`/v1/organizations/members/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
  },
};

// ─── Import (mailbox migration) ──────────────────────────────────────────────

/** Multipart upload with Bearer auth + one silent refresh-and-retry on 401.
 *  Kept separate from apiFetch because FormData must NOT carry a JSON
 *  Content-Type (the browser sets the multipart boundary itself). */
async function uploadFetch<T>(path: string, body: FormData, retried = false): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });

  if (res.status === 401 && !retried && getRefreshToken()) {
    const fresh = await refreshSession();
    if (fresh) return uploadFetch<T>(path, body, true);
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(errorBody?.error?.message ?? `Upload failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface ImportProgress {
  total: number;
  processed: number;
  failed: number;
  skipped: number;
}

export interface ImportJobSummary {
  jobId: string;
  source: string;
  status: string;
  progress: ImportProgress;
  startedAt: string;
  completedAt: string | null;
}

export const importApi = {
  mbox(file: File): Promise<{ data: { jobId: string; status: string } }> {
    const fd = new FormData();
    fd.append("file", file);
    return uploadFetch("/v1/import/mbox", fd);
  },
  eml(files: File[]): Promise<{ data: { jobId: string; status: string; progress: ImportProgress } }> {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    return uploadFetch("/v1/import/eml", fd);
  },
  gmail(connectedAccountId: string, maxMessages?: number): Promise<{ data: { jobId: string; status: string; message: string } }> {
    return apiFetch("/v1/import/gmail", {
      method: "POST",
      body: JSON.stringify({ connectedAccountId, ...(maxMessages ? { maxMessages } : {}) }),
    });
  },
  outlook(connectedAccountId: string, maxMessages?: number): Promise<{ data: { jobId: string; status: string; message: string } }> {
    return apiFetch("/v1/import/outlook", {
      method: "POST",
      body: JSON.stringify({ connectedAccountId, ...(maxMessages ? { maxMessages } : {}) }),
    });
  },
  jobs(): Promise<{ data: ImportJobSummary[] }> {
    return apiFetch("/v1/import/jobs");
  },
};

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

  archive(id: string) {
    return apiFetch<{ data: { id: string; updated: boolean } }>(
      `/v1/messages/${id}`,
      { method: "PATCH", body: JSON.stringify({ status: "dropped", tags: ["archived"] }) },
    );
  },

  delete(id: string) {
    return apiFetch<{ data: { id: string; deleted: boolean } }>(
      `/v1/messages/${id}`,
      { method: "DELETE" },
    );
  },

  star(id: string, starred: boolean) {
    const tags = starred ? ["starred"] : [];
    return apiFetch<{ data: { id: string; updated: boolean } }>(
      `/v1/messages/${id}`,
      { method: "PATCH", body: JSON.stringify({ tags }) },
    );
  },

  search(params: { q: string; mailbox?: string; limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    qs.set("q", params.q);
    if (params.mailbox) qs.set("mailbox", params.mailbox);
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.offset) qs.set("offset", String(params.offset));
    return apiFetch<{
      data: {
        id: string;
        subject: string;
        from: EmailAddress;
        snippet: string;
        createdAt: string;
      }[];
      totalHits: number;
      processingTimeMs: number;
      query: string;
    }>(`/v1/messages/search?${qs.toString()}`);
  },
};

// ─── Domains ───────────────────────────────────────────────────────────────

export interface AutoConfigRecordResult {
  type: string;
  name: string;
  status: "created" | "updated" | "existed" | "failed";
  error?: string;
}

export interface AutoConfigResponse {
  provider: string;
  domain: string;
  records: AutoConfigRecordResult[];
  allConfigured: boolean;
  verification: { overall: string } | null;
}

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

  autoConfig(
    id: string,
    params:
      | { provider: "cloudflare"; apiToken: string }
      | { provider: "godaddy"; apiKey: string; apiSecret: string; apexDomain?: string }
      | { provider: "porkbun"; apiKey: string; secretApiKey: string; apexDomain?: string },
  ) {
    return apiFetch<{ data: AutoConfigResponse }>(`/v1/domains/${id}/dns-autoconfig`, {
      method: "POST",
      body: JSON.stringify(params),
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

// ─── Inbox Heatmap Analytics (A3) ─────────────────────────────────────────

export interface HeatmapDayEntry {
  date: string;
  sent: number;
  received: number;
}

export interface HourlyBucketEntry {
  hour: number;
  sent: number;
  received: number;
}

export interface HeatmapStatsMetrics {
  avgResponseTimeSec: number | null;
  emailsPerDay: number;
  busiestDay: string | null;
  quietestDay: string | null;
  inboxZeroStreak: number;
  totalSent: number;
  totalReceived: number;
}

export interface HeatmapStatsCompare {
  avgResponseTimeDelta: number | null;
  emailsPerDayDelta: number | null;
  totalSentDelta: number | null;
  totalReceivedDelta: number | null;
}

export type HeatmapPeriod = "7d" | "30d" | "90d" | "1y";

export const heatmapApi = {
  heatmap(params?: { period?: HeatmapPeriod; mode?: string }) {
    const qs = new URLSearchParams();
    if (params?.period) qs.set("period", params.period);
    if (params?.mode) qs.set("mode", params.mode);
    const query = qs.toString();
    return apiFetch<{ data: HeatmapDayEntry[]; meta: { period: string; from: string; to: string; days: number } }>(
      `/v1/analytics/heatmap${query ? `?${query}` : ""}`,
    );
  },

  hourly(params?: { period?: HeatmapPeriod }) {
    const qs = new URLSearchParams();
    if (params?.period) qs.set("period", params.period);
    const query = qs.toString();
    return apiFetch<{
      data: HourlyBucketEntry[];
      meta: { period: string; from: string; to: string; peakHour: number; peakHours: number[]; bestSendHours: number[] };
    }>(`/v1/analytics/hourly${query ? `?${query}` : ""}`);
  },

  stats(params?: { period?: HeatmapPeriod; compare?: boolean }) {
    const qs = new URLSearchParams();
    if (params?.period) qs.set("period", params.period);
    if (params?.compare) qs.set("compare", "true");
    const query = qs.toString();
    return apiFetch<{
      data: { metrics: HeatmapStatsMetrics; compare: HeatmapStatsCompare | null };
      meta: { period: string; from: string; to: string; days: number };
    }>(`/v1/analytics/stats${query ? `?${query}` : ""}`);
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

export interface PasskeyInfo {
  id: string;
  credentialId: string;
  deviceName: string;
  createdAt: string | null;
  lastUsedAt: string | null;
}

export interface NotificationPrefs {
  emailNotifications: boolean;
  aiDigest: boolean;
  deliverabilityAlerts: boolean;
}

export const accountApi = {
  get() {
    return apiFetch<{ data: Account }>("/v1/account");
  },

  updateProfile(payload: { name?: string; email?: string }) {
    return apiFetch<{ data: { id: string; name: string; email: string; role: string } }>(
      "/v1/account/profile",
      { method: "PATCH", body: JSON.stringify(payload) },
    );
  },

  deleteAccount() {
    return apiFetch<{ data: { deleted: boolean } }>("/v1/account", {
      method: "DELETE",
    });
  },

  listPasskeys() {
    return apiFetch<{ data: PasskeyInfo[] }>("/v1/account/passkeys");
  },

  deletePasskey(id: string) {
    return apiFetch<{ data: { deleted: boolean; id: string } }>(
      `/v1/account/passkeys/${id}`,
      { method: "DELETE" },
    );
  },

  getNotificationPrefs() {
    return apiFetch<{ data: NotificationPrefs }>("/v1/account/notifications");
  },

  updateNotificationPrefs(payload: Partial<NotificationPrefs>) {
    return apiFetch<{ data: NotificationPrefs }>("/v1/account/notifications", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
};

// ─── Suppressions ──────────────────────────────────────────────────────────

// ─── Calendar Slot Suggestions (B7) ───────────────────────────────────────

export interface CalendarSlotSuggestionData {
  start: string;
  end: string;
  formattedRange: string;
  durationMinutes: number;
  score: number;
  reasoning: string;
}

export interface CalendarMeetingIntent {
  hasIntent: boolean;
  type: string | null;
  confidence: number;
  durationHint: number | null;
  locationHint: string | null;
  extractedTimes: { raw: string; parsed: string | null }[];
}

export interface SuggestSlotsResponse {
  detected: boolean;
  intent: CalendarMeetingIntent;
  slots: CalendarSlotSuggestionData[];
  formattedText: string | null;
}

export const calendarApi = {
  /**
   * Detect meeting intent in compose text and suggest available calendar slots.
   * Combines intent detection + availability check + AI scoring in one call.
   */
  suggestSlots(payload: {
    text: string;
    timezone?: string;
    workingHoursStart?: number;
    workingHoursEnd?: number;
    durationMinutes?: number;
    recipientEmail?: string;
    daysAhead?: number;
  }): Promise<{ data: SuggestSlotsResponse }> {
    return apiFetch<{ data: SuggestSlotsResponse }>(
      "/v1/calendar/suggest-slots",
      { method: "POST", body: JSON.stringify(payload) },
    );
  },
};

// ─── Predictive Send-Time Optimization (S10) ─────────────────────────────

export interface RecommendedTime {
  datetime: string;
  confidence: number;
  reasoning: string;
  dayLabel: string;
  hourLabel: string;
}

export interface RecipientPattern {
  typicalOpenHours: number[];
  typicalOpenDays: number[];
  avgResponseTimeHours: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  mostActiveHour: number;
  mostActiveDay: number;
  sampleSize: number;
  confidenceLevel: "none" | "low" | "medium" | "high";
  inferredTimezone: string | null;
}

export interface SendTimeRecommendation {
  recommendedTimes: RecommendedTime[];
  currentlyOptimal: boolean;
  alternativeTimes: number;
  dataSource: "historical" | "default";
  recipientPattern: RecipientPattern | null;
}

export interface RecipientEngagementData {
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  totalReplied: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  avgOpenDelayHours: number | null;
  avgClickDelayHours: number | null;
  avgReplyDelayHours: number | null;
  peakOpenHour: number | null;
  peakOpenDay: number | null;
  inferredTimezone: string | null;
}

export interface RecipientPatternResponse {
  recipientEmail: string;
  hasData: boolean;
  pattern: RecipientPattern | null;
  engagement: RecipientEngagementData | null;
}

export interface OptimalSendTimeResponse {
  recipients: {
    recipientEmail: string;
    recommendation: SendTimeRecommendation;
  }[];
  consensusOptimalTime: string | null;
  recipientCount: number;
}

export const sendTimeApi = {
  /** Get optimal send time prediction for a single recipient. */
  predict(payload: {
    recipientEmail: string;
    senderTimezone?: string;
    urgency?: "low" | "normal" | "high";
    windowDays?: number;
  }): Promise<{ data: SendTimeRecommendation }> {
    return apiFetch<{ data: SendTimeRecommendation }>(
      "/v1/send-time/predict",
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  /** Get full pattern analysis for a recipient. */
  analyze(payload: {
    recipientEmail: string;
    lookbackDays?: number;
  }): Promise<{
    data: {
      recipientEmail: string;
      sampleSize: number;
      source: "aggregated" | "raw_scan";
      pattern: RecipientPattern;
    };
  }> {
    return apiFetch("/v1/send-time/analyze", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Auto-schedule an email at the predicted optimal time. */
  autoSchedule(payload: {
    emailId: string;
    recipientEmail: string;
    senderTimezone?: string;
    urgency?: "low" | "normal" | "high";
    windowDays?: number;
  }): Promise<{
    data: {
      emailId: string;
      scheduledAt: string;
      confidence: number;
      reasoning: string;
      dataSource: "historical" | "default";
      alternatives: RecommendedTime[];
    };
  }> {
    return apiFetch("/v1/send-time/auto-schedule", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Batch: get optimal send time for multiple recipients. */
  optimalSendTime(payload: {
    recipients: string[];
    senderTimezone?: string;
    urgency?: "low" | "normal" | "high";
    windowDays?: number;
  }): Promise<{ data: OptimalSendTimeResponse }> {
    return apiFetch<{ data: OptimalSendTimeResponse }>(
      "/v1/emails/optimal-send-time",
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  /** Get engagement patterns for a specific recipient. */
  recipientPatterns(
    recipientEmail: string,
  ): Promise<{ data: RecipientPatternResponse }> {
    const qs = new URLSearchParams();
    qs.set("recipientEmail", recipientEmail);
    return apiFetch<{ data: RecipientPatternResponse }>(
      `/v1/analytics/recipient-patterns?${qs.toString()}`,
    );
  },
};

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

// ─── Grammar & AI Compose Suggestions ────────────────────────────────────

export interface GrammarIssue {
  type: string;
  message: string;
  offset: number;
  length: number;
  replacements: string[];
}

export interface GrammarCheckResponse {
  issues: GrammarIssue[];
  score: number;
  correctedText?: string;
}

export const grammarApi = {
  check(payload: { text: string; language?: string }) {
    return apiFetch<{ data: GrammarCheckResponse }>("/v1/grammar/check", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  correct(payload: { text: string; language?: string }) {
    return apiFetch<{ data: { correctedText: string; changes: number } }>(
      "/v1/grammar/correct",
      { method: "POST", body: JSON.stringify(payload) },
    );
  },
};

// ─── AI Writing Intelligence ──────────────────────────────────────────────

export type AIWritingTone =
  | "formal"
  | "casual"
  | "friendly"
  | "professional"
  | "persuasive";

export type AIWritingLength = "short" | "medium" | "long";

export interface AIComposeResult {
  subject: string;
  body: string;
  tone: AIWritingTone;
  length: AIWritingLength;
  confidence: number;
  wordCount: number;
  profileUsed: string | null;
}

export interface AISummarizeResult {
  original: string;
  summary: string;
  originalWordCount: number;
  summaryWordCount: number;
  compressionRatio: number;
  confidence: number;
}

export const aiWritingApi = {
  /** AI compose an email (subject + body) from a topic / instruction. */
  compose(payload: {
    topic: string;
    tone?: AIWritingTone;
    length?: AIWritingLength;
    profileId?: string;
  }): Promise<{ data: AIComposeResult }> {
    return apiFetch<{ data: AIComposeResult }>("/v1/ai/write/compose", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Summarize long email/thread text into a short summary. */
  summarize(payload: {
    text: string;
    maxLength?: number;
  }): Promise<{ data: AISummarizeResult }> {
    return apiFetch<{ data: AISummarizeResult }>("/v1/ai/write/summarize", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};

// ─── Snooze ───────────────────────────────────────────────────────────────

export const snoozeApi = {
  snooze(emailId: string, until: string) {
    return apiFetch<{ data: { id: string; emailId: string; snoozedUntil: string } }>(
      `/v1/snooze/${emailId}`,
      { method: "POST", body: JSON.stringify({ until }) },
    );
  },

  unsnooze(emailId: string) {
    return apiFetch<{ data: { deleted: boolean } }>(
      `/v1/snooze/${emailId}`,
      { method: "DELETE" },
    );
  },

  list() {
    return apiFetch<{ data: { id: string; emailId: string; snoozedUntil: string; subject: string }[] }>(
      "/v1/snooze",
    );
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

// ─── Task Integrations (S8) ───────────────────────────────────────────────

export interface ExtractedTaskData {
  title: string;
  description: string;
  dueDate: string | null;
  assignee: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  confidence: number;
  sourceEmailId: string;
}

export interface ThreadExtractionResponse {
  threadId: string;
  tasks: ExtractedTaskData[];
  extractedAt: string;
  model: string;
}

export interface TaskProviderData {
  name: string;
  displayName: string;
  authType: string;
  description: string;
  supportsProjects: boolean;
  connected: boolean;
  isDefault: boolean;
}

export interface CreateTaskResult {
  taskId: string;
  provider: string;
  success: boolean;
  externalTaskId: string | null;
  externalTaskUrl: string | null;
  error: string | null;
}

export interface BatchCreateResult {
  provider: string;
  total: number;
  succeeded: number;
  failed: number;
  results: {
    index: number;
    taskId: string;
    title: string;
    success: boolean;
    externalTaskId: string | null;
    externalTaskUrl: string | null;
    error: string | null;
  }[];
}

export interface TaskListItem {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  assignee: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  status: "pending" | "in_progress" | "completed" | "cancelled";
  provider: string;
  externalTaskId: string | null;
  externalTaskUrl: string | null;
  confidence: number | null;
  source: {
    threadId: string;
    emailId: string;
    emailSubject: string;
    emailFrom: string;
    extractedAt: string;
  } | null;
  tags: string[];
  isManual: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskListResponse {
  tasks: TaskListItem[];
  total: number;
  limit: number;
  offset: number;
}

export const taskApi = {
  /** Extract action items from an email thread. */
  extractFromThread(
    threadId: string,
    emails: readonly {
      emailId: string;
      from: string;
      subject: string;
      body: string;
      receivedAt?: string;
    }[],
  ): Promise<{ data: ThreadExtractionResponse }> {
    return apiFetch<{ data: ThreadExtractionResponse }>(
      `/v1/emails/${threadId}/extract-tasks`,
      {
        method: "POST",
        body: JSON.stringify({ emails }),
      },
    );
  },

  /** Create a single task. */
  createTask(payload: {
    provider: string;
    title: string;
    description?: string;
    dueDate?: string;
    assignee?: string;
    priority?: "low" | "normal" | "high" | "urgent";
    tags?: string[];
    source?: {
      threadId: string;
      emailId: string;
      emailSubject: string;
      emailFrom: string;
    };
    confidence?: number;
  }): Promise<{ data: CreateTaskResult }> {
    return apiFetch<{ data: CreateTaskResult }>("/v1/tasks/create", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Create multiple tasks at once. */
  createBatch(
    provider: string,
    tasks: readonly {
      title: string;
      description?: string;
      dueDate?: string;
      assignee?: string;
      priority?: "low" | "normal" | "high" | "urgent";
      tags?: string[];
      source?: {
        threadId: string;
        emailId: string;
        emailSubject: string;
        emailFrom: string;
      };
      confidence?: number;
    }[],
  ): Promise<{ data: BatchCreateResult }> {
    return apiFetch<{ data: BatchCreateResult }>("/v1/tasks/create-batch", {
      method: "POST",
      body: JSON.stringify({ provider, tasks }),
    });
  },

  /** List configured task providers. */
  listProviders(): Promise<{ data: TaskProviderData[] }> {
    return apiFetch<{ data: TaskProviderData[] }>("/v1/tasks/providers");
  },

  /** Configure a task provider (set API key/credentials). */
  configureProvider(
    provider: string,
    config: {
      isDefault?: boolean;
      credentials: Record<string, unknown>;
    },
  ): Promise<{ data: { provider: string; isDefault: boolean; configuredAt: string } }> {
    return apiFetch<{
      data: { provider: string; isDefault: boolean; configuredAt: string };
    }>(`/v1/tasks/providers/${provider}/config`, {
      method: "PUT",
      body: JSON.stringify(config),
    });
  },

  /** List tasks from the built-in task list. */
  listTasks(params?: {
    status?: "pending" | "in_progress" | "completed" | "cancelled";
    priority?: "low" | "normal" | "high" | "urgent";
    limit?: number;
    offset?: number;
  }): Promise<{ data: TaskListResponse }> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.priority) qs.set("priority", params.priority);
    if (params?.limit) qs.set("limit", params.limit.toString());
    if (params?.offset) qs.set("offset", params.offset.toString());
    const query = qs.toString();
    return apiFetch<{ data: TaskListResponse }>(
      `/v1/tasks${query ? `?${query}` : ""}`,
    );
  },
};

// ─── Collaboration (S2: CRDT collaborative drafting) ─────────────────────

export interface CollaborationSession {
  id: string;
  draftId: string;
  title: string;
  status: "active" | "closed" | "archived";
  currentVersion: number;
  maxCollaborators: number;
  createdAt: string;
}

export interface CollaborationParticipant {
  id: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  role: "owner" | "editor" | "viewer";
  isOnline: boolean;
  cursorColor: string;
}

export interface CollaborationInvite {
  id: string;
  inviteeEmail: string;
  role: "owner" | "editor" | "viewer";
  status: "pending" | "accepted" | "declined" | "revoked";
  expiresAt: string;
  createdAt: string;
}

export interface CollaborationHistoryEntry {
  id: string;
  version: number;
  editedBy: string | null;
  editorName: string | null;
  updateSize: number;
  summary: string | null;
  createdAt: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  draftId: string;
  websocketUrl: string;
  token: string;
  features: string[];
}

export interface SessionDetailsResponse {
  session: CollaborationSession;
  participants: CollaborationParticipant[];
  pendingInvites: CollaborationInvite[];
  connection: { websocketUrl: string; token: string } | null;
}

export const collaborationApi = {
  createSession(payload: {
    draftId: string;
    title?: string;
    maxCollaborators?: number;
  }): Promise<{ data: CreateSessionResponse }> {
    return apiFetch<{ data: CreateSessionResponse }>(
      "/v1/collaborate/draft",
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  getSession(
    sessionId: string,
  ): Promise<{ data: SessionDetailsResponse }> {
    return apiFetch<{ data: SessionDetailsResponse }>(
      `/v1/collaborate/draft/${sessionId}`,
    );
  },

  invite(
    sessionId: string,
    payload: { email: string; role?: "editor" | "viewer" },
  ): Promise<{
    data: {
      inviteId: string;
      sessionId: string;
      inviteeEmail: string;
      role: string;
      expiresAt: string;
    };
  }> {
    return apiFetch(
      `/v1/collaborate/draft/${sessionId}/invite`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  removeCollaborator(
    sessionId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    return apiFetch<{ success: boolean }>(
      `/v1/collaborate/draft/${sessionId}/collaborator/${userId}`,
      { method: "DELETE" },
    );
  },

  getHistory(
    sessionId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<{ data: { entries: CollaborationHistoryEntry[]; total: number } }> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", params.limit.toString());
    if (params?.offset) qs.set("offset", params.offset.toString());
    const query = qs.toString();
    return apiFetch(
      `/v1/collaborate/draft/${sessionId}/history${query ? `?${query}` : ""}`,
    );
  },

  closeSession(
    draftId: string,
  ): Promise<{ success: boolean }> {
    return apiFetch<{ success: boolean }>(
      `/v1/collaborate/drafts/${draftId}/collaborate`,
      { method: "DELETE" },
    );
  },
};

// ─── Meeting Transcript Links (S9) ──────────────────────────────────────────

export type MeetingProviderType = "zoom" | "meet" | "teams" | "webex" | "generic";
export type MeetingLinkStatusType = "detected" | "linked" | "transcribed" | "summarized";

export interface MeetingLinkData {
  id: string;
  threadId: string;
  emailId: string | null;
  provider: MeetingProviderType;
  meetingUrl: string | null;
  scheduledAt: string | null;
  recordingUrl: string | null;
  transcriptUrl: string | null;
  transcriptPreview: string | null;
  aiSummary: string | null;
  title: string | null;
  confidence: number | null;
  status: MeetingLinkStatusType;
  participants: string | null;
  duration: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MeetingDetectResponse {
  detected: boolean;
  meeting: {
    id: string;
    threadId: string;
    provider: MeetingProviderType;
    meetingUrl: string | null;
    scheduledAt: string | null;
    title: string | null;
    confidence: number;
    detectedFrom: string;
    status: MeetingLinkStatusType;
  } | null;
}

export interface MeetingThreadResponse {
  meetings: MeetingLinkData[];
}

export interface MeetingLinkRecordingResponse {
  id: string;
  recordingUrl: string;
  transcriptUrl: string | null;
  status: MeetingLinkStatusType;
  updatedAt: string;
}

export interface MeetingTranscribeResponse {
  id: string;
  transcriptPreview: string;
  transcriptLength: number;
  status: MeetingLinkStatusType;
  updatedAt: string;
}

export interface MeetingSummaryResponse {
  id: string;
  title: string | null;
  summary: string;
  status: MeetingLinkStatusType;
  cached: boolean;
}

export const meetingsApi = {
  /** Detect meetings in a thread and persist. */
  detect(payload: {
    threadId: string;
    thread: {
      messages: {
        id?: string;
        from?: string;
        to?: string[];
        subject?: string;
        textBody?: string;
        htmlBody?: string;
        receivedAt?: string;
      }[];
    };
  }): Promise<{ data: MeetingDetectResponse }> {
    return apiFetch<{ data: MeetingDetectResponse }>("/v1/meetings/detect", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Get meeting links for a thread. */
  getByThread(threadId: string): Promise<{ data: MeetingThreadResponse }> {
    return apiFetch<{ data: MeetingThreadResponse }>(
      `/v1/meetings/thread/${encodeURIComponent(threadId)}`,
    );
  },

  /** Manually attach a recording URL to a meeting. */
  linkRecording(
    meetingId: string,
    payload: { recordingUrl: string; transcriptUrl?: string },
  ): Promise<{ data: MeetingLinkRecordingResponse }> {
    return apiFetch<{ data: MeetingLinkRecordingResponse }>(
      `/v1/meetings/${encodeURIComponent(meetingId)}/link-recording`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  /** Trigger transcription (Whisper API or direct text). */
  transcribe(
    meetingId: string,
    payload?: { transcriptText?: string; audioUrl?: string },
  ): Promise<{ data: MeetingTranscribeResponse }> {
    return apiFetch<{ data: MeetingTranscribeResponse }>(
      `/v1/meetings/${encodeURIComponent(meetingId)}/transcribe`,
      { method: "POST", body: JSON.stringify(payload ?? {}) },
    );
  },

  /** Get AI summary of a meeting transcript. */
  getSummary(meetingId: string): Promise<{ data: MeetingSummaryResponse }> {
    return apiFetch<{ data: MeetingSummaryResponse }>(
      `/v1/meetings/${encodeURIComponent(meetingId)}/summary`,
    );
  },
};

// ─── Voice Clone Profiles (S4) ──────────────────────────────────────────────

export interface VoiceCloneProfile {
  id: string;
  name: string;
  sampleCount: number;
  confidenceScore: number;
  isDefault: boolean;
  isTraining: boolean;
  lastTrainedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceCloneTrainingResult {
  profileId: string;
  sampleCount: number;
  confidenceScore: number;
  formalityLevel: string;
  emojiUsage: number;
  signaturePhrasesFound: number;
  characteristicWordsFound: number;
  trainedAt: string;
}

export interface VoiceCloneComposeResult {
  body: string;
  profileId: string;
  profileName: string;
  confidenceScore: number;
  formalityLevel: string;
  sampleCount: number;
}

export const voiceCloneApi = {
  /** Create a new voice style profile. */
  createProfile(payload: {
    name: string;
    isDefault?: boolean;
  }): Promise<{ data: VoiceCloneProfile }> {
    return apiFetch<{ data: VoiceCloneProfile }>(
      "/v1/voice-clone/profiles",
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  /** List all voice profiles for the current account. */
  listProfiles(): Promise<{ data: VoiceCloneProfile[] }> {
    return apiFetch<{ data: VoiceCloneProfile[] }>(
      "/v1/voice-clone/profiles",
    );
  },

  /** Get a single profile by ID. */
  getProfile(profileId: string): Promise<{ data: VoiceCloneProfile & { styleFingerprint: unknown; trainingSampleCount: number } }> {
    return apiFetch(
      `/v1/voice-clone/profiles/${encodeURIComponent(profileId)}`,
    );
  },

  /** Train or retrain a profile from sent emails. */
  trainProfile(
    profileId: string,
    payload: { sampleSize?: number },
  ): Promise<{ data: VoiceCloneTrainingResult }> {
    return apiFetch<{ data: VoiceCloneTrainingResult }>(
      `/v1/voice-clone/profiles/${encodeURIComponent(profileId)}/train`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  /** Delete a voice profile. */
  deleteProfile(profileId: string): Promise<{ data: { deleted: boolean; id: string } }> {
    return apiFetch<{ data: { deleted: boolean; id: string } }>(
      `/v1/voice-clone/profiles/${encodeURIComponent(profileId)}`,
      { method: "DELETE" },
    );
  },

  /** Compose an email using a specific voice profile. */
  compose(payload: {
    profileId: string;
    prompt: string;
    recipient?: string;
    threadHistory?: { from: string; body: string }[];
    replyTo?: { from: string; subject: string; body: string };
  }): Promise<{ data: VoiceCloneComposeResult }> {
    return apiFetch<{ data: VoiceCloneComposeResult }>(
      "/v1/voice-clone/compose",
      { method: "POST", body: JSON.stringify(payload) },
    );
  },
};

// ─── Email Query (B2: Email-as-Database) ───────────────────────────────────

export interface QueryExecuteResponse {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  query: {
    original: string;
    parsed: Record<string, unknown>;
  };
}

export interface QueryExplainResponse {
  description: string;
  estimatedScope: string;
  warnings: string[];
  parsedQuery: Record<string, unknown>;
}

export interface QueryHistoryEntryData {
  id: string;
  queryText: string;
  queryType: "natural" | "sql";
  resultCount: number | null;
  executionTimeMs: number | null;
  createdAt: string;
}

export interface SavedQueryData {
  id: string;
  name: string;
  queryText: string;
  queryType: "natural" | "sql";
  lastRunAt: string | null;
  runCount: number;
  createdAt: string;
}

export const emailQueryApi = {
  /** Execute a query against the user's inbox. */
  execute(payload: {
    query: string;
    queryType?: "natural" | "sql";
    limit?: number;
    offset?: number;
    format?: "json" | "csv";
  }): Promise<{ data: QueryExecuteResponse }> {
    return apiFetch<{ data: QueryExecuteResponse }>("/v1/query", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Explain what a query would do without executing it. */
  explain(payload: {
    query: string;
    queryType?: "natural" | "sql";
  }): Promise<{ data: QueryExplainResponse }> {
    return apiFetch<{ data: QueryExplainResponse }>("/v1/query/explain", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Get recent query history. */
  getHistory(params?: {
    limit?: number;
    offset?: number;
  }): Promise<{ data: { entries: QueryHistoryEntryData[]; total: number } }> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", params.limit.toString());
    if (params?.offset) qs.set("offset", params.offset.toString());
    const query = qs.toString();
    return apiFetch(`/v1/query/history${query ? `?${query}` : ""}`);
  },

  /** Get saved queries. */
  getSavedQueries(): Promise<{
    data: { queries: SavedQueryData[]; total: number };
  }> {
    return apiFetch("/v1/query/saved");
  },

  /** Save a query. */
  saveQuery(payload: {
    name: string;
    queryText: string;
    queryType?: "natural" | "sql";
  }): Promise<{ data: SavedQueryData }> {
    return apiFetch<{ data: SavedQueryData }>("/v1/query/save", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Delete a saved query. */
  deleteSavedQuery(
    id: string,
  ): Promise<{ data: { deleted: boolean; id: string } }> {
    return apiFetch<{ data: { deleted: boolean; id: string } }>(
      `/v1/query/saved/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },
};

// ─── Templates ────────────────────────────────────────────────────────────

export interface Template {
  id: string;
  name: string;
  subject: string;
  htmlBody: string | null;
  textBody: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateRenderResult {
  subject: string;
  htmlBody: string | null;
  textBody: string | null;
}

export const templatesApi = {
  /** List templates with optional pagination and name filter. */
  list(params?: {
    limit?: number;
    cursor?: string;
    name?: string;
  }): Promise<PaginatedResponse<Template>> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.cursor) qs.set("cursor", params.cursor);
    if (params?.name) qs.set("name", params.name);
    const query = qs.toString();
    return apiFetch<PaginatedResponse<Template>>(
      `/v1/templates${query ? `?${query}` : ""}`,
    );
  },

  /** Get a single template by ID. */
  get(id: string): Promise<{ data: Template }> {
    return apiFetch<{ data: Template }>(
      `/v1/templates/${encodeURIComponent(id)}`,
    );
  },

  /** Create a new template. */
  create(payload: {
    name: string;
    subject: string;
    htmlBody?: string;
    textBody?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ data: Template }> {
    return apiFetch<{ data: Template }>("/v1/templates", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Update an existing template. */
  update(
    id: string,
    payload: {
      name?: string;
      subject?: string;
      htmlBody?: string;
      textBody?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<{ data: Template }> {
    return apiFetch<{ data: Template }>(
      `/v1/templates/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
  },

  /** Delete a template. */
  delete(id: string): Promise<{ data: { deleted: boolean; id: string } }> {
    return apiFetch<{ data: { deleted: boolean; id: string } }>(
      `/v1/templates/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  /** Render a template with variable substitution. */
  render(
    id: string,
    variables: Record<string, unknown>,
  ): Promise<{ data: TemplateRenderResult }> {
    return apiFetch<{ data: TemplateRenderResult }>(
      `/v1/templates/${encodeURIComponent(id)}/render`,
      { method: "POST", body: JSON.stringify({ variables }) },
    );
  },
};

// ─── Smart Folders (Saved Searches) ──────────────────────────────────────────

export interface SmartFolderFilter {
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  isRead?: boolean;
  isStarred?: boolean;
  labels?: string[];
  dateAfter?: string;
  dateBefore?: string;
  query?: string;
  senderDomain?: string;
  category?: string;
}

export interface SmartFolder {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  type: "smart" | "saved_search";
  filters: SmartFolderFilter;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export const smartFoldersApi = {
  list(params?: { limit?: number; cursor?: string; type?: "smart" | "saved_search" }): Promise<{
    data: SmartFolder[];
    cursor: string | null;
    hasMore: boolean;
  }> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.cursor) qs.set("cursor", params.cursor);
    if (params?.type) qs.set("type", params.type);
    const query = qs.toString();
    return apiFetch(`/v1/smart-folders${query ? `?${query}` : ""}`);
  },

  get(id: string): Promise<{ data: SmartFolder }> {
    return apiFetch(`/v1/smart-folders/${encodeURIComponent(id)}`);
  },

  create(payload: {
    name: string;
    icon?: string;
    color?: string;
    type?: "smart" | "saved_search";
    filters: SmartFolderFilter;
    sortOrder?: number;
  }): Promise<{ data: SmartFolder }> {
    return apiFetch("/v1/smart-folders", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update(
    id: string,
    payload: {
      name?: string;
      icon?: string;
      color?: string;
      type?: "smart" | "saved_search";
      filters?: SmartFolderFilter;
      sortOrder?: number;
    },
  ): Promise<{ data: { id: string; updatedAt: string } }> {
    return apiFetch(`/v1/smart-folders/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  remove(id: string): Promise<{ deleted: boolean; id: string }> {
    return apiFetch(`/v1/smart-folders/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};

// ─── Shared Inboxes ───────────────────────────────────────────────────────────

export interface SharedInboxMember {
  userId: string;
  role: "owner" | "admin" | "member";
  addedAt: string;
}

export interface SharedInbox {
  id: string;
  accountId: string;
  name: string;
  email: string;
  members: SharedInboxMember[];
  createdAt: string;
}

export const sharedInboxesApi = {
  list(): Promise<{ data: SharedInbox[] }> {
    return apiFetch<{ data: SharedInbox[] }>("/v1/collaborate/shared-inboxes");
  },

  create(payload: {
    name: string;
    email: string;
    members?: { userId: string; role?: "owner" | "admin" | "member" }[];
  }): Promise<{ data: SharedInbox }> {
    return apiFetch<{ data: SharedInbox }>("/v1/collaborate/shared-inboxes", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};

// ─── Email Delegations ────────────────────────────────────────────────────────

export interface DelegationPermissions {
  canReply: boolean;
  canArchive: boolean;
  canDelete: boolean;
  canForward: boolean;
}

export interface EmailDelegation {
  id: string;
  accountId: string;
  delegatorUserId: string;
  delegateUserId: string;
  scope: "all" | "label" | "sender" | "thread";
  scopeValue: string | null;
  permissions: DelegationPermissions;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const delegationsApi = {
  /** List delegations I created (as delegator). */
  listAsOwner(): Promise<{ data: EmailDelegation[]; cursor: string | null; hasMore: boolean }> {
    return apiFetch<{ data: EmailDelegation[]; cursor: string | null; hasMore: boolean }>(
      "/v1/delegations?role=delegator",
    );
  },

  /** List delegations where I am the delegate. */
  listAsDelegate(): Promise<{ data: EmailDelegation[]; cursor: string | null; hasMore: boolean }> {
    return apiFetch<{ data: EmailDelegation[]; cursor: string | null; hasMore: boolean }>(
      "/v1/delegations?role=delegate",
    );
  },

  /** Create a new delegation. */
  create(payload: {
    delegateUserId: string;
    scope: "all" | "label" | "sender" | "thread";
    scopeValue?: string | null;
    permissions: DelegationPermissions;
    expiresAt?: string | null;
  }): Promise<{ data: EmailDelegation }> {
    return apiFetch<{ data: EmailDelegation }>("/v1/delegations", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Revoke (delete) a delegation by ID. */
  revoke(id: string): Promise<{ deleted: boolean; id: string }> {
    return apiFetch<{ deleted: boolean; id: string }>(
      `/v1/delegations/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },
};

// ─── Mail Merge ────────────────────────────────────────────────────────────

export interface MailMergeRecipientStatus {
  email: string;
  variables: Record<string, string>;
  status: "pending" | "sent" | "failed" | "skipped";
  error?: string;
}

export interface MailMergeCampaign {
  id: string;
  name: string;
  subject: string;
  status: "draft" | "sending" | "completed" | "cancelled";
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MailMergeCampaignDetail extends MailMergeCampaign {
  htmlBody: string | null;
  textBody: string | null;
  templateId: string | null;
  recipients: MailMergeRecipientStatus[];
}

export const mailMergeApi = {
  list(params?: {
    limit?: number;
    cursor?: string;
  }): Promise<{ data: MailMergeCampaign[]; cursor: string | null; hasMore: boolean }> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.cursor) qs.set("cursor", params.cursor);
    const query = qs.toString();
    return apiFetch<{ data: MailMergeCampaign[]; cursor: string | null; hasMore: boolean }>(
      `/v1/mail-merge${query ? `?${query}` : ""}`,
    );
  },

  create(payload: {
    name: string;
    subject: string;
    htmlBody?: string;
    textBody?: string;
    scheduledAt?: string;
  }): Promise<{ data: MailMergeCampaign }> {
    return apiFetch<{ data: MailMergeCampaign }>("/v1/mail-merge", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  get(id: string): Promise<{ data: MailMergeCampaignDetail }> {
    return apiFetch<{ data: MailMergeCampaignDetail }>(
      `/v1/mail-merge/${encodeURIComponent(id)}`,
    );
  },

  addRecipients(
    id: string,
    recipients: { email: string; variables: Record<string, string> }[],
  ): Promise<{ data: { added: number; skipped: number; totalRecipients: number } }> {
    return apiFetch<{ data: { added: number; skipped: number; totalRecipients: number } }>(
      `/v1/mail-merge/${encodeURIComponent(id)}/recipients`,
      { method: "POST", body: JSON.stringify({ recipients }) },
    );
  },

  start(id: string): Promise<{
    data: { id: string; status: string; totalRecipients: number; startedAt: string };
  }> {
    return apiFetch<{
      data: { id: string; status: string; totalRecipients: number; startedAt: string };
    }>(`/v1/mail-merge/${encodeURIComponent(id)}/start`, { method: "POST" });
  },

  cancel(id: string): Promise<{
    data: { id: string; status: string; completedAt: string };
  }> {
    return apiFetch<{
      data: { id: string; status: string; completedAt: string };
    }>(`/v1/mail-merge/${encodeURIComponent(id)}/cancel`, { method: "POST" });
  },

  remove(id: string): Promise<{ deleted: boolean; id: string }> {
    return apiFetch<{ deleted: boolean; id: string }>(
      `/v1/mail-merge/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },
};

// ─── Team Chat ───────────────────────────────────────────────────────────────

export interface ChatChannel {
  id: string;
  type: "direct" | "group" | "thread";
  name: string | null;
  topic: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  content: string;
  replyToId: string | null;
  isEdited: boolean;
  createdAt: string;
}

export interface ChatChannelDetail extends ChatChannel {
  members: { userId: string; role: string; joinedAt: string }[];
  recentMessages: ChatMessage[];
}

export const chatApi = {
  listChannels(): Promise<{ data: ChatChannel[] }> {
    return apiFetch<{ data: ChatChannel[] }>("/v1/chat/channels");
  },

  getChannel(id: string): Promise<{ data: ChatChannelDetail }> {
    return apiFetch<{ data: ChatChannelDetail }>(`/v1/chat/channels/${encodeURIComponent(id)}`);
  },

  createChannel(payload: {
    name?: string;
    topic?: string;
    type?: "direct" | "group" | "thread";
    memberIds: string[];
  }): Promise<{ data: { id: string; type: string; name: string | undefined; memberCount: number; createdAt: string } }> {
    return apiFetch("/v1/chat/channels", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getMessages(
    channelId: string,
    params?: { limit?: number; cursor?: string },
  ): Promise<{ data: ChatMessage[]; cursor: string | null; hasMore: boolean }> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.cursor) qs.set("cursor", params.cursor);
    const query = qs.toString();
    return apiFetch<{ data: ChatMessage[]; cursor: string | null; hasMore: boolean }>(
      `/v1/chat/channels/${encodeURIComponent(channelId)}/messages${query ? `?${query}` : ""}`,
    );
  },

  sendMessage(
    channelId: string,
    payload: { content: string; replyToId?: string },
  ): Promise<{ data: { id: string; channelId: string; content: string; createdAt: string } }> {
    return apiFetch(`/v1/chat/channels/${encodeURIComponent(channelId)}/messages`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  editMessage(
    messageId: string,
    content: string,
  ): Promise<{ data: { id: string; updated: boolean } }> {
    return apiFetch(`/v1/chat/messages/${encodeURIComponent(messageId)}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
  },

  deleteMessage(messageId: string): Promise<{ deleted: boolean; id: string }> {
    return apiFetch<{ deleted: boolean; id: string }>(
      `/v1/chat/messages/${encodeURIComponent(messageId)}`,
      { method: "DELETE" },
    );
  },

  markRead(channelId: string): Promise<{ success: boolean }> {
    return apiFetch<{ success: boolean }>(
      `/v1/chat/channels/${encodeURIComponent(channelId)}/read`,
      { method: "POST" },
    );
  },
};

// ─── Documents ────────────────────────────────────────────────────────────────

export type DocumentType = "doc" | "spreadsheet" | "presentation" | "form";
export type AiAssistAction = "summarize" | "expand" | "rewrite" | "translate" | "proofread";
export type ExportFormat = "pdf" | "html" | "markdown";

export interface AlecRaeDocument {
  id: string;
  title: string;
  type: DocumentType;
  content: string | null;
  folderId: string | null;
  isTemplate: boolean;
  isPublic: boolean;
  tags: string[];
  wordCount: number;
  charCount: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentFolder {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  createdAt: string;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  title: string;
  wordCount: number;
  createdAt: string;
}

export interface AiAssistResult {
  action: AiAssistAction;
  result: string;
  targetLanguage?: string;
}

export interface ExportResult {
  format: ExportFormat;
  content: string;
  mimeType: string;
  filename: string;
}

export const documentsApi = {
  list(params?: {
    limit?: number;
    cursor?: string;
    type?: DocumentType;
    folderId?: string;
  }): Promise<{ data: AlecRaeDocument[]; nextCursor?: string }> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.cursor) qs.set("cursor", params.cursor);
    if (params?.type) qs.set("type", params.type);
    if (params?.folderId) qs.set("folderId", params.folderId);
    const query = qs.toString();
    return apiFetch<{ data: AlecRaeDocument[]; nextCursor?: string }>(
      `/v1/documents${query ? `?${query}` : ""}`,
    );
  },

  get(id: string): Promise<{ data: AlecRaeDocument }> {
    return apiFetch<{ data: AlecRaeDocument }>(`/v1/documents/${encodeURIComponent(id)}`);
  },

  create(data: {
    title: string;
    type: DocumentType;
    folderId?: string | null;
    isTemplate?: boolean;
    tags?: string[];
  }): Promise<{ data: AlecRaeDocument }> {
    return apiFetch<{ data: AlecRaeDocument }>("/v1/documents", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update(
    id: string,
    data: {
      title?: string;
      content?: string;
      tags?: string[];
      isPublic?: boolean;
    },
  ): Promise<{ data: AlecRaeDocument }> {
    return apiFetch<{ data: AlecRaeDocument }>(`/v1/documents/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  remove(id: string): Promise<{ deleted: boolean; id: string }> {
    return apiFetch<{ deleted: boolean; id: string }>(
      `/v1/documents/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  aiAssist(
    id: string,
    action: AiAssistAction,
    targetLanguage?: string,
  ): Promise<{ data: AiAssistResult }> {
    return apiFetch<{ data: AiAssistResult }>(
      `/v1/documents/${encodeURIComponent(id)}/ai-assist`,
      {
        method: "POST",
        body: JSON.stringify({ action, ...(targetLanguage ? { targetLanguage } : {}) }),
      },
    );
  },

  exportDoc(id: string, format: ExportFormat): Promise<{ data: ExportResult }> {
    return apiFetch<{ data: ExportResult }>(
      `/v1/documents/${encodeURIComponent(id)}/export`,
      {
        method: "POST",
        body: JSON.stringify({ format }),
      },
    );
  },

  listFolders(): Promise<{ data: DocumentFolder[] }> {
    return apiFetch<{ data: DocumentFolder[] }>("/v1/documents/folders");
  },

  createFolder(name: string): Promise<{ data: DocumentFolder }> {
    return apiFetch<{ data: DocumentFolder }>("/v1/documents/folders", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  deleteFolder(id: string): Promise<{ deleted: boolean; id: string }> {
    return apiFetch<{ deleted: boolean; id: string }>(
      `/v1/documents/folders/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  listVersions(id: string): Promise<{ data: DocumentVersion[] }> {
    return apiFetch<{ data: DocumentVersion[] }>(
      `/v1/documents/${encodeURIComponent(id)}/versions`,
    );
  },
};

// ─── A/B Tests ────────────────────────────────────────────────────────────────

export interface ABTestVariant {
  id: string;
  subject?: string;
  htmlBody?: string;
  textBody?: string;
  percentage: number;
  metrics?: {
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
    openRate: number;
    clickRate: number;
  };
}

export interface ABTest {
  id: string;
  name: string;
  status: "draft" | "running" | "completed" | "cancelled";
  variants: ABTestVariant[];
  winnerMetric: "open_rate" | "click_rate" | "reply_rate";
  winnerVariantId?: string;
  recipientCount?: number;
  results?: {
    totalSent: number;
    winner?: string;
    confidence?: number;
    variants: Record<
      string,
      {
        sent: number;
        opened: number;
        clicked: number;
        replied: number;
        openRate: number;
        clickRate: number;
      }
    >;
  };
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

export const abTestsApi = {
  list(params?: { limit?: number; cursor?: string }): Promise<{
    data: ABTest[];
    cursor: string | null;
    hasMore: boolean;
  }> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.cursor) qs.set("cursor", params.cursor);
    const query = qs.toString();
    return apiFetch<{ data: ABTest[]; cursor: string | null; hasMore: boolean }>(
      `/v1/ab-tests${query ? `?${query}` : ""}`,
    );
  },

  get(id: string): Promise<{ data: ABTest }> {
    return apiFetch<{ data: ABTest }>(`/v1/ab-tests/${encodeURIComponent(id)}`);
  },

  create(payload: {
    name: string;
    variants: { subject?: string; htmlBody?: string; textBody?: string; percentage: number }[];
    winnerMetric?: "open_rate" | "click_rate" | "reply_rate";
  }): Promise<{ data: ABTest }> {
    return apiFetch<{ data: ABTest }>("/v1/ab-tests", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  start(id: string): Promise<{ data: { id: string; status: string; startedAt: string } }> {
    return apiFetch<{ data: { id: string; status: string; startedAt: string } }>(
      `/v1/ab-tests/${encodeURIComponent(id)}/start`,
      { method: "POST" },
    );
  },

  complete(
    id: string,
    winnerId?: string,
  ): Promise<{ data: { id: string; status: string; winner: string | null; completedAt: string } }> {
    return apiFetch<{
      data: { id: string; status: string; winner: string | null; completedAt: string };
    }>(`/v1/ab-tests/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      body: JSON.stringify(winnerId !== undefined ? { winnerId } : {}),
    });
  },

  remove(id: string): Promise<{ deleted: boolean; id: string }> {
    return apiFetch<{ deleted: boolean; id: string }>(
      `/v1/ab-tests/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },
};

// ─── Auto-Responder / Out-of-Office ──────────────────────────────────────────

export type AutoResponderMode = "off" | "vacation" | "busy" | "custom";

export interface AutoResponder {
  id: string;
  mode: AutoResponderMode;
  subject: string;
  htmlBody?: string;
  textBody?: string;
  isActive: boolean;
  schedule?: {
    startDate: string;
    endDate?: string;
    timezone: string;
  };
  rules?: {
    respondToContacts: boolean;
    respondToUnknown: boolean;
    excludeDomains?: string[];
    excludeLabels?: string[];
    maxResponsesPerSender?: number;
    aiSmartReply: boolean;
  };
  createdAt: string;
}

export interface AutoResponderLogEntry {
  id: string;
  toEmail: string;
  subject: string;
  sentAt: string;
}

export const autoResponderApi = {
  getConfig(): Promise<{ data: AutoResponder | null }> {
    return apiFetch<{ data: AutoResponder | null }>("/v1/auto-responder");
  },

  upsert(data: {
    mode: AutoResponderMode;
    subject: string;
    htmlBody?: string;
    textBody?: string;
    schedule?: { startDate: string; endDate?: string; timezone: string };
    rules?: {
      respondToContacts: boolean;
      respondToUnknown: boolean;
      excludeDomains?: string[];
      excludeLabels?: string[];
      maxResponsesPerSender?: number;
      aiSmartReply: boolean;
    };
  }): Promise<{ data: { id: string; mode: string; subject: string } }> {
    return apiFetch<{ data: { id: string; mode: string; subject: string } }>(
      "/v1/auto-responder",
      { method: "PUT", body: JSON.stringify(data) },
    );
  },

  activate(): Promise<{ data: { id: string; isActive: boolean } }> {
    return apiFetch<{ data: { id: string; isActive: boolean } }>(
      "/v1/auto-responder/activate",
      { method: "POST" },
    );
  },

  deactivate(): Promise<{ data: { id: string; isActive: boolean } }> {
    return apiFetch<{ data: { id: string; isActive: boolean } }>(
      "/v1/auto-responder/deactivate",
      { method: "POST" },
    );
  },

  getLog(params?: { limit?: number; cursor?: string }): Promise<{
    data: AutoResponderLogEntry[];
  }> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.cursor) qs.set("cursor", params.cursor);
    const query = qs.toString();
    return apiFetch<{ data: AutoResponderLogEntry[] }>(
      `/v1/auto-responder/log${query ? `?${query}` : ""}`,
    );
  },

  preview(sampleEmailBody: string): Promise<{ reply: string }> {
    return apiFetch<{ reply: string }>("/v1/auto-responder/preview", {
      method: "POST",
      body: JSON.stringify({ sampleEmailBody }),
    });
  },
};
