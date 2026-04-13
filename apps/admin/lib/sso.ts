/**
 * SSO Client Library for Admin Dashboard
 *
 * Handles SP-initiated SAML SSO login flow, token management,
 * and session verification against the /v1/sso/* API endpoints.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const SSO_TOKEN_KEY = "alecrae_admin_sso_token";
const SSO_SESSION_KEY = "alecrae_admin_sso_session";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SsoUser {
  id: string;
  email: string;
  name: string;
  role: string;
  accountId: string;
}

export interface SsoSession {
  token: string;
  user: SsoUser;
  ssoSessionIndex: string;
  expiresAt: number;
}

export interface SsoLoginResponse {
  data: {
    redirectUrl: string;
    requestId: string;
  };
}

export interface SsoVerifyResponse {
  data: {
    valid: boolean;
    userId: string;
    email: string;
    role: string;
    accountId: string;
    ssoIssuer: string | null;
  };
}

export interface SsoConfigResponse {
  data: {
    entityId: string;
    ssoUrl: string;
    sloUrl: string;
    certificateConfigured: boolean;
    enabled: boolean;
  } | null;
}

// ─── Token storage ──────────────────────────────────────────────────────────

function storeSession(session: SsoSession): void {
  if (typeof window === "undefined") return;
  // Store token separately for API calls
  localStorage.setItem(SSO_TOKEN_KEY, session.token);
  // Store full session info
  localStorage.setItem(SSO_SESSION_KEY, JSON.stringify(session));
  // Also set the standard admin key for the existing admin API client
  localStorage.setItem("alecrae_admin_key", session.token);
}

function getStoredSession(): SsoSession | null {
  if (typeof window === "undefined") return null;

  const sessionJson = localStorage.getItem(SSO_SESSION_KEY);
  if (!sessionJson) return null;

  try {
    const session = JSON.parse(sessionJson) as SsoSession;
    // Check if expired (with 5 minute buffer)
    if (session.expiresAt < Date.now() - 300000) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    clearSession();
    return null;
  }
}

function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(SSO_TOKEN_KEY) ?? "";
}

function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SSO_TOKEN_KEY);
  localStorage.removeItem(SSO_SESSION_KEY);
  localStorage.removeItem("alecrae_admin_key");
}

// ─── API calls ──────────────────────────────────────────────────────────────

/**
 * Initiate SP-initiated SSO login. Returns the IdP redirect URL.
 */
async function initiateLogin(accountId: string, returnUrl?: string): Promise<SsoLoginResponse> {
  const res = await fetch(`${API_BASE}/v1/sso/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, returnUrl }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(error?.error?.message ?? `SSO login failed: ${res.status}`);
  }

  return res.json() as Promise<SsoLoginResponse>;
}

/**
 * Verify the current SSO token with the server.
 */
async function verifyToken(): Promise<SsoVerifyResponse | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE}/v1/sso/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;
    return res.json() as Promise<SsoVerifyResponse>;
  } catch {
    return null;
  }
}

/**
 * Get SSO configuration for the current account.
 */
async function getConfig(): Promise<SsoConfigResponse | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE}/v1/sso/config`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;
    return res.json() as Promise<SsoConfigResponse>;
  } catch {
    return null;
  }
}

/**
 * Initiate SP-initiated SLO (Single Logout).
 */
async function initiateLogout(): Promise<void> {
  const session = getStoredSession();
  if (!session) {
    clearSession();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/v1/sso/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        accountId: session.user.accountId,
        email: session.user.email,
        sessionIndex: session.ssoSessionIndex,
      }),
    });

    if (res.ok) {
      const data = await res.json() as { data?: { redirectUrl?: string } };
      clearSession();
      // If IdP has an SLO URL, redirect there
      if (data.data?.redirectUrl) {
        window.location.href = data.data.redirectUrl;
        return;
      }
    }
  } catch {
    // Best-effort logout
  }

  clearSession();
}

/**
 * Handle the ACS callback — called after IdP redirects back.
 * In practice this is handled server-side; this is for the SPA to
 * process the token returned by the ACS endpoint.
 */
function handleAcsToken(token: string, user: SsoUser, ssoSessionIndex: string): void {
  const session: SsoSession = {
    token,
    user,
    ssoSessionIndex,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  };
  storeSession(session);
}

// ─── Auth guard ─────────────────────────────────────────────────────────────

/**
 * Check if user is authenticated. Returns the session if valid, null otherwise.
 */
function isAuthenticated(): SsoSession | null {
  return getStoredSession();
}

/**
 * Check if user has a specific role (or higher).
 */
function hasRole(requiredRole: "viewer" | "member" | "admin" | "owner"): boolean {
  const session = getStoredSession();
  if (!session) return false;

  const roleHierarchy: Record<string, number> = {
    viewer: 0,
    member: 1,
    admin: 2,
    owner: 3,
  };

  const userLevel = roleHierarchy[session.user.role] ?? 0;
  const requiredLevel = roleHierarchy[requiredRole] ?? 0;

  return userLevel >= requiredLevel;
}

// ─── Export ─────────────────────────────────────────────────────────────────

export const ssoClient = {
  initiateLogin,
  verifyToken,
  getConfig,
  initiateLogout,
  handleAcsToken,
  isAuthenticated,
  hasRole,
  getToken,
  clearSession,
  getStoredSession,
};
