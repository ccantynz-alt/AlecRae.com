/**
 * Google Sign-In (OpenID Connect identity) — separate from Gmail account linking.
 *
 * This is "Sign in with AlecRae using your Google identity". It is NOT the Gmail
 * mailbox connection (see sync/engine.ts + routes/connect.ts), which requests the
 * full gmail.* scopes so AlecRae can read/send a user's mail. Here we request only
 * the OpenID Connect identity scopes (openid, email, profile) — enough to know who
 * the person is, nothing more. The two flows use DIFFERENT redirect URIs so they
 * can be registered independently in the Google Cloud console.
 *
 *   Sign-in redirect URI:  GOOGLE_AUTH_REDIRECT_URI
 *                          (default https://api.alecrae.com/v1/auth/callback/google)
 *   Gmail-connect URI:     GOOGLE_REDIRECT_URI
 *                          (https://api.alecrae.com/v1/connect/callback/gmail)
 */

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

const GOOGLE_CLIENT_ID = process.env["GOOGLE_CLIENT_ID"] ?? "";
const GOOGLE_CLIENT_SECRET = process.env["GOOGLE_CLIENT_SECRET"] ?? "";
const GOOGLE_AUTH_REDIRECT_URI =
  process.env["GOOGLE_AUTH_REDIRECT_URI"] ?? "https://api.alecrae.com/v1/auth/callback/google";

/** True when the Google sign-in OAuth client is configured. Lets routes fail clean. */
export function isGoogleSignInConfigured(): boolean {
  return GOOGLE_CLIENT_ID.length > 0 && GOOGLE_CLIENT_SECRET.length > 0;
}

/** Build the Google authorization URL for the identity-only sign-in flow. */
export function getGoogleSignInUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_AUTH_REDIRECT_URI,
    response_type: "code",
    scope: ["openid", "email", "profile"].join(" "),
    state,
    // No offline access / refresh token: we only need a one-time identity assertion.
    access_type: "online",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export interface GoogleSignInProfile {
  email: string;
  name: string;
  picture: string | null;
  emailVerified: boolean;
}

/** Exchange the authorization code for the user's verified Google identity. */
export async function exchangeGoogleSignInCode(code: string): Promise<GoogleSignInProfile> {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_AUTH_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  const tokens = (await tokenRes.json()) as { access_token: string };

  const profileRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) {
    const err = await profileRes.text();
    throw new Error(`Google userinfo fetch failed: ${err}`);
  }

  const profile = (await profileRes.json()) as {
    email?: string;
    name?: string;
    picture?: string;
    verified_email?: boolean;
  };

  if (!profile.email) {
    throw new Error("Google profile did not include an email address");
  }

  return {
    email: profile.email.toLowerCase(),
    name: profile.name ?? profile.email.split("@")[0] ?? "AlecRae User",
    picture: profile.picture ?? null,
    emailVerified: profile.verified_email ?? true,
  };
}
