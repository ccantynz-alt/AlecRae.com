/**
 * Centralized session-token store + silent refresh for the web client.
 *
 * Why this exists: the API issues a short-lived access token (15 min) plus a
 * long-lived, rotating, DB-backed refresh token (7 days). Previously the web
 * client stored only the access token and never refreshed, so the moment the
 * 15-minute access token expired, every request came back
 * "invalid or expired bearer token" and the user was silently logged out
 * mid-session. This module captures the refresh token at login and renews the
 * access token transparently on a 401, keeping the session alive for the full
 * 7-day window.
 */

import { getApiBase } from "./api-base";

const API_BASE = getApiBase();
const ACCESS_KEY = "alecrae_api_key";
const REFRESH_KEY = "alecrae_refresh_token";

export function getAccessToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ACCESS_KEY) ?? "";
}

export function getRefreshToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(REFRESH_KEY) ?? "";
}

/**
 * Persist the session cookie the web middleware reads. Host-only on purpose
 * (the API is called with Bearer tokens, never cookies, so the cookie must not
 * span subdomains). `Secure` is appended on HTTPS so the production gateway
 * never sees it on plaintext.
 */
function writeSessionCookie(token: string): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `alecrae_session=${token}; path=/; max-age=${7 * 86400}; SameSite=Lax${secure}`;
}

/** Store a fresh session. Pass the refresh token whenever the API returns one. */
export function setSession(token: string, refreshToken?: string | null): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_KEY, token);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  writeSessionCookie(token);
}

/** Clear all session material (logout, or unrecoverable refresh failure). */
export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  document.cookie = "alecrae_session=; path=/; max-age=0; SameSite=Lax";
}

// Single-flight: concurrent 401s share one refresh request rather than each
// firing its own (which would burn the rotating refresh token and trip the
// API's token-reuse theft detection, revoking the whole family).
let refreshInFlight: Promise<string | null> | null = null;

/**
 * Exchange the stored refresh token for a new access token. Returns the new
 * access token on success, or null if there's no refresh token / it's invalid
 * (in which case the session is cleared).
 */
export async function refreshSession(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async (): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        // Refresh token expired/revoked — the session is unrecoverable.
        clearSession();
        return null;
      }
      const body = (await res.json()) as {
        data: { token: string; refreshToken: string; expiresIn: number };
      };
      setSession(body.data.token, body.data.refreshToken);
      return body.data.token;
    } catch {
      // Network error — keep the (stale) session so we can retry later rather
      // than logging the user out over a blip.
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * Redirect to the login page after an unrecoverable auth failure, preserving
 * where the user was so they can be returned after re-auth. No-op if already
 * on an auth page (avoids redirect loops).
 */
export function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  clearSession();
  const here = window.location.pathname + window.location.search;
  if (here.startsWith("/login")) return;
  window.location.href = `/login?next=${encodeURIComponent(here)}`;
}
