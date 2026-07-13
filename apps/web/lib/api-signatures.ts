/**
 * API client for the Email Signatures feature domain
 * (apps/api/src/routes/signatures.ts).
 *
 * Covers all 6 backend endpoints (mounted at /v1/signatures in server.ts):
 *   POST   /v1/signatures             — create a signature
 *   GET    /v1/signatures?limit=&cursor= — list signatures for account
 *   GET    /v1/signatures/:id         — get a single signature
 *   PUT    /v1/signatures/:id         — update a signature
 *   DELETE /v1/signatures/:id         — delete a signature
 *   POST   /v1/signatures/:id/default — set as default signature
 *
 * Mirrors the featureFetch wrapper in lib/api-features.ts / lib/api-delegation.ts
 * so this domain has its own typed entry point with silent 401 → refresh → retry
 * handling.
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface SignatureApiError {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

async function signatureFetch<T>(
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
      return signatureFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as SignatureApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SignatureContext {
  accountEmails?: string[];
  recipientDomains?: string[];
  labels?: string[];
}

export interface EmailSignature {
  id: string;
  name: string;
  htmlContent: string;
  textContent: string;
  isDefault: boolean;
  sortOrder: number;
  context: SignatureContext;
  createdAt: string;
  updatedAt: string;
}

export interface SignatureListResult {
  data: EmailSignature[];
  cursor: string | null;
  hasMore: boolean;
}

export interface CreateSignaturePayload {
  name: string;
  htmlContent: string;
  textContent: string;
  isDefault?: boolean;
  sortOrder?: number;
  context?: SignatureContext;
}

export interface UpdateSignaturePayload {
  name?: string;
  htmlContent?: string;
  textContent?: string;
  isDefault?: boolean;
  sortOrder?: number;
  context?: SignatureContext;
}

// ─── Signatures API (/v1/signatures) ─────────────────────────────────────────

export const signaturesApi = {
  /** POST /v1/signatures — create a signature. */
  create(
    payload: CreateSignaturePayload,
  ): Promise<{ data: EmailSignature }> {
    return signatureFetch<{ data: EmailSignature }>("/v1/signatures", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** GET /v1/signatures — list signatures for the account, cursor-paginated. */
  list(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<SignatureListResult> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const qs = params.toString();
    return signatureFetch<SignatureListResult>(
      `/v1/signatures${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /v1/signatures/:id — get a single signature. */
  get(id: string): Promise<{ data: EmailSignature }> {
    return signatureFetch<{ data: EmailSignature }>(
      `/v1/signatures/${encodeURIComponent(id)}`,
    );
  },

  /** PUT /v1/signatures/:id — update name, content, default, order, context. */
  update(
    id: string,
    payload: UpdateSignaturePayload,
  ): Promise<{ data: EmailSignature }> {
    return signatureFetch<{ data: EmailSignature }>(
      `/v1/signatures/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
  },

  /** DELETE /v1/signatures/:id — delete a signature. */
  remove(id: string): Promise<{ deleted: boolean; id: string }> {
    return signatureFetch<{ deleted: boolean; id: string }>(
      `/v1/signatures/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  /** POST /v1/signatures/:id/default — set as the account default. */
  setDefault(
    id: string,
  ): Promise<{ data: { id: string; isDefault: boolean; updatedAt: string } }> {
    return signatureFetch<{
      data: { id: string; isDefault: boolean; updatedAt: string };
    }>(`/v1/signatures/${encodeURIComponent(id)}/default`, {
      method: "POST",
    });
  },
};
