/**
 * E2E fixture seeder — creates the minimum rows the e2e suite
 * (apps/api/tests/e2e) needs to authenticate against a real API.
 *
 * Usage (Bun only — uses Bun.password for Argon2id hashing):
 *   DATABASE_URL=postgresql://... bun run apps/api/scripts/seed-e2e.ts
 *
 * What it seeds, and why:
 *
 *   1. An account (workspace) — every route scopes queries by
 *      auth.accountId, and the api_keys/users rows FK onto it.
 *      planTier "starter" so usage enforcement has real limits
 *      (10k emails/month — far above what the suite sends).
 *
 *   2. An API key whose presented value is EXACTLY the helpers.ts default
 *      (em_test_e2e_key_1234567890abcdef, overridable via E2E_API_KEY).
 *      The auth middleware looks keys up by SHA-256 hex hash of the raw
 *      value (see hashKey in apps/api/src/middleware/auth.ts), so we store
 *      sha256(raw). All eight permission flags are granted — they map to the
 *      scopes the suites need: messages:send/read (messages, suppressions,
 *      billing usage/plan), domains:manage (domains), webhooks:manage
 *      (webhooks), account:manage (billing checkout/portal).
 *
 *   3. A user with a known password + workspace membership — the templates
 *      routes require templates:read/write, scopes an API key structurally
 *      cannot carry (permissionsToScopes maps only the eight flags). The
 *      templates suite therefore logs in via POST /v1/auth/login as this
 *      user and sends a session bearer token; sessions carry templates:*
 *      in their baseline scopes (scopesForRole in src/lib/jwt.ts).
 *
 * Idempotent: every insert is an upsert keyed on a deterministic id or the
 * relevant unique index, so re-running against the same database is safe.
 */

import {
  getDatabase,
  closeConnection,
  accounts,
  users,
  workspaceMembers,
  apiKeys,
} from "@alecrae/db";

// ─── Fixture constants ───────────────────────────────────────────────────────

const E2E_ACCOUNT_ID = "acct_e2e_fixture";
const E2E_USER_ID = "user_e2e_fixture";
const E2E_MEMBERSHIP_ID = "wsm_e2e_fixture";
const E2E_API_KEY_ID = "key_e2e_fixture";

/** Must match TEST_API_KEY in apps/api/tests/e2e/helpers.ts. */
const RAW_API_KEY =
  process.env["E2E_API_KEY"] ?? "em_test_e2e_key_1234567890abcdef";

/** Must match E2E_USER_EMAIL / E2E_USER_PASSWORD in helpers.ts. */
const USER_EMAIL =
  process.env["E2E_USER_EMAIL"] ?? "e2e-user@e2e-test.example.com";
const USER_PASSWORD =
  process.env["E2E_USER_PASSWORD"] ?? "e2e-test-password-1234";

/** All eight flags — mirrors the api_keys.permissions column shape. */
const ALL_PERMISSIONS = {
  sendEmail: true,
  readEmail: true,
  manageDomains: true,
  manageApiKeys: true,
  manageWebhooks: true,
  viewAnalytics: true,
  manageAccount: true,
  manageTeamMembers: true,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Same hashing scheme as hashKey() in src/middleware/auth.ts. */
async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env["DATABASE_URL"]) {
    console.error(
      "[seed-e2e] DATABASE_URL is required. " +
        "Point it at the database the API under test will use.",
    );
    process.exit(1);
  }

  const db = getDatabase();

  // 1. Account (workspace)
  await db
    .insert(accounts)
    .values({
      id: E2E_ACCOUNT_ID,
      name: "E2E Test Account",
      planTier: "starter",
      billingEmail: USER_EMAIL,
      emailsSentThisPeriod: 0,
      status: "active",
    })
    .onConflictDoUpdate({
      target: accounts.id,
      set: {
        planTier: "starter",
        status: "active",
        updatedAt: new Date(),
      },
    });
  console.log(`[seed-e2e] account ready: ${E2E_ACCOUNT_ID} (starter)`);

  // 2. API key — stored as sha256(raw), exactly how the auth middleware
  //    looks it up. Upserting on the key_hash unique index re-activates a
  //    previously revoked/expired fixture key on re-run.
  const keyHash = await sha256Hex(RAW_API_KEY);
  await db
    .insert(apiKeys)
    .values({
      id: E2E_API_KEY_ID,
      accountId: E2E_ACCOUNT_ID,
      name: "E2E Test Key",
      keyPrefix: RAW_API_KEY.slice(0, 11),
      keyHash,
      permissions: ALL_PERMISSIONS,
      environment: "test",
      isActive: true,
    })
    .onConflictDoUpdate({
      target: apiKeys.keyHash,
      set: {
        accountId: E2E_ACCOUNT_ID,
        permissions: ALL_PERMISSIONS,
        isActive: true,
        revokedAt: null,
        expiresAt: null,
      },
    });
  console.log(
    `[seed-e2e] api key ready: ${RAW_API_KEY.slice(0, 11)}… (all permissions)`,
  );

  // 3. User + workspace membership — for the session-token (templates) suite.
  //    Argon2id via Bun.password, matching hashPassword() in routes/auth.ts.
  const passwordHash = await Bun.password.hash(USER_PASSWORD, {
    algorithm: "argon2id",
    memoryCost: 19456,
    timeCost: 2,
  });

  await db
    .insert(users)
    .values({
      id: E2E_USER_ID,
      accountId: E2E_ACCOUNT_ID,
      email: USER_EMAIL.toLowerCase(),
      name: "E2E Test User",
      passwordHash,
      role: "owner",
      permissions: ALL_PERMISSIONS,
      emailVerified: true,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        accountId: E2E_ACCOUNT_ID,
        email: USER_EMAIL.toLowerCase(),
        passwordHash,
        role: "owner",
        permissions: ALL_PERMISSIONS,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(workspaceMembers)
    .values({
      id: E2E_MEMBERSHIP_ID,
      userId: E2E_USER_ID,
      accountId: E2E_ACCOUNT_ID,
      role: "owner",
      permissions: ALL_PERMISSIONS,
    })
    .onConflictDoUpdate({
      // Unique index is (user_id, account_id) — see schema/workspace-members.ts.
      target: [workspaceMembers.userId, workspaceMembers.accountId],
      set: {
        role: "owner",
        permissions: ALL_PERMISSIONS,
        updatedAt: new Date(),
      },
    });
  console.log(`[seed-e2e] user ready: ${USER_EMAIL} (owner)`);

  console.log("[seed-e2e] Done. The e2e suite can now authenticate.");
}

main()
  .then(async () => {
    await closeConnection();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[seed-e2e] Seeding failed:", err);
    await closeConnection().catch(() => {
      /* best effort */
    });
    process.exit(1);
  });
