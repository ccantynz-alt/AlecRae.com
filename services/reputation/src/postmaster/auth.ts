/**
 * @alecrae/reputation — Google Postmaster Tools: shared service-account auth
 *
 * Both the v1 reputation poller (index.ts) and the v2 compliance checker
 * (compliance.ts) authenticate as the same GOOGLE_POSTMASTER_SERVICE_ACCOUNT_JSON
 * service account, just requesting different OAuth scopes. This is the one
 * place that signs the JWT-bearer assertion and exchanges it for an access
 * token — verified against developers.google.com/gmail/postmaster/reference/rest
 * (canonical service host: gmailpostmastertools.googleapis.com).
 */

import { SignJWT, importPKCS8 } from "jose";
import { ok, err, type Result } from "@alecrae/shared";

const DEFAULT_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const POSTMASTER_SCOPES = {
  /** v1 domains.trafficStats.list — confirmed on the method reference page. */
  reputationReadonly: "https://www.googleapis.com/auth/postmaster.readonly",
  /** v2 domains.getComplianceStatus — broader scope, confirmed on the method reference page. */
  full: "https://www.googleapis.com/auth/postmaster",
} as const;

interface GoogleServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export function loadServiceAccount(): Result<GoogleServiceAccountKey> {
  const raw = process.env["GOOGLE_POSTMASTER_SERVICE_ACCOUNT_JSON"];
  if (!raw) {
    return err(new Error("GOOGLE_POSTMASTER_SERVICE_ACCOUNT_JSON is not set"));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return err(
      new Error(
        `GOOGLE_POSTMASTER_SERVICE_ACCOUNT_JSON is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  const key = parsed as Partial<GoogleServiceAccountKey>;
  if (!key.client_email || !key.private_key) {
    return err(
      new Error("GOOGLE_POSTMASTER_SERVICE_ACCOUNT_JSON is missing client_email or private_key"),
    );
  }

  return ok({
    client_email: key.client_email,
    private_key: key.private_key,
    ...(key.token_uri ? { token_uri: key.token_uri } : {}),
  });
}

/** Exchange the service account key for a bearer access token scoped to `scope`. */
export async function getAccessToken(
  scope: string,
  fetchFn: typeof fetch = fetch,
): Promise<Result<string>> {
  const saResult = loadServiceAccount();
  if (!saResult.ok) return saResult;
  const sa = saResult.value;

  let assertion: string;
  try {
    const privateKey = await importPKCS8(sa.private_key, "RS256");
    const nowSeconds = Math.floor(Date.now() / 1000);
    assertion = await new SignJWT({ scope })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(sa.client_email)
      .setSubject(sa.client_email)
      .setAudience(sa.token_uri ?? DEFAULT_TOKEN_URL)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + 3600)
      .sign(privateKey);
  } catch (error) {
    return err(
      new Error(
        `Failed to sign Google service-account JWT: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  const res = await fetchFn(sa.token_uri ?? DEFAULT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!res.ok) {
    return err(
      new Error(`Google token exchange failed (${res.status}): ${await res.text().catch(() => "")}`),
    );
  }

  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) {
    return err(new Error("Google token response missing access_token"));
  }
  return ok(body.access_token);
}

/**
 * Domains to monitor: GOOGLE_POSTMASTER_DOMAIN (single override, always
 * included when set) unioned with every `verified` domain in the account's
 * `domains` table (multi-tenant customer domains). AlecRae's own sending
 * domain is not necessarily a row in that table, so the env override is the
 * primary path for it.
 */
export function monitoredDomainsFromEnv(): string[] {
  const envDomain = process.env["GOOGLE_POSTMASTER_DOMAIN"]?.trim();
  return envDomain ? [envDomain] : [];
}
