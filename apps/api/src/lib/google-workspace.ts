/**
 * Google Workspace (Admin SDK) client — domain-wide user enumeration for
 * migrating a whole company onto AlecRae.
 *
 * This is distinct from:
 *   - google-auth.ts  (Sign in with Google — identity only)
 *   - connect.ts/gmail (connect ONE external Gmail mailbox over OAuth)
 *
 * Here a Workspace ADMIN authorizes with the Directory read scope so we can list
 * every user on their domain, then bulk-provision matching native AlecRae
 * mailboxes. Mail migration (per user) reuses the existing import pipeline.
 *
 * Scopes requested:
 *   - openid, email, profile           (who is the admin)
 *   - admin.directory.user.readonly    (list domain users — Admin SDK)
 *   - gmail.readonly                   (later: migrate each user's mail)
 */

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const DIRECTORY_USERS_URL =
  "https://admin.googleapis.com/admin/directory/v1/users";

const CLIENT_ID = process.env["GOOGLE_CLIENT_ID"] ?? "";
const CLIENT_SECRET = process.env["GOOGLE_CLIENT_SECRET"] ?? "";
const REDIRECT_URI =
  process.env["GOOGLE_WORKSPACE_REDIRECT_URI"] ??
  "https://api.alecrae.com/v1/import/workspace/callback";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export function isWorkspaceImportConfigured(): boolean {
  return CLIENT_ID.length > 0 && CLIENT_SECRET.length > 0;
}

/** Build the consent URL for a Workspace admin (offline access for refresh). */
export function getWorkspaceAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_BASE}?${params.toString()}`;
}

export interface WorkspaceAdminTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
  adminEmail: string;
  /** The admin's primary domain, derived from their email. */
  domain: string;
}

/** Exchange the OAuth code for tokens + identify the admin (and their domain). */
export async function exchangeWorkspaceCode(
  code: string,
): Promise<WorkspaceAdminTokens> {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(
      `[google-workspace] token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`,
    );
  }

  const token = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const infoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!infoRes.ok) {
    throw new Error(
      `[google-workspace] userinfo failed: ${infoRes.status} ${await infoRes.text()}`,
    );
  }
  const info = (await infoRes.json()) as { email: string };
  const adminEmail = info.email.toLowerCase();
  const domain = adminEmail.slice(adminEmail.indexOf("@") + 1);

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresInSeconds: token.expires_in,
    adminEmail,
    domain,
  };
}

export interface WorkspaceUser {
  primaryEmail: string;
  fullName: string | null;
  suspended: boolean;
  isAdmin: boolean;
}

/**
 * List all users on a Workspace domain via the Admin SDK Directory API.
 * Paginates through all pages (maxResults 500/page).
 */
export async function listWorkspaceUsers(
  accessToken: string,
  domain: string,
): Promise<WorkspaceUser[]> {
  const users: WorkspaceUser[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      domain,
      maxResults: "500",
      orderBy: "email",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${DIRECTORY_USERS_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(
        `[google-workspace] directory users.list failed: ${res.status} ${await res.text()}`,
      );
    }
    const body = (await res.json()) as {
      users?: {
        primaryEmail: string;
        name?: { fullName?: string };
        suspended?: boolean;
        isAdmin?: boolean;
      }[];
      nextPageToken?: string;
    };

    for (const u of body.users ?? []) {
      users.push({
        primaryEmail: u.primaryEmail.toLowerCase(),
        fullName: u.name?.fullName ?? null,
        suspended: u.suspended ?? false,
        isAdmin: u.isAdmin ?? false,
      });
    }
    pageToken = body.nextPageToken;
  } while (pageToken);

  return users;
}
