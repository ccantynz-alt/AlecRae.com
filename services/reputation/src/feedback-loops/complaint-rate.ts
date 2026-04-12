/**
 * @emailed/reputation — Complaint Rate Monitor
 *
 * Queries the events table to calculate complaint rates for a domain
 * over a configurable time window. Used by the reputation health check
 * and the FBL endpoint to determine whether auto-throttling is needed.
 */

import { eq, and, gte, sql } from "drizzle-orm";
import { getDatabase, events } from "@emailed/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComplaintRateResult {
  complaints: number;
  delivered: number;
  rate: number;
  threshold: number;
  isHealthy: boolean;
}

// ---------------------------------------------------------------------------
// Complaint Rate Query
// ---------------------------------------------------------------------------

/**
 * Calculate the complaint rate for a domain over a sliding window.
 *
 * Queries the `events` table for `email.complained` and `email.delivered`
 * events where metadata contains the given domainId.
 *
 * @param domainId  - The domain ID to check
 * @param windowDays - Number of days to look back (default: 7)
 * @returns ComplaintRateResult with rate, threshold, and health status
 */
export async function getComplaintRate(
  domainId: string,
  windowDays = 7,
): Promise<ComplaintRateResult> {
  const db = getDatabase();
  const threshold = 0.001; // 0.1%
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [complaintRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(events)
    .where(
      and(
        eq(events.type, "email.complained"),
        gte(events.timestamp, windowStart),
        sql`${events.metadata}->>'domainId' = ${domainId}`,
      ),
    );

  const [deliveredRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(events)
    .where(
      and(
        eq(events.type, "email.delivered"),
        gte(events.timestamp, windowStart),
        sql`${events.metadata}->>'domainId' = ${domainId}`,
      ),
    );

  const complaints = complaintRow?.count ?? 0;
  const delivered = deliveredRow?.count ?? 0;
  const rate = delivered > 0 ? complaints / delivered : 0;

  return {
    complaints,
    delivered,
    rate,
    threshold,
    isHealthy: rate < threshold,
  };
}
