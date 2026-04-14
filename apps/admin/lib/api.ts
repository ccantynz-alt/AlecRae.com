/**
 * Admin Dashboard API Client
 *
 * Communicates with the /v1/admin/* endpoints on the API server.
 * Mirrors the pattern in apps/web/lib/api.ts but targets admin-specific routes.
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

// Stats response from GET /v1/admin/stats
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

// Event from GET /v1/admin/events
export interface AdminEvent {
  id: string;
  accountId: string;
  emailId: string;
  messageId: string;
  type: string;
  recipient: string;
  timestamp: string;
  bounceType: string | null;
  bounceCategory: string | null;
  diagnosticCode: string | null;
  remoteMta: string | null;
  url: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  smtpResponse: string | null;
  mxHost: string | null;
  tags: string[];
}

// Domain from GET /v1/admin/domains
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

// Message from GET /v1/admin/messages
export interface AdminMessage {
  id: string;
  accountId: string;
  messageId: string;
  from: { email: string; name: string | null };
  to: { email: string; name?: string }[];
  subject: string;
  status: string;
  tags: string[];
  createdAt: string;
  sentAt: string | null;
}

// User from GET /v1/admin/users
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

// ─── Core fetch wrapper ────────────────────────────────────────────────────

function getToken(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("alecrae_admin_key") ?? localStorage.getItem("alecrae_api_key") ?? "";
  }
  return "";
}

async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

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
    throw new Error(errorBody?.error?.message ?? `API request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Admin API methods ─────────────────────────────────────────────────────

export const adminApi = {
  /** Aggregate email stats across all accounts */
  async getStats(): Promise<AdminStats> {
    const res = await adminFetch<{ data: AdminStats }>("/v1/admin/stats");
    return res.data;
  },

  /** Recent events across all accounts */
  async listEvents(params?: {
    limit?: number;
    type?: string;
  }): Promise<AdminEvent[]> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.type) qs.set("type", params.type);
    const query = qs.toString();
    const res = await adminFetch<{ data: AdminEvent[] }>(
      `/v1/admin/events${query ? `?${query}` : ""}`,
    );
    return res.data;
  },

  /** All domains with status and email counts */
  async listDomains(): Promise<AdminDomain[]> {
    const res = await adminFetch<{ data: AdminDomain[] }>("/v1/admin/domains");
    return res.data;
  },

  /** Recent messages across all accounts */
  async listMessages(params?: {
    limit?: number;
    status?: string;
  }): Promise<AdminMessage[]> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.status) qs.set("status", params.status);
    const query = qs.toString();
    const res = await adminFetch<{ data: AdminMessage[] }>(
      `/v1/admin/messages${query ? `?${query}` : ""}`,
    );
    return res.data;
  },

  /** All users with account info */
  async listUsers(): Promise<AdminUser[]> {
    const res = await adminFetch<{ data: AdminUser[] }>("/v1/admin/users");
    return res.data;
  },
};
