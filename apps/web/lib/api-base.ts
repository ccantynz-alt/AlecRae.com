/**
 * Resolves the AlecRae API base URL for the web client.
 *
 * Priority:
 *  1. NEXT_PUBLIC_API_URL — explicit override, inlined by Next at build time.
 *  2. In the browser on a non-local host → the production API. This is what
 *     keeps the deployed site working without depending on any host-specific
 *     env config (we are not tied to a particular hosting provider).
 *  3. Otherwise → localhost, for local development.
 *
 * The key property: a production build must NEVER fall back to localhost, which
 * is unreachable from a user's device (the cause of "can't reach the server").
 */

const PRODUCTION_API_URL = "https://api.alecrae.com";
const LOCAL_API_URL = "http://localhost:3001";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export function getApiBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/+$/, "");

  if (typeof window !== "undefined" && !LOCAL_HOSTS.has(window.location.hostname)) {
    return PRODUCTION_API_URL;
  }

  return LOCAL_API_URL;
}
