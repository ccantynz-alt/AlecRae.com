/**
 * API client for the enterprise SSO / SAML 2.0 feature domain
 * (apps/api/src/routes/sso.ts).
 *
 * The router is mounted at /v1/sso in server.ts (verified — the route-file
 * header comment is otherwise accurate for the paths below). This client covers
 * the admin-facing configuration surface plus the public SP metadata URL and a
 * test helper built on the existing /v1/sso/login endpoint:
 *
 *   GET  /v1/sso/metadata   — SP EntityDescriptor XML (public; IdP consumes it)
 *   GET  /v1/sso/config     — read current IdP config (admin token required)
 *   PUT  /v1/sso/config     — create/update IdP config (owner/admin only)
 *   POST /v1/sso/login      — SP-initiated SSO; used here as a "test connection"
 *                             probe (returns a redirect URL when config is valid)
 *
 * Mirrors the featureFetch wrapper in lib/api-features.ts (silent
 * 401 → refreshSession → retry) using the same pattern as lib/api-delegation.ts
 * so this domain has its own typed entry point.
 *
 * IMPORTANT BACKEND NOTE (reported, not fixed here): the /v1/sso/config
 * endpoints verify their Bearer token with jose requiring issuer
 * "alecrae-sso" (verifyToken in sso.ts), which is the token minted by the SSO
 * ACS flow — NOT the standard session access token issued at login. A normal
 * logged-in admin's session token will therefore fail these endpoints with a
 * 401 "invalid_token". This client sends the best token it has and surfaces
 * that failure cleanly; the real fix is server-side.
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface SsoApiError {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

async function ssoFetch<T>(
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
      return ssoFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as SsoApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

/** Fetch a plain-text response (used for the SP metadata XML). */
async function ssoFetchText(
  path: string,
  retried = false,
): Promise<string> {
  const token = getAccessToken();

  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 401 && !retried && getRefreshToken()) {
    const fresh = await refreshSession();
    if (fresh) {
      return ssoFetchText(path, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    throw new Error(`Failed to load SP metadata: ${res.status}`);
  }

  return res.text();
}

// ─── Types ─────────────────────────────────────────────────────────────────

/**
 * Shape returned by GET /v1/sso/config. The endpoint never returns the raw
 * certificate — it exposes only whether one is configured — so this client
 * mirrors that (no `certificate` field on read).
 */
export interface SsoConfigView {
  entityId: string;
  ssoUrl: string;
  sloUrl: string;
  certificateConfigured: boolean;
  enabled: boolean;
}

/** Payload for PUT /v1/sso/config (matches SsoConfigSchema on the server). */
export interface SsoConfigPayload {
  entityId: string;
  ssoUrl: string;
  sloUrl: string;
  certificate: string;
  enabled: boolean;
}

export interface SsoConfigUpdateResult {
  message: string;
  entityId: string;
  ssoUrl: string;
  sloUrl: string;
  enabled: boolean;
}

/** Shape returned by POST /v1/sso/login (used here to test the connection). */
export interface SsoLoginResult {
  redirectUrl: string;
  requestId: string;
}

// ─── SSO API (/v1/sso) ───────────────────────────────────────────────────────

export const ssoApi = {
  /** GET /v1/sso/metadata — raw SP EntityDescriptor XML (copyable, given to the IdP). */
  metadata(): Promise<string> {
    return ssoFetchText("/v1/sso/metadata");
  },

  /** The absolute URL of the SP metadata endpoint (handy to show/copy directly). */
  metadataUrl(): string {
    return `${API_BASE}/v1/sso/metadata`;
  },

  /** The absolute Assertion Consumer Service URL the IdP posts responses to. */
  acsUrl(): string {
    return `${API_BASE}/v1/sso/acs`;
  },

  /** The absolute Single Logout URL. */
  sloUrl(): string {
    return `${API_BASE}/v1/sso/slo`;
  },

  /**
   * GET /v1/sso/config — current IdP configuration. `data` is null when SSO
   * has never been configured for the account.
   */
  getConfig(): Promise<{ data: SsoConfigView | null }> {
    return ssoFetch<{ data: SsoConfigView | null }>("/v1/sso/config");
  },

  /** PUT /v1/sso/config — create or update the IdP configuration (owner/admin). */
  updateConfig(
    payload: SsoConfigPayload,
  ): Promise<{ data: SsoConfigUpdateResult }> {
    return ssoFetch<{ data: SsoConfigUpdateResult }>("/v1/sso/config", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  /**
   * POST /v1/sso/login — probe the configured IdP. A successful response
   * (redirect URL returned) means the account's SSO config is present + enabled
   * and the SP can build a valid AuthnRequest for the configured SSO URL.
   */
  testConnection(
    accountId: string,
  ): Promise<{ data: SsoLoginResult }> {
    return ssoFetch<{ data: SsoLoginResult }>("/v1/sso/login", {
      method: "POST",
      body: JSON.stringify({ accountId }),
    });
  },
};
