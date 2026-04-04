/**
 * Example: Manage contacts using the Emailed SDK.
 *
 * Demonstrates:
 * - Creating/upserting contacts
 * - Listing and filtering contacts
 * - Updating contact metadata and tags
 * - Unsubscribing contacts
 * - Removing contacts
 *
 * Run:
 *   EMAILED_API_KEY=em_live_... npx tsx examples/contacts-management.ts
 */
import { Emailed, ApiError } from "@emailed/sdk";

const client = new Emailed({ apiKey: process.env.EMAILED_API_KEY! });

async function main() {
  // ── Create contacts ─────────────────────────────────────────────────────

  console.log("\nCreating contacts...");

  const { data: alice } = await client.contacts.upsert({
    email: "alice@example.com",
    name: "Alice Johnson",
    tags: ["customer", "premium"],
    metadata: { plan: "pro", signupDate: "2026-01-15" },
    subscribed: true,
  });
  console.log(`  Created: ${alice.email} (${alice.id})`);

  const { data: bob } = await client.contacts.upsert({
    email: "bob@example.com",
    name: "Bob Smith",
    tags: ["customer", "trial"],
    metadata: { plan: "free" },
    subscribed: true,
  });
  console.log(`  Created: ${bob.email} (${bob.id})`);

  // ── List all contacts ───────────────────────────────────────────────────

  console.log("\nAll contacts:");
  const { data: all } = await client.contacts.list({ pageSize: 50 });
  console.log(`  Total: ${all.total}`);
  for (const c of all.data) {
    const tags = c.tags.length > 0 ? ` [${c.tags.join(", ")}]` : "";
    console.log(`  - ${c.email} (${c.name ?? "no name"})${tags}`);
  }

  // ── Filter by tag ──────────────────────────────────────────────────────

  console.log("\nPremium contacts:");
  const { data: premium } = await client.contacts.list({
    tag: "premium",
    subscribed: true,
  });
  for (const c of premium.data) {
    console.log(`  - ${c.email}`);
  }

  // ── Search contacts ────────────────────────────────────────────────────

  console.log("\nSearch for 'alice':");
  const { data: search } = await client.contacts.list({ query: "alice" });
  for (const c of search.data) {
    console.log(`  - ${c.email} (${c.name ?? "no name"})`);
  }

  // ── Update a contact ───────────────────────────────────────────────────

  console.log("\nUpgrading Bob to premium...");
  const { data: updated } = await client.contacts.update(bob.id, {
    tags: ["customer", "premium"],
    metadata: { plan: "pro" },
  });
  console.log(`  Tags: ${updated.tags.join(", ")}`);

  // ── Retrieve a single contact ──────────────────────────────────────────

  console.log("\nFetching Alice by ID...");
  const { data: fetched } = await client.contacts.get(alice.id);
  console.log(`  ${fetched.email} — subscribed: ${fetched.subscribed}`);

  // ── Unsubscribe a contact ──────────────────────────────────────────────

  console.log("\nUnsubscribing Bob...");
  const { data: unsub } = await client.contacts.unsubscribe(bob.id);
  console.log(`  ${unsub.email} — subscribed: ${unsub.subscribed}`);

  // ── Remove a contact ───────────────────────────────────────────────────

  console.log("\nRemoving Bob...");
  await client.contacts.remove(bob.id);
  console.log("  Done.");

  console.log("\nFinished contact management demo.");
}

main().catch((err) => {
  if (err instanceof ApiError) {
    console.error(`API Error [${err.status}]: ${err.message} (${err.code})`);
    if (err.requestId) {
      console.error(`Request ID: ${err.requestId}`);
    }
  } else {
    console.error("Unexpected error:", err);
  }
  process.exit(1);
});
