/**
 * Database seed script — populates development data.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." bun run packages/db/src/seed.ts
 *
 * Creates:
 *   - A test account
 *   - A test user (owner)
 *   - A test domain (verified)
 *   - A test API key (all permissions)
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import crypto from "node:crypto";

import { accounts } from "./schema/users.js";
import { users } from "./schema/users.js";
import { domains } from "./schema/domains.js";
import { apiKeys } from "./schema/api-keys.js";

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

async function main() {
  const connectionString = process.env["DATABASE_URL"];

  if (!connectionString) {
    console.error("ERROR: DATABASE_URL environment variable is required.");
    process.exit(1);
  }

  const isNeon = connectionString.includes(".neon.tech");
  const sslConfig = isNeon || connectionString.includes("sslmode=require");

  const client = postgres(connectionString, {
    max: 1,
    prepare: false,
    ...(sslConfig ? { ssl: "require" as const } : {}),
  });

  const db = drizzle(client);

  console.log("Seeding database...\n");

  // ── Account ─────────────────────────────────────────────────────────────
  const accountId = generateId();
  await db
    .insert(accounts)
    .values({
      id: accountId,
      name: "Test Organization",
      planTier: "professional",
      billingEmail: "billing@test.alecrae.dev",
    })
    .onConflictDoNothing();
  console.log(`  Account: ${accountId}  (Test Organization)`);

  // ── User ────────────────────────────────────────────────────────────────
  const userId = generateId();
  // Password: "password123" — bcrypt hash (NOT for production use)
  const passwordHash =
    "$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36PqSy3QHe1gYKhyHPqa1F6";
  await db
    .insert(users)
    .values({
      id: userId,
      accountId,
      email: "admin@test.alecrae.dev",
      name: "Test Admin",
      passwordHash,
      role: "owner",
      permissions: {
        sendEmail: true,
        readEmail: true,
        manageDomains: true,
        manageApiKeys: true,
        manageWebhooks: true,
        viewAnalytics: true,
        manageAccount: true,
        manageTeamMembers: true,
      },
      emailVerified: true,
    })
    .onConflictDoNothing();
  console.log(`  User:    ${userId}  (admin@test.alecrae.dev / password123)`);

  // ── Domain ──────────────────────────────────────────────────────────────
  const domainId = generateId();
  await db
    .insert(domains)
    .values({
      id: domainId,
      accountId,
      domain: "test.alecrae.dev",
      verificationStatus: "verified",
      verifiedAt: new Date(),
      spfVerified: true,
      spfRecord: "v=spf1 include:_spf.alecrae.dev ~all",
      dkimVerified: true,
      dkimSelector: "default",
      dkimPublicKey: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...(placeholder)",
      dkimPrivateKey: "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC...(placeholder)",
      dmarcVerified: true,
      dmarcPolicy: "reject",
      dmarcRecord: "v=DMARC1; p=reject; rua=mailto:dmarc@test.alecrae.dev",
      returnPathVerified: true,
      returnPathDomain: "bounce.test.alecrae.dev",
      isActive: true,
      isDefault: true,
    })
    .onConflictDoNothing();
  console.log(`  Domain:  ${domainId}  (test.alecrae.dev — verified)`);

  // ── API Key ─────────────────────────────────────────────────────────────
  const apiKeyId = generateId();
  const rawKey = `em_live_${crypto.randomBytes(24).toString("hex")}`;
  const keyPrefix = rawKey.slice(0, 14) + "...";
  const keyHash = hashApiKey(rawKey);

  await db
    .insert(apiKeys)
    .values({
      id: apiKeyId,
      accountId,
      name: "Development Key",
      keyPrefix,
      keyHash,
      permissions: {
        sendEmail: true,
        readEmail: true,
        manageDomains: true,
        manageApiKeys: true,
        manageWebhooks: true,
        viewAnalytics: true,
        manageAccount: true,
        manageTeamMembers: true,
      },
      allowedDomains: [],
      environment: "live",
      isActive: true,
    })
    .onConflictDoNothing();
  console.log(`  API Key: ${apiKeyId}  (${keyPrefix})`);
  console.log(`\n  ** Full API Key (save this — shown only once): ${rawKey}\n`);

  // ── Done ────────────────────────────────────────────────────────────────
  await client.end();
  console.log("Seed completed successfully.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
