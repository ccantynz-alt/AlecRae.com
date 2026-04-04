/**
 * Admin Routes — Cross-Account Platform Administration
 *
 * These endpoints power the admin dashboard with aggregated data across
 * all accounts. They require an admin-level API key or Bearer token.
 *
 * GET /v1/admin/stats    — Aggregate email counts by status
 * GET /v1/admin/events   — Recent events across all accounts
 * GET /v1/admin/domains  — All domains with status
 * GET /v1/admin/messages — Recent messages across all accounts
 * GET /v1/admin/users    — All users with account info
 * GET /v1/admin/health   — Service health check
 */

import { Hono } from "hono";
import { desc, sql, count, eq, gte } from "drizzle-orm";
import {
  getDatabase,
  emails,
  events,
  domains as domainsTable,
  accounts,
  users,
  dnsRecords,
} from "@emailed/db";

const admin = new Hono();

// ─── GET /v1/admin/stats — Aggregated email stats ─────────────────────────

admin.get("/stats", async (c) => {
  const db = getDatabase();

  // Count emails by status (all accounts)
  const statusCounts = await db
    .select({
      status: emails.status,
      count: count(),
    })
    .from(emails)
    .groupBy(emails.status);

  const counts: Record<string, number> = {};
  for (const row of statusCounts) {
    counts[row.status] = row.count;
  }

  const sent =
    (counts["sent"] ?? 0) +
    (counts["delivered"] ?? 0) +
    (counts["bounced"] ?? 0) +
    (counts["complained"] ?? 0);
  const delivered = counts["delivered"] ?? 0;
  const bounced = counts["bounced"] ?? 0;
  const complained = counts["complained"] ?? 0;
  const queued = counts["queued"] ?? 0;
  const failed = counts["failed"] ?? 0;
  const deferred = counts["deferred"] ?? 0;

  // Count engagement events
  const engagementCounts = await db
    .select({
      type: events.type,
      count: count(),
    })
    .from(events)
    .where(sql`${events.type} IN ('email.opened', 'email.clicked')`)
    .groupBy(events.type);

  const engagementMap: Record<string, number> = {};
  for (const row of engagementCounts) {
    engagementMap[row.type] = row.count;
  }

  const opened = engagementMap["email.opened"] ?? 0;
  const clicked = engagementMap["email.clicked"] ?? 0;

  // Count total accounts, domains, users
  const [accountCount] = await db
    .select({ count: count() })
    .from(accounts);
  const [domainCount] = await db
    .select({ count: count() })
    .from(domainsTable);
  const [userCount] = await db.select({ count: count() }).from(users);

  // 24h stats
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentStatusCounts = await db
    .select({
      status: emails.status,
      count: count(),
    })
    .from(emails)
    .where(gte(emails.createdAt, oneDayAgo))
    .groupBy(emails.status);

  const recent: Record<string, number> = {};
  for (const row of recentStatusCounts) {
    recent[row.status] = row.count;
  }

  const recentSent =
    (recent["sent"] ?? 0) +
    (recent["delivered"] ?? 0) +
    (recent["bounced"] ?? 0) +
    (recent["complained"] ?? 0);
  const recentDelivered = recent["delivered"] ?? 0;
  const recentBounced = recent["bounced"] ?? 0;

  return c.json({
    data: {
      totals: {
        sent,
        delivered,
        bounced,
        complained,
        queued,
        failed,
        deferred,
        opened,
        clicked,
        deliveryRate: sent > 0 ? delivered / sent : 0,
        bounceRate: sent > 0 ? bounced / sent : 0,
        openRate: delivered > 0 ? opened / delivered : 0,
        clickRate: delivered > 0 ? clicked / delivered : 0,
      },
      last24h: {
        sent: recentSent,
        delivered: recentDelivered,
        bounced: recentBounced,
        queued: recent["queued"] ?? 0,
        failed: recent["failed"] ?? 0,
        deferred: recent["deferred"] ?? 0,
      },
      platform: {
        totalAccounts: accountCount?.count ?? 0,
        totalDomains: domainCount?.count ?? 0,
        totalUsers: userCount?.count ?? 0,
      },
    },
  });
});

// ─── GET /v1/admin/events — Recent events across all accounts ─────────────

admin.get("/events", async (c) => {
  const db = getDatabase();
  const limitParam = c.req.query("limit");
  const typeParam = c.req.query("type");
  const limit = Math.min(parseInt(limitParam ?? "50", 10), 200);

  const conditions = [];
  if (typeParam) {
    conditions.push(eq(events.type, typeParam as typeof events.type.enumValues[number]));
  }

  const rows = await db
    .select({
      id: events.id,
      accountId: events.accountId,
      emailId: events.emailId,
      messageId: events.messageId,
      type: events.type,
      recipient: events.recipient,
      timestamp: events.timestamp,
      bounceType: events.bounceType,
      bounceCategory: events.bounceCategory,
      diagnosticCode: events.diagnosticCode,
      remoteMta: events.remoteMta,
      url: events.url,
      userAgent: events.userAgent,
      ipAddress: events.ipAddress,
      smtpResponse: events.smtpResponse,
      mxHost: events.mxHost,
      tags: events.tags,
    })
    .from(events)
    .where(conditions.length > 0 ? conditions[0] : undefined)
    .orderBy(desc(events.timestamp))
    .limit(limit);

  const data = rows.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    emailId: r.emailId,
    messageId: r.messageId,
    type: r.type,
    recipient: r.recipient,
    timestamp: r.timestamp.toISOString(),
    bounceType: r.bounceType,
    bounceCategory: r.bounceCategory,
    diagnosticCode: r.diagnosticCode,
    remoteMta: r.remoteMta,
    url: r.url,
    userAgent: r.userAgent,
    ipAddress: r.ipAddress,
    smtpResponse: r.smtpResponse,
    mxHost: r.mxHost,
    tags: r.tags,
  }));

  return c.json({ data });
});

// ─── GET /v1/admin/domains — All domains with status ──────────────────────

admin.get("/domains", async (c) => {
  const db = getDatabase();

  const domainRows = await db
    .select({
      id: domainsTable.id,
      accountId: domainsTable.accountId,
      domain: domainsTable.domain,
      verificationStatus: domainsTable.verificationStatus,
      spfVerified: domainsTable.spfVerified,
      dkimVerified: domainsTable.dkimVerified,
      dmarcVerified: domainsTable.dmarcVerified,
      returnPathVerified: domainsTable.returnPathVerified,
      isActive: domainsTable.isActive,
      isDefault: domainsTable.isDefault,
      createdAt: domainsTable.createdAt,
      verifiedAt: domainsTable.verifiedAt,
    })
    .from(domainsTable)
    .orderBy(desc(domainsTable.createdAt));

  // Count emails per domain (last 24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const emailCountsByDomain = await db
    .select({
      domainId: emails.domainId,
      count: count(),
    })
    .from(emails)
    .where(gte(emails.createdAt, oneDayAgo))
    .groupBy(emails.domainId);

  const emailCountMap = new Map<string, number>();
  for (const row of emailCountsByDomain) {
    if (row.domainId) {
      emailCountMap.set(row.domainId, row.count);
    }
  }

  const data = domainRows.map((d) => ({
    id: d.id,
    accountId: d.accountId,
    domain: d.domain,
    status: d.verificationStatus,
    spfVerified: d.spfVerified,
    dkimVerified: d.dkimVerified,
    dmarcVerified: d.dmarcVerified,
    returnPathVerified: d.returnPathVerified,
    isActive: d.isActive,
    isDefault: d.isDefault,
    messagesSent24h: emailCountMap.get(d.id) ?? 0,
    createdAt: d.createdAt.toISOString(),
    verifiedAt: d.verifiedAt?.toISOString() ?? null,
  }));

  return c.json({ data });
});

// ─── GET /v1/admin/messages — Recent messages across all accounts ─────────

admin.get("/messages", async (c) => {
  const db = getDatabase();
  const limitParam = c.req.query("limit");
  const statusParam = c.req.query("status");
  const limit = Math.min(parseInt(limitParam ?? "50", 10), 200);

  const conditions = [];
  if (statusParam) {
    conditions.push(
      eq(
        emails.status,
        statusParam as typeof emails.status.enumValues[number],
      ),
    );
  }

  const rows = await db
    .select({
      id: emails.id,
      accountId: emails.accountId,
      messageId: emails.messageId,
      fromAddress: emails.fromAddress,
      fromName: emails.fromName,
      toAddresses: emails.toAddresses,
      subject: emails.subject,
      status: emails.status,
      tags: emails.tags,
      createdAt: emails.createdAt,
      sentAt: emails.sentAt,
    })
    .from(emails)
    .where(conditions.length > 0 ? conditions[0] : undefined)
    .orderBy(desc(emails.createdAt))
    .limit(limit);

  const data = rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    messageId: row.messageId,
    from: { email: row.fromAddress, name: row.fromName },
    to: row.toAddresses,
    subject: row.subject,
    status: row.status,
    tags: row.tags,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
  }));

  return c.json({ data });
});

// ─── GET /v1/admin/users — All users with account info ────────────────────

admin.get("/users", async (c) => {
  const db = getDatabase();

  const userRows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      accountId: users.accountId,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  // Get account info for each user
  const accountRows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      planTier: accounts.planTier,
      emailsSentThisPeriod: accounts.emailsSentThisPeriod,
    })
    .from(accounts);

  const accountMap = new Map(accountRows.map((a) => [a.id, a]));

  const data = userRows.map((u) => {
    const acct = accountMap.get(u.accountId);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      accountId: u.accountId,
      accountName: acct?.name ?? null,
      plan: acct?.planTier ?? "free",
      emailsSentThisPeriod: acct?.emailsSentThisPeriod ?? 0,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    };
  });

  return c.json({ data });
});

export { admin };
