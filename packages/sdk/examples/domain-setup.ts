/**
 * Example: Register a sending domain and walk through DNS verification.
 *
 * This script demonstrates the full domain setup flow:
 * 1. Register the domain with the AlecRae platform
 * 2. Retrieve the required DNS records
 * 3. Trigger verification
 * 4. Check domain health
 *
 * Run:
 *   EMAILED_API_KEY=em_live_... npx tsx examples/domain-setup.ts example.com
 */
import { AlecRae, ApiError } from "@alecrae/sdk";

const client = new AlecRae({ apiKey: process.env.EMAILED_API_KEY! });

async function main() {
  const domainName = process.argv[2];
  if (!domainName) {
    console.error("Usage: npx tsx examples/domain-setup.ts <domain>");
    process.exit(1);
  }

  // ── Step 1: Register the domain ──────────────────────────────────────────

  console.log(`\nRegistering domain: ${domainName}...`);

  let domainId: string;
  try {
    const created = await client.domains.add({ name: domainName });
    domainId = created.data.id;
    console.log(`Domain registered with ID: ${domainId}`);
    console.log(`Status: ${created.data.status}`);
  } catch (err) {
    if (err instanceof ApiError && err.code === "domain_exists") {
      console.log("Domain already registered. Fetching existing domains...");
      const list = await client.domains.list();
      const existing = list.data.data.find(
        (d) => d.name === domainName,
      );
      if (!existing) {
        console.error("Domain exists but not in your account.");
        process.exit(1);
      }
      domainId = existing.id;
      console.log(`Found existing domain: ${domainId}`);
    } else {
      throw err;
    }
  }

  // ── Step 2: Retrieve required DNS records ────────────────────────────────

  console.log("\nRequired DNS records:");
  console.log("─".repeat(70));

  const dns = await client.domains.getDns(domainId);

  for (const record of dns.data.records) {
    const verified = record.verified ? "[VERIFIED]" : "[PENDING]";
    console.log(`  ${verified} ${record.type} ${record.name}`);
    console.log(`           Value: ${record.value}`);
    console.log(`           TTL:   ${record.ttl}`);
    if (record.priority !== undefined) {
      console.log(`           Priority: ${record.priority}`);
    }
    console.log();
  }

  console.log("Add the records above to your DNS provider, then continue.\n");

  // ── Step 3: Trigger verification ─────────────────────────────────────────

  console.log("Triggering DNS verification...");

  const verification = await client.domains.verify(domainId);
  console.log(`Verification result: ${verification.data.status}`);

  // ── Step 4: Check domain health ──────────────────────────────────────────

  console.log("\nDomain health report:");
  console.log("─".repeat(70));

  const health = await client.domains.getHealth(domainId);
  const h = health.data;

  console.log(`  Score:              ${h.score}/100`);
  console.log(`  DKIM key age:       ${h.dkimKeyAge} days`);
  console.log(`  DKIM rotation:      ${h.dkimRotationNeeded ? "NEEDED" : "OK"}`);
  console.log(`  SPF lookups:        ${h.spfLookupCount}/10${h.spfTooManyLookups ? " (TOO MANY)" : ""}`);

  if (h.recommendations.length > 0) {
    console.log("\n  Recommendations:");
    for (const rec of h.recommendations) {
      console.log(`    - ${rec}`);
    }
  }

  // ── Step 5: List all domains ─────────────────────────────────────────────

  console.log("\nAll domains on this account:");
  const all = await client.domains.list();
  for (const d of all.data.data) {
    console.log(`  ${d.name} — ${d.status} (created ${d.createdAt})`);
  }

  console.log("\nDone.");
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
