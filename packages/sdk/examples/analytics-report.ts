/**
 * Example: Fetch delivery and engagement analytics with the Emailed SDK.
 *
 * Demonstrates:
 * - Aggregate delivery metrics
 * - Engagement metrics (opens, clicks)
 * - Time-series data with configurable granularity
 * - Bounce breakdown by category
 * - Filtering by domain and tag
 *
 * Run:
 *   EMAILED_API_KEY=em_live_... npx tsx examples/analytics-report.ts
 */
import { Emailed, ApiError } from "@emailed/sdk";

const client = new Emailed({ apiKey: process.env.EMAILED_API_KEY! });

async function main() {
  // Use the last 30 days as the default range
  const endDate = new Date().toISOString().split("T")[0]!;
  const startDate = new Date(Date.now() - 30 * 86_400_000).toISOString().split("T")[0]!;

  const range = { startDate, endDate };

  console.log(`\nAnalytics report for ${startDate} to ${endDate}`);
  console.log("=".repeat(60));

  // ── Delivery metrics ────────────────────────────────────────────────────

  console.log("\n-- Delivery Metrics --");
  const { data: delivery } = await client.analytics.delivery(range);

  console.log(`  Sent:       ${delivery.sent}`);
  console.log(`  Delivered:  ${delivery.delivered} (${(delivery.deliveryRate * 100).toFixed(1)}%)`);
  console.log(`  Bounced:    ${delivery.bounced} (${(delivery.bounceRate * 100).toFixed(1)}%)`);
  console.log(`  Deferred:   ${delivery.deferred}`);
  console.log(`  Dropped:    ${delivery.dropped}`);
  console.log(`  Complaints: ${delivery.complained}`);

  // ── Engagement metrics ──────────────────────────────────────────────────

  console.log("\n-- Engagement Metrics --");
  const { data: engagement } = await client.analytics.engagement(range);

  console.log(`  Opens:         ${engagement.opens} (${(engagement.openRate * 100).toFixed(1)}%)`);
  console.log(`  Unique opens:  ${engagement.uniqueOpens}`);
  console.log(`  Clicks:        ${engagement.clicks} (${(engagement.clickRate * 100).toFixed(1)}%)`);
  console.log(`  Unique clicks: ${engagement.uniqueClicks}`);

  // ── Daily delivery volume ───────────────────────────────────────────────

  console.log("\n-- Daily Delivery Volume --");
  const { data: series } = await client.analytics.deliveryTimeSeries({
    ...range,
    granularity: "day",
  });

  for (const point of series) {
    const date = point.timestamp.split("T")[0];
    const bar = "#".repeat(Math.min(Math.round(point.value / 10), 50));
    console.log(`  ${date}  ${bar} ${point.value}`);
  }

  // ── Bounce breakdown ────────────────────────────────────────────────────

  console.log("\n-- Bounce Breakdown --");
  const { data: bounces } = await client.analytics.bounceBreakdown(range);

  for (const [category, count] of Object.entries(bounces)) {
    console.log(`  ${category}: ${count}`);
  }

  // ── Filtered by tag ─────────────────────────────────────────────────────

  console.log("\n-- Transactional Email Delivery (tag: transactional) --");
  const { data: filtered } = await client.analytics.delivery({
    ...range,
    tag: "transactional",
  });

  console.log(`  Sent: ${filtered.sent}, Delivered: ${filtered.delivered}`);

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
