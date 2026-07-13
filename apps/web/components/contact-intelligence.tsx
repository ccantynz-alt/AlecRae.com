"use client";

/**
 * Contact intelligence panels for the contact detail view:
 *   - ContactEnrichmentCard      — company/social enrichment + re-enrich
 *   - ContactInteractionsTimeline — interaction history + log new
 *   - ContactRemindersPanel      — follow-up reminders (list/create/complete)
 *   - ContactInsightsPanel       — AI relationship insights
 *
 * Backend note (Known Issue #29): enrichment is currently domain-derived mock
 * data and insights are heuristic placeholders — these panels render whatever
 * comes back and show a friendly note when data is sparse.
 */

import { useState, useEffect, useCallback } from "react";
import { Box, Text, Button, Input } from "@alecrae/ui";
import {
  contactEnrichmentApi,
  contactsExtendedApi,
  type ContactEnrichment,
  type ContactInteraction,
  type ContactReminder,
  type ContactInsights,
  type InteractionType,
} from "../lib/api-contacts-extended";

// ─── Shared helpers ──────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Value for a `datetime-local` input (local time, minute precision). */
function toLocalInputValue(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <Box className="mb-6 rounded-lg border border-border bg-surface">
      <Box className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <Text variant="body-sm" className="font-medium text-content">
          {title}
        </Text>
        {action}
      </Box>
      <Box className="p-4">{children}</Box>
    </Box>
  );
}

function InlineError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): React.ReactNode {
  return (
    <Box role="alert" className="flex items-center justify-between gap-3">
      <Text variant="body-sm" className="text-red-600">
        {message}
      </Text>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Box>
  );
}

const INTERACTION_LABELS: Record<InteractionType, string> = {
  email_sent: "Email sent",
  email_received: "Email received",
  meeting: "Meeting",
  call: "Call",
  note: "Note",
};

function isInteractionType(value: string): value is InteractionType {
  return value in INTERACTION_LABELS;
}

const INTERACTION_DOTS: Record<InteractionType, string> = {
  email_sent: "bg-brand-500",
  email_received: "bg-green-500",
  meeting: "bg-purple-500",
  call: "bg-orange-500",
  note: "bg-gray-400",
};

// ─── Enrichment card ─────────────────────────────────────────────────────────

const ENRICHMENT_FIELDS: { key: keyof ContactEnrichment["data"]; label: string }[] = [
  { key: "fullName", label: "Full name" },
  { key: "title", label: "Title" },
  { key: "company", label: "Company" },
  { key: "companyDomain", label: "Company domain" },
  { key: "companySize", label: "Company size" },
  { key: "industry", label: "Industry" },
  { key: "department", label: "Department" },
  { key: "seniorityLevel", label: "Seniority" },
  { key: "location", label: "Location" },
  { key: "timezone", label: "Timezone" },
];

export function ContactEnrichmentCard({
  contactId,
}: {
  contactId: string;
}): React.ReactNode {
  const [enrichment, setEnrichment] = useState<ContactEnrichment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      setEnrichment(await contactEnrichmentApi.get(contactId));
    } catch (err) {
      setError(errorMessage(err, "Failed to load enrichment data"));
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleEnrich = async (): Promise<void> => {
    setWorking(true);
    setError(null);
    try {
      setEnrichment(await contactEnrichmentApi.enrich(contactId));
    } catch (err) {
      setError(errorMessage(err, "Enrichment failed"));
    } finally {
      setWorking(false);
    }
  };

  const handleClear = async (): Promise<void> => {
    setWorking(true);
    setError(null);
    try {
      await contactEnrichmentApi.clear(contactId);
      setEnrichment(null);
    } catch (err) {
      setError(errorMessage(err, "Failed to clear enrichment data"));
    } finally {
      setWorking(false);
    }
  };

  const fields = enrichment
    ? ENRICHMENT_FIELDS.flatMap(({ key, label }) => {
        const value = enrichment.data[key];
        return typeof value === "string" && value.length > 0
          ? [{ label, value }]
          : [];
      })
    : [];

  const socials = enrichment
    ? [
        enrichment.data.linkedinUrl
          ? { label: "LinkedIn", href: enrichment.data.linkedinUrl }
          : null,
        enrichment.data.twitterHandle
          ? {
              label: `@${enrichment.data.twitterHandle.replace(/^@/, "")}`,
              href: `https://x.com/${enrichment.data.twitterHandle.replace(/^@/, "")}`,
            }
          : null,
        enrichment.data.githubHandle
          ? {
              label: `github/${enrichment.data.githubHandle}`,
              href: `https://github.com/${enrichment.data.githubHandle}`,
            }
          : null,
      ].filter((s): s is { label: string; href: string } => s !== null)
    : [];

  return (
    <Section
      title="Enrichment"
      action={
        enrichment ? (
          <Box className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void handleEnrich()} disabled={working}>
              {working ? "Working..." : "Re-enrich"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void handleClear()} disabled={working}>
              Clear
            </Button>
          </Box>
        ) : undefined
      }
    >
      {loading ? (
        <Text variant="body-sm" muted>Loading enrichment...</Text>
      ) : error ? (
        <InlineError message={error} onRetry={() => void load()} />
      ) : !enrichment ? (
        <Box className="flex flex-col items-start gap-3">
          <Text variant="body-sm" muted>
            No enrichment data yet. Pull company and profile details from this
            contact&apos;s email address.
          </Text>
          <Button variant="secondary" size="sm" onClick={() => void handleEnrich()} disabled={working}>
            {working ? "Enriching..." : "Enrich now"}
          </Button>
        </Box>
      ) : (
        <Box>
          {fields.length > 0 ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
              {fields.map(({ label, value }) => (
                <Box key={label}>
                  <dt className="text-xs text-content-tertiary">{label}</dt>
                  <dd className="text-sm text-content">{value}</dd>
                </Box>
              ))}
            </dl>
          ) : (
            <Text variant="body-sm" muted>
              Enrichment ran but found no public details for this address.
            </Text>
          )}

          {enrichment.data.bio && (
            <Text variant="body-sm" muted className="mt-3">
              {enrichment.data.bio}
            </Text>
          )}

          {socials.length > 0 && (
            <Box className="flex flex-wrap gap-2 mt-3">
              {socials.map((s) => (
                <a
                  key={s.href}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-border-focus"
                >
                  {s.label}
                </a>
              ))}
            </Box>
          )}

          <Box className="flex items-center gap-3 mt-4">
            <Box
              className="flex-1 h-1.5 rounded-full bg-surface-secondary overflow-hidden"
              role="progressbar"
              aria-label="Enrichment confidence"
              aria-valuenow={Math.round(enrichment.confidence * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <Box
                className="h-full rounded-full bg-brand-500"
                style={{ width: `${Math.round(enrichment.confidence * 100)}%` }}
              />
            </Box>
            <Text variant="caption" muted>
              {Math.round(enrichment.confidence * 100)}% confidence
            </Text>
          </Box>
          <Text variant="caption" muted className="mt-1">
            Enriched {formatDate(enrichment.enrichedAt)} via {enrichment.source}
          </Text>

          {fields.length <= 2 && (
            <Text variant="caption" muted className="mt-2">
              Results are limited for now — deeper company and profile lookups
              are on the way.
            </Text>
          )}
        </Box>
      )}
    </Section>
  );
}

// ─── Interactions timeline ───────────────────────────────────────────────────

export function ContactInteractionsTimeline({
  contactId,
  onChanged,
}: {
  contactId: string;
  onChanged?: () => void;
}): React.ReactNode {
  const [interactions, setInteractions] = useState<ContactInteraction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formType, setFormType] = useState<InteractionType>("note");
  const [formSubject, setFormSubject] = useState("");
  const [formWhen, setFormWhen] = useState(() => toLocalInputValue(new Date()));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const page = await contactsExtendedApi.listInteractions(contactId, { limit: 10 });
      setInteractions(page.data);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (err) {
      setError(errorMessage(err, "Failed to load interactions"));
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleLoadMore = async (): Promise<void> => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await contactsExtendedApi.listInteractions(contactId, {
        limit: 10,
        cursor,
      });
      setInteractions((prev) => [...prev, ...page.data]);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (err) {
      setError(errorMessage(err, "Failed to load more interactions"));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleLog = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!formWhen) {
      setFormError("Pick a date and time");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await contactsExtendedApi.logInteraction({
        contactId,
        type: formType,
        ...(formSubject.trim() ? { subject: formSubject.trim() } : {}),
        occurredAt: new Date(formWhen).toISOString(),
      });
      setInteractions((prev) => [created, ...prev]);
      setFormSubject("");
      setFormWhen(toLocalInputValue(new Date()));
      setFormOpen(false);
      onChanged?.();
    } catch (err) {
      setFormError(errorMessage(err, "Failed to log interaction"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      title="Interactions"
      action={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setFormOpen((v) => !v)}
          aria-expanded={formOpen}
        >
          {formOpen ? "Cancel" : "Log interaction"}
        </Button>
      }
    >
      {formOpen && (
        <form onSubmit={(e) => void handleLog(e)} className="mb-4 p-3 rounded-lg bg-surface-secondary border border-border">
          <Box className="grid grid-cols-2 gap-3">
            <Box className="flex flex-col gap-1">
              <label htmlFor="interaction-type" className="text-xs font-medium text-content">
                Type
              </label>
              <select
                id="interaction-type"
                value={formType}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setFormType(e.target.value as InteractionType)
                }
                className="h-8 px-2 rounded-md border border-border bg-surface text-body-sm text-content focus:outline-none focus:ring-2 focus:ring-border-focus"
              >
                {(Object.keys(INTERACTION_LABELS) as InteractionType[]).map((t) => (
                  <option key={t} value={t}>
                    {INTERACTION_LABELS[t]}
                  </option>
                ))}
              </select>
            </Box>
            <Box className="flex flex-col gap-1">
              <label htmlFor="interaction-when" className="text-xs font-medium text-content">
                When
              </label>
              <input
                id="interaction-when"
                type="datetime-local"
                value={formWhen}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormWhen(e.target.value)}
                className="h-8 px-2 rounded-md border border-border bg-surface text-body-sm text-content focus:outline-none focus:ring-2 focus:ring-border-focus"
              />
            </Box>
          </Box>
          <Box className="mt-3">
            <Input
              inputSize="sm"
              label="Subject (optional)"
              placeholder="Quick summary of the interaction"
              value={formSubject}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormSubject(e.target.value)}
            />
          </Box>
          {formError && (
            <Text variant="body-sm" className="text-red-600 mt-2" role="alert">
              {formError}
            </Text>
          )}
          <Box className="flex justify-end mt-3">
            <Button type="submit" variant="primary" size="sm" disabled={saving}>
              {saving ? "Logging..." : "Log"}
            </Button>
          </Box>
        </form>
      )}

      {loading ? (
        <Text variant="body-sm" muted>Loading interactions...</Text>
      ) : error ? (
        <InlineError message={error} onRetry={() => void load()} />
      ) : interactions.length === 0 ? (
        <Text variant="body-sm" muted>
          No interactions logged yet. Log meetings, calls, and notes to build a
          history with this contact.
        </Text>
      ) : (
        <>
          <ol className="space-y-3">
            {interactions.map((it) => (
              <li key={it.id} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${INTERACTION_DOTS[it.type]}`}
                />
                <Box className="flex-1 min-w-0">
                  <Box className="flex items-baseline justify-between gap-2">
                    <Text variant="body-sm" className="font-medium text-content">
                      {INTERACTION_LABELS[it.type]}
                    </Text>
                    <Text variant="caption" muted className="flex-shrink-0">
                      {formatDateTime(it.occurredAt)}
                    </Text>
                  </Box>
                  {it.subject && (
                    <Text variant="body-sm" muted className="truncate">
                      {it.subject}
                    </Text>
                  )}
                </Box>
              </li>
            ))}
          </ol>
          {hasMore && (
            <Box className="mt-3 text-center">
              <Button variant="ghost" size="sm" onClick={() => void handleLoadMore()} disabled={loadingMore}>
                {loadingMore ? "Loading..." : "Load more"}
              </Button>
            </Box>
          )}
        </>
      )}
    </Section>
  );
}

// ─── Reminders panel ─────────────────────────────────────────────────────────

export function ContactRemindersPanel({
  contactId,
  onChanged,
}: {
  contactId: string;
  onChanged?: () => void;
}): React.ReactNode {
  const [reminders, setReminders] = useState<ContactReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formWhen, setFormWhen] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      // The reminders endpoint is account-wide; filter to this contact here.
      const page = await contactsExtendedApi.listReminders({ limit: 100 });
      setReminders(page.data.filter((r) => r.contactId === contactId));
    } catch (err) {
      setError(errorMessage(err, "Failed to load reminders"));
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setFormError("Give the reminder a title");
      return;
    }
    if (!formWhen) {
      setFormError("Pick a date and time");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await contactsExtendedApi.createReminder({
        contactId,
        title: formTitle.trim(),
        reminderAt: new Date(formWhen).toISOString(),
      });
      setReminders((prev) =>
        [...prev, created].sort(
          (a, b) => new Date(a.reminderAt).getTime() - new Date(b.reminderAt).getTime(),
        ),
      );
      setFormTitle("");
      setFormOpen(false);
      onChanged?.();
    } catch (err) {
      setFormError(errorMessage(err, "Failed to create reminder"));
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async (id: string): Promise<void> => {
    setBusyId(id);
    setError(null);
    try {
      await contactsExtendedApi.completeReminder(id);
      setReminders((prev) => prev.filter((r) => r.id !== id));
      onChanged?.();
    } catch (err) {
      setError(errorMessage(err, "Failed to complete reminder"));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    setBusyId(id);
    setError(null);
    try {
      await contactsExtendedApi.deleteReminder(id);
      setReminders((prev) => prev.filter((r) => r.id !== id));
      onChanged?.();
    } catch (err) {
      setError(errorMessage(err, "Failed to delete reminder"));
    } finally {
      setBusyId(null);
    }
  };

  const now = Date.now();

  return (
    <Section
      title="Follow-up reminders"
      action={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setFormOpen((v) => !v)}
          aria-expanded={formOpen}
        >
          {formOpen ? "Cancel" : "New reminder"}
        </Button>
      }
    >
      {formOpen && (
        <form onSubmit={(e) => void handleCreate(e)} className="mb-4 p-3 rounded-lg bg-surface-secondary border border-border">
          <Input
            inputSize="sm"
            label="Title"
            placeholder="e.g. Follow up on proposal"
            value={formTitle}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormTitle(e.target.value)}
          />
          <Box className="flex flex-col gap-1 mt-3">
            <label htmlFor="reminder-when" className="text-xs font-medium text-content">
              Remind me at
            </label>
            <input
              id="reminder-when"
              type="datetime-local"
              value={formWhen}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormWhen(e.target.value)}
              className="h-8 px-2 rounded-md border border-border bg-surface text-body-sm text-content focus:outline-none focus:ring-2 focus:ring-border-focus"
            />
          </Box>
          {formError && (
            <Text variant="body-sm" className="text-red-600 mt-2" role="alert">
              {formError}
            </Text>
          )}
          <Box className="flex justify-end mt-3">
            <Button type="submit" variant="primary" size="sm" disabled={saving}>
              {saving ? "Creating..." : "Create reminder"}
            </Button>
          </Box>
        </form>
      )}

      {loading ? (
        <Text variant="body-sm" muted>Loading reminders...</Text>
      ) : error ? (
        <InlineError message={error} onRetry={() => void load()} />
      ) : reminders.length === 0 ? (
        <Text variant="body-sm" muted>
          No pending reminders for this contact.
        </Text>
      ) : (
        <ul className="space-y-2">
          {reminders.map((r) => {
            const overdue = new Date(r.reminderAt).getTime() < now;
            return (
              <li
                key={r.id}
                className="flex items-center gap-3 p-2 rounded-lg border border-border bg-surface-secondary"
              >
                <Box className="flex-1 min-w-0">
                  <Text variant="body-sm" className="font-medium text-content truncate">
                    {r.title}
                  </Text>
                  <Text
                    variant="caption"
                    className={overdue ? "text-red-600" : "text-content-tertiary"}
                  >
                    {overdue ? "Overdue — " : ""}
                    {formatDateTime(r.reminderAt)}
                  </Text>
                </Box>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleComplete(r.id)}
                  disabled={busyId === r.id}
                  aria-label={`Mark reminder "${r.title}" as done`}
                >
                  Done
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleDelete(r.id)}
                  disabled={busyId === r.id}
                  aria-label={`Delete reminder "${r.title}"`}
                >
                  Delete
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// ─── AI insights panel ───────────────────────────────────────────────────────

export function ContactInsightsPanel({
  contactId,
  refreshKey = 0,
}: {
  contactId: string;
  refreshKey?: number;
}): React.ReactNode {
  const [insights, setInsights] = useState<ContactInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      setInsights(await contactsExtendedApi.getInsights(contactId));
    } catch (err) {
      setError(errorMessage(err, "Failed to load insights"));
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void load();
    // refreshKey re-runs the fetch after interactions/reminders change.
  }, [load, refreshKey]);

  const strength = insights?.relationshipStrength ?? 0;
  const strengthLabel = strength >= 70 ? "Strong" : strength >= 35 ? "Moderate" : "Needs attention";

  return (
    <Section title="AI insights">
      {loading ? (
        <Text variant="body-sm" muted>Analyzing relationship...</Text>
      ) : error ? (
        <InlineError message={error} onRetry={() => void load()} />
      ) : !insights ? (
        <Text variant="body-sm" muted>No insights available yet.</Text>
      ) : (
        <Box>
          <Box className="flex items-center justify-between mb-1">
            <Text variant="body-sm" className="font-medium text-content">
              Relationship strength
            </Text>
            <Text variant="body-sm" muted>
              {strengthLabel} ({strength}/100)
            </Text>
          </Box>
          <Box
            className="h-2 rounded-full bg-surface-secondary overflow-hidden"
            role="progressbar"
            aria-label="Relationship strength"
            aria-valuenow={strength}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <Box
              className={`h-full rounded-full ${strength >= 70 ? "bg-green-500" : strength >= 35 ? "bg-brand-500" : "bg-orange-500"}`}
              style={{ width: `${Math.min(100, Math.max(0, strength))}%` }}
            />
          </Box>

          <Box className="grid grid-cols-2 gap-3 mt-4">
            <Box className="p-3 rounded-lg bg-surface-secondary border border-border">
              <Text variant="heading-md" className="text-content">
                {insights.summary.totalInteractions}
              </Text>
              <Text variant="caption" muted>Total interactions</Text>
            </Box>
            <Box className="p-3 rounded-lg bg-surface-secondary border border-border">
              <Text variant="heading-md" className="text-content">
                {insights.summary.interactionsLast30Days}
              </Text>
              <Text variant="caption" muted>Last 30 days</Text>
            </Box>
            <Box className="p-3 rounded-lg bg-surface-secondary border border-border">
              <Text variant="heading-md" className="text-content">
                {insights.summary.daysSinceLastInteraction ?? "-"}
              </Text>
              <Text variant="caption" muted>Days since last</Text>
            </Box>
            <Box className="p-3 rounded-lg bg-surface-secondary border border-border">
              <Text variant="heading-md" className="text-content">
                {insights.summary.pendingReminders}
              </Text>
              <Text variant="caption" muted>Pending reminders</Text>
            </Box>
          </Box>

          {Object.keys(insights.summary.interactionsByType).length > 0 && (
            <Box className="flex flex-wrap gap-1.5 mt-4">
              {Object.entries(insights.summary.interactionsByType).map(([type, count]) => (
                <span
                  key={type}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700"
                >
                  {isInteractionType(type) ? INTERACTION_LABELS[type] : type}: {count}
                </span>
              ))}
            </Box>
          )}

          <Box className="mt-4">
            <Text variant="body-sm" className="font-medium text-content mb-2">
              Suggested follow-ups
            </Text>
            {insights.suggestedFollowUps.length === 0 ? (
              <Text variant="body-sm" muted>
                Nothing suggested right now. Insights sharpen as you log more
                interactions with this contact.
              </Text>
            ) : (
              <ul className="space-y-1.5">
                {insights.suggestedFollowUps.map((s) => (
                  <li key={s} className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
                    <Text variant="body-sm" muted>{s}</Text>
                  </li>
                ))}
              </ul>
            )}
          </Box>
        </Box>
      )}
    </Section>
  );
}
