/**
 * Database seed script — creates a default account, user, and API key
 * for local development. Run with: bun run scripts/seed.ts
 */
import { randomUUID, createHash } from "node:crypto";
import postgres from "postgres";

const DATABASE_URL =
  process.env["DATABASE_URL"] ?? "postgres://alecrae:dev_password@localhost:5432/alecrae";

const sql = postgres(DATABASE_URL);

async function seed() {
  console.warn("Seeding database...");

  const accountId = randomUUID();
  const userId = randomUUID();
  const apiKeyId = randomUUID();

  // Generate a development API key
  const rawApiKey = `em_live_dev_${randomUUID().replace(/-/g, "")}`;
  const keyPrefix = rawApiKey.slice(0, 16);
  const keyHash = createHash("sha256").update(rawApiKey).digest("hex");

  // 1. Create account
  await sql`
    INSERT INTO accounts (id, name, plan_tier, billing_email, emails_sent_this_period)
    VALUES (${accountId}, 'Development Account', 'professional', 'dev@localhost', 0)
    ON CONFLICT (id) DO NOTHING
  `;

  // 2. Create user
  await sql`
    INSERT INTO users (id, account_id, email, name, role, email_verified, permissions)
    VALUES (
      ${userId},
      ${accountId},
      'admin@localhost',
      'Dev Admin',
      'owner',
      true,
      ${JSON.stringify({
        sendEmail: true,
        readEmail: true,
        manageDomains: true,
        manageApiKeys: true,
        manageWebhooks: true,
        viewAnalytics: true,
        manageAccount: true,
        manageTeamMembers: true,
      })}
    )
    ON CONFLICT (id) DO NOTHING
  `;

  // 3. Create API key
  await sql`
    INSERT INTO api_keys (id, account_id, name, key_prefix, key_hash, permissions, environment, is_active)
    VALUES (
      ${apiKeyId},
      ${accountId},
      'Development Key',
      ${keyPrefix},
      ${keyHash},
      ${JSON.stringify({
        sendEmail: true,
        readEmail: true,
        manageDomains: true,
        manageApiKeys: true,
        manageWebhooks: true,
        viewAnalytics: true,
        manageAccount: true,
        manageTeamMembers: true,
      })},
      'live',
      true
    )
    ON CONFLICT (id) DO NOTHING
  `;

  console.warn("Seed complete!");
  console.warn("");
  console.warn("Development API Key (save this — it cannot be retrieved later):");
  console.warn(`  ${rawApiKey}`);
  console.warn("");
  console.warn("Account ID: ", accountId);
  console.warn("User ID:    ", userId);
  console.warn("API Key ID: ", apiKeyId);

  await sql.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
