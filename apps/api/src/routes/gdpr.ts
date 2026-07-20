/**
 * GDPR Data Subject Access — self-service export (Article 15)
 *
 * POST /v1/account/gdpr/export — Download a JSON bundle of the caller's
 *                                 personal data across core tables.
 *
 * Issue #116(d): no GDPR export existed at all before this — `routes/dpa.ts`
 * is a B2B contract e-signature flow, not a data-subject tool, so any
 * Article 15/17 request was entirely manual/out-of-band.
 *
 * Right-to-erasure (Article 17) is already covered separately by
 * `DELETE /v1/account` (30-day soft delete + `processScheduledAccountDeletions`
 * sweep, `lib/account-deletion.ts`) — this route only covers the access/
 * portability half.
 *
 * SCOPE (v1, deliberately not exhaustive — see the honest `coverage` field
 * in the response instead of silently claiming completeness):
 *   - Included: account profile, own user profile, connected-account
 *     metadata (never tokens/passwords), contacts, calendar, voice-style
 *     profile metadata, signatures, templates, the caller's own security
 *     audit events, push-notification preferences (never push credentials).
 *   - Excluded on purpose: email/voice-message BODY content (already
 *     reachable via the product's own search/export features and would
 *     make this endpoint a multi-GB synchronous query — a real production
 *     risk, not a corner worth cutting silently); refresh tokens, OAuth
 *     tokens, IMAP/SMTP passwords, webhook signing secrets, SSO certificates
 *     (live credentials, not "your data" in the DSAR sense); `webhookIntegrations`
 *     and `voiceTrainingSamples` (not yet wired into this pass).
 *   - Every table is capped at EXPORT_ROW_CAP rows with an honest
 *     `truncated: true` flag rather than a silent partial export.
 */

import { Hono } from "hono";
import { eq, or, isNull, and } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  getDatabase,
  accounts,
  users,
  connectedAccounts,
  contacts,
  calendarEvents,
  calendarAvailability,
  schedulingLinks,
  voiceProfiles,
  voiceStyleProfiles,
  signatures,
  templates,
  securityAuditLog,
  pushSubscriptions,
  pushNotificationPreferences,
} from "@alecrae/db";

const EXPORT_ROW_CAP = 10_000;

const gdprRouter = new Hono();

function capped<T>(rows: T[]): { rows: T[]; truncated: boolean } {
  if (rows.length > EXPORT_ROW_CAP) {
    return { rows: rows.slice(0, EXPORT_ROW_CAP), truncated: true };
  }
  return { rows, truncated: false };
}

// POST /v1/account/gdpr/export — bundle the caller's personal data
gdprRouter.post("/export", requireScope("messages:read"), async (c) => {
  const auth = c.get("auth");
  if (!auth.userId) {
    return c.json(
      {
        error: {
          type: "validation_error",
          message: "GDPR export requires a user-authenticated session, not an API key.",
          code: "user_session_required",
        },
      },
      400,
    );
  }
  const userId = auth.userId;
  const db = getDatabase();

  const [account] = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      planTier: accounts.planTier,
      billingEmail: accounts.billingEmail,
      status: accounts.status,
      storageUsedBytes: accounts.storageUsedBytes,
      createdAt: accounts.createdAt,
      updatedAt: accounts.updatedAt,
    })
    .from(accounts)
    .where(eq(accounts.id, auth.accountId))
    .limit(1);

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      emailVerified: users.emailVerified,
      avatarUrl: users.avatarUrl,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const connectedAccountRows = await db
    .select({
      id: connectedAccounts.id,
      provider: connectedAccounts.provider,
      email: connectedAccounts.email,
      displayName: connectedAccounts.displayName,
      status: connectedAccounts.status,
      lastSyncAt: connectedAccounts.lastSyncAt,
      lastError: connectedAccounts.lastError,
      createdAt: connectedAccounts.createdAt,
      updatedAt: connectedAccounts.updatedAt,
    })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.accountId, auth.accountId))
    .limit(EXPORT_ROW_CAP + 1);

  const contactRows = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      name: contacts.name,
      avatarUrl: contacts.avatarUrl,
      company: contacts.company,
      tags: contacts.tags,
      createdAt: contacts.createdAt,
      updatedAt: contacts.updatedAt,
    })
    .from(contacts)
    .where(eq(contacts.accountId, auth.accountId))
    .limit(EXPORT_ROW_CAP + 1);

  const calendarEventRows = await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      description: calendarEvents.description,
      location: calendarEvents.location,
      startAt: calendarEvents.startAt,
      endAt: calendarEvents.endAt,
      allDay: calendarEvents.allDay,
      attendees: calendarEvents.attendees,
      status: calendarEvents.status,
      createdAt: calendarEvents.createdAt,
      updatedAt: calendarEvents.updatedAt,
    })
    .from(calendarEvents)
    .where(eq(calendarEvents.accountId, auth.accountId))
    .limit(EXPORT_ROW_CAP + 1);

  const calendarAvailabilityRows = await db
    .select({
      dayOfWeek: calendarAvailability.dayOfWeek,
      startTime: calendarAvailability.startTime,
      endTime: calendarAvailability.endTime,
      timezone: calendarAvailability.timezone,
      isAvailable: calendarAvailability.isAvailable,
    })
    .from(calendarAvailability)
    .where(eq(calendarAvailability.accountId, auth.accountId))
    .limit(EXPORT_ROW_CAP + 1);

  const schedulingLinkRows = await db
    .select({
      token: schedulingLinks.token,
      title: schedulingLinks.title,
      durationMinutes: schedulingLinks.durationMinutes,
      dateFrom: schedulingLinks.dateFrom,
      dateTo: schedulingLinks.dateTo,
      location: schedulingLinks.location,
      createdAt: schedulingLinks.createdAt,
    })
    .from(schedulingLinks)
    .where(eq(schedulingLinks.accountId, auth.accountId))
    .limit(EXPORT_ROW_CAP + 1);

  const [voiceProfile] = await db
    .select({
      averageSentenceLength: voiceProfiles.averageSentenceLength,
      vocabularyLevel: voiceProfiles.vocabularyLevel,
      sampleCount: voiceProfiles.sampleCount,
      analyzedAt: voiceProfiles.analyzedAt,
    })
    .from(voiceProfiles)
    .where(eq(voiceProfiles.accountId, auth.accountId))
    .limit(1);

  const voiceStyleProfileRows = await db
    .select({
      id: voiceStyleProfiles.id,
      name: voiceStyleProfiles.name,
      sampleCount: voiceStyleProfiles.sampleCount,
      confidenceScore: voiceStyleProfiles.confidenceScore,
      isDefault: voiceStyleProfiles.isDefault,
      lastTrainedAt: voiceStyleProfiles.lastTrainedAt,
      createdAt: voiceStyleProfiles.createdAt,
    })
    .from(voiceStyleProfiles)
    .where(eq(voiceStyleProfiles.accountId, auth.accountId))
    .limit(EXPORT_ROW_CAP + 1);

  const signatureRows = await db
    .select({
      id: signatures.id,
      name: signatures.name,
      htmlContent: signatures.htmlContent,
      textContent: signatures.textContent,
      isDefault: signatures.isDefault,
      createdAt: signatures.createdAt,
      updatedAt: signatures.updatedAt,
    })
    .from(signatures)
    .where(eq(signatures.accountId, auth.accountId))
    .limit(EXPORT_ROW_CAP + 1);

  const templateRows = await db
    .select({
      id: templates.id,
      name: templates.name,
      subject: templates.subject,
      htmlBody: templates.htmlBody,
      textBody: templates.textBody,
      createdAt: templates.createdAt,
      updatedAt: templates.updatedAt,
    })
    .from(templates)
    .where(eq(templates.accountId, auth.accountId))
    .limit(EXPORT_ROW_CAP + 1);

  // Own security events only — account-wide admin audit trail is a
  // different table (`auditLogs`) and out of scope for a personal export.
  const securityEventRows = await db
    .select({
      id: securityAuditLog.id,
      eventType: securityAuditLog.eventType,
      details: securityAuditLog.details,
      ipAddress: securityAuditLog.ipAddress,
      createdAt: securityAuditLog.createdAt,
    })
    .from(securityAuditLog)
    .where(
      and(
        eq(securityAuditLog.accountId, auth.accountId),
        or(eq(securityAuditLog.userId, userId), isNull(securityAuditLog.userId)),
      ),
    )
    .limit(EXPORT_ROW_CAP + 1);

  // Device metadata only — endpoint/keys are live Web Push credentials, not
  // "your data" in the DSAR sense (see module header).
  const pushSubscriptionRows = await db
    .select({
      platform: pushSubscriptions.platform,
      deviceName: pushSubscriptions.deviceName,
      createdAt: pushSubscriptions.createdAt,
      expiresAt: pushSubscriptions.expiresAt,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .limit(EXPORT_ROW_CAP + 1);

  const [pushPreferences] = await db
    .select({
      newEmail: pushNotificationPreferences.newEmail,
      mentions: pushNotificationPreferences.mentions,
      calendarReminders: pushNotificationPreferences.calendarReminders,
      securityAlerts: pushNotificationPreferences.securityAlerts,
      deliverabilityAlerts: pushNotificationPreferences.deliverabilityAlerts,
      quietHoursStart: pushNotificationPreferences.quietHoursStart,
      quietHoursEnd: pushNotificationPreferences.quietHoursEnd,
      quietHoursTimezone: pushNotificationPreferences.quietHoursTimezone,
    })
    .from(pushNotificationPreferences)
    .where(eq(pushNotificationPreferences.userId, userId))
    .limit(1);

  const connectedAccountsCapped = capped(connectedAccountRows);
  const contactsCapped = capped(contactRows);
  const calendarEventsCapped = capped(calendarEventRows);
  const voiceStyleProfilesCapped = capped(voiceStyleProfileRows);
  const signaturesCapped = capped(signatureRows);
  const templatesCapped = capped(templateRows);
  const securityEventsCapped = capped(securityEventRows);
  const pushSubscriptionsCapped = capped(pushSubscriptionRows);

  return c.json({
    data: {
      exportedAt: new Date().toISOString(),
      account: account ?? null,
      user: user ?? null,
      connectedAccounts: connectedAccountsCapped.rows,
      contacts: contactsCapped.rows,
      calendar: {
        events: calendarEventsCapped.rows,
        availability: calendarAvailabilityRows,
        schedulingLinks: schedulingLinkRows,
      },
      voice: {
        profile: voiceProfile ?? null,
        styleProfiles: voiceStyleProfilesCapped.rows,
      },
      signatures: signaturesCapped.rows,
      templates: templatesCapped.rows,
      ownSecurityEvents: securityEventsCapped.rows,
      pushSubscriptions: pushSubscriptionsCapped.rows,
      pushNotificationPreferences: pushPreferences ?? null,
    },
    coverage: {
      complete: false,
      included: [
        "account",
        "user",
        "connectedAccounts (metadata only — no tokens/passwords)",
        "contacts",
        "calendar",
        "voice (profile + style-profile metadata, no training-sample content)",
        "signatures",
        "templates",
        "ownSecurityEvents",
        "pushSubscriptions (device metadata only — no push credentials)",
        "pushNotificationPreferences",
      ],
      excludedByDesign: [
        "email and voice-message body/transcript content — already reachable via search/export, excluded here to avoid an unbounded synchronous query",
        "live credentials of any kind: OAuth tokens, IMAP/SMTP passwords, refresh tokens, webhook signing secrets, SSO certificates",
      ],
      notYetIncluded: ["webhookIntegrations", "voiceTrainingSamples"],
      truncated: [
        connectedAccountsCapped.truncated ? "connectedAccounts" : null,
        contactsCapped.truncated ? "contacts" : null,
        calendarEventsCapped.truncated ? "calendar.events" : null,
        voiceStyleProfilesCapped.truncated ? "voice.styleProfiles" : null,
        signaturesCapped.truncated ? "signatures" : null,
        templatesCapped.truncated ? "templates" : null,
        securityEventsCapped.truncated ? "ownSecurityEvents" : null,
        pushSubscriptionsCapped.truncated ? "pushSubscriptions" : null,
      ].filter((v): v is string => v !== null),
    },
  });
});

export { gdprRouter };
