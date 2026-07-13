"use client";

/**
 * AlecRae — Notification Center
 *
 * Manage push notification preferences, quiet hours, AI-powered batching,
 * and view recent notification history.
 *
 * API:
 *   GET  /v1/push-notifications/preferences
 *   PATCH /v1/push-notifications/preferences
 *   GET  /v1/push-notifications/history
 *
 * The Notification Intelligence layer (AI rules, pending batches + digest,
 * evaluate/test panel — /v1/notifications/*) is rendered by
 * NotificationIntelligencePanel (components/notification-intelligence-panel.tsx).
 */

import { useState, useEffect, useCallback } from "react";
import { Box, Text, Button, Card, CardContent, CardHeader, PageLayout } from "@alecrae/ui";
import { getAccessToken, refreshSession, redirectToLogin } from "../../../lib/auth-token";
import { NotificationIntelligencePanel } from "../../../components/notification-intelligence-panel";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationPreferences {
  enabled: boolean;
  vipOnly: boolean;
  threadReplies: boolean;
  meetingInvites: boolean;
  agentRuns: boolean;
  weeklyDigest: boolean;
  securityAlerts: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  aiBatching: boolean;
}

interface NotificationHistoryItem {
  id: string;
  title: string;
  body: string;
  type: string;
  createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.alecrae.com";

const NOTIFICATION_TYPE_ICONS: Record<string, string> = {
  vip: "⭐",
  thread: "💬",
  meeting: "📅",
  agent: "🤖",
  digest: "📰",
  security: "🔒",
  default: "🔔",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const doFetch = async (token: string | null) =>
    fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token ?? ""}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

  let res = await doFetch(getAccessToken());
  if (res.status === 401) {
    const newToken = await refreshSession();
    if (!newToken) { redirectToLogin(); throw new Error("Session expired"); }
    res = await doFetch(newToken);
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function typeIcon(type: string): string {
  return NOTIFICATION_TYPE_ICONS[type] ?? NOTIFICATION_TYPE_ICONS.default ?? "🔔";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  large,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  large?: boolean;
}): React.JSX.Element {
  const id = `toggle-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <Box className="flex items-center justify-between gap-4 py-3">
      <Box className="flex-1">
        <label
          htmlFor={id}
          className={`block cursor-pointer font-medium ${large ? "text-base text-content" : "text-sm text-content"}`}
        >
          {label}
        </label>
        {description && (
          <Text variant="body-sm" muted className="mt-0.5 text-xs">
            {description}
          </Text>
        )}
      </Box>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2",
          checked ? "bg-brand-600" : "bg-surface-raised border border-border",
          disabled ? "cursor-not-allowed opacity-40" : "",
        ].join(" ")}
      >
        <span
          aria-hidden="true"
          className={[
            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
            checked ? "translate-x-5" : "translate-x-0",
          ].join(" ")}
        />
      </button>
    </Box>
  );
}

function TimeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
}): React.JSX.Element {
  const id = `time-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <Box className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-content">
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      />
    </Box>
  );
}

function HistoryItem({ item }: { item: NotificationHistoryItem }): React.JSX.Element {
  return (
    <Box className="flex items-start gap-3 rounded-xl border border-border bg-surface-raised px-4 py-3">
      <Box
        className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface text-base select-none"
        aria-hidden="true"
      >
        {typeIcon(item.type)}
      </Box>
      <Box className="flex-1 min-w-0">
        <Text variant="body-sm" className="font-medium text-content truncate">
          {item.title}
        </Text>
        <Text variant="body-sm" muted className="mt-0.5 text-xs line-clamp-2">
          {item.body}
        </Text>
      </Box>
      <Text variant="body-sm" muted className="flex-shrink-0 text-xs whitespace-nowrap">
        {formatRelativeTime(item.createdAt)}
      </Text>
    </Box>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const DEFAULT_PREFS: NotificationPreferences = {
  enabled: false,
  vipOnly: false,
  threadReplies: true,
  meetingInvites: true,
  agentRuns: true,
  weeklyDigest: true,
  securityAlerts: true,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  aiBatching: false,
};

export default function NotificationsPage(): React.JSX.Element {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [history, setHistory] = useState<NotificationHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prefsRes, historyRes] = await Promise.all([
        apiFetch<{ data: NotificationPreferences }>("/v1/push-notifications/preferences").then(
          (r) => r.data,
        ),
        apiFetch<{ data: NotificationHistoryItem[] }>("/v1/push-notifications/history").then(
          (r) => r.data,
        ),
      ]);
      setPrefs(prefsRes);
      setHistory(historyRes);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const updatePref = useCallback(
    async (patch: Partial<NotificationPreferences>) => {
      const next = { ...prefs, ...patch };
      setPrefs(next); // optimistic
      setSaving(true);
      setSaveError(null);
      try {
        await apiFetch("/v1/push-notifications/preferences", {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
      } catch (e) {
        setPrefs(prefs); // rollback
        setSaveError(errMsg(e));
      } finally {
        setSaving(false);
      }
    },
    [prefs],
  );

  return (
    <PageLayout
      title="Notifications"
      description="Control how and when AlecRae alerts you about important emails and activity."
    >
      <Box className="space-y-6 max-w-2xl">
        {/* Load error */}
        {error && (
          <Box
            className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3"
            role="alert"
          >
            <Text variant="body-sm" className="text-red-800">
              {error}
            </Text>
            <Button variant="ghost" size="sm" onClick={() => void loadData()}>
              Retry
            </Button>
          </Box>
        )}

        {/* Save error */}
        {saveError && (
          <Box
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3"
            role="alert"
          >
            <Text variant="body-sm" className="text-red-800">
              Failed to save: {saveError}
            </Text>
          </Box>
        )}

        {saving && (
          <Box className="flex items-center gap-2" aria-live="polite">
            <Box className="h-2 w-2 animate-pulse rounded-full bg-brand-600" />
            <Text variant="body-sm" muted className="text-xs">
              Saving…
            </Text>
          </Box>
        )}

        {/* Master push toggle */}
        <Card>
          <CardContent>
            {loading ? (
              <Box className="h-12 animate-pulse rounded-lg bg-surface-raised" aria-busy="true" />
            ) : (
              <ToggleRow
                label="Push Notifications"
                description="Receive push notifications from AlecRae in your browser or device"
                checked={prefs.enabled}
                onChange={(val) => void updatePref({ enabled: val })}
                large
              />
            )}
          </CardContent>
        </Card>

        {/* Notification preferences */}
        <Card>
          <CardHeader>
            <Text variant="heading-sm">Notification Preferences</Text>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Box className="space-y-3">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <Box
                    key={i}
                    className="h-10 animate-pulse rounded-lg bg-surface-raised"
                    aria-hidden="true"
                  />
                ))}
              </Box>
            ) : (
              <Box className="divide-y divide-border">
                <ToggleRow
                  label="VIP contacts only"
                  description="Only notify for emails from contacts you've starred as VIP"
                  checked={prefs.vipOnly}
                  onChange={(val) => void updatePref({ vipOnly: val })}
                  disabled={!prefs.enabled}
                />
                <ToggleRow
                  label="Thread replies"
                  description="Alert when someone replies to a thread you're in"
                  checked={prefs.threadReplies}
                  onChange={(val) => void updatePref({ threadReplies: val })}
                  disabled={!prefs.enabled}
                />
                <ToggleRow
                  label="Meeting invites"
                  description="Notify immediately when a calendar invite arrives"
                  checked={prefs.meetingInvites}
                  onChange={(val) => void updatePref({ meetingInvites: val })}
                  disabled={!prefs.enabled}
                />
                <ToggleRow
                  label="AI agent run completions"
                  description="Get notified when your overnight inbox agent finishes a run"
                  checked={prefs.agentRuns}
                  onChange={(val) => void updatePref({ agentRuns: val })}
                  disabled={!prefs.enabled}
                />
                <ToggleRow
                  label="Weekly digest"
                  description="Receive a weekly summary of your email activity every Monday"
                  checked={prefs.weeklyDigest}
                  onChange={(val) => void updatePref({ weeklyDigest: val })}
                  disabled={!prefs.enabled}
                />
                <ToggleRow
                  label="Security alerts"
                  description="Always notified about suspicious activity and sign-ins (cannot be disabled when push is on)"
                  checked={prefs.securityAlerts}
                  onChange={(val) => void updatePref({ securityAlerts: val })}
                  disabled={!prefs.enabled}
                />
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Quiet hours */}
        <Card>
          <CardHeader>
            <Text variant="heading-sm">Quiet Hours</Text>
            <Text variant="body-sm" muted>
              No notifications will be sent during this window — they queue and deliver when quiet
              hours end.
            </Text>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Box className="h-16 animate-pulse rounded-lg bg-surface-raised" aria-busy="true" />
            ) : (
              <Box className="grid grid-cols-2 gap-4">
                <TimeInput
                  label="Start time"
                  value={prefs.quietHoursStart}
                  onChange={(val) => void updatePref({ quietHoursStart: val })}
                />
                <TimeInput
                  label="End time"
                  value={prefs.quietHoursEnd}
                  onChange={(val) => void updatePref({ quietHoursEnd: val })}
                />
              </Box>
            )}
          </CardContent>
        </Card>

        {/* AI batching */}
        <Card>
          <CardHeader>
            <Text variant="heading-sm">AI Batching</Text>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Box className="h-12 animate-pulse rounded-lg bg-surface-raised" aria-busy="true" />
            ) : (
              <ToggleRow
                label="Intelligent notification batching"
                description="AlecRae's AI groups related notifications together and delivers them at the best time for your focus, instead of interrupting you one by one."
                checked={prefs.aiBatching}
                onChange={(val) => void updatePref({ aiBatching: val })}
                disabled={!prefs.enabled}
              />
            )}
          </CardContent>
        </Card>

        {/* Notification Intelligence — AI rules, batches + digest, evaluate */}
        <NotificationIntelligencePanel />

        {/* Notification history */}
        <Box>
          <Text variant="heading-sm" className="mb-3">
            Recent Notifications
          </Text>
          {loading ? (
            <Box className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Box
                  key={i}
                  className="h-16 animate-pulse rounded-xl bg-surface-raised"
                  aria-hidden="true"
                />
              ))}
            </Box>
          ) : history.length === 0 ? (
            <Box className="rounded-xl border border-border bg-surface-raised px-4 py-8 text-center">
              <Text variant="body-sm" muted>
                No notifications yet. Enable push notifications above to start receiving them.
              </Text>
            </Box>
          ) : (
            <Box className="space-y-2">
              {history.map((item) => (
                <HistoryItem key={item.id} item={item} />
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </PageLayout>
  );
}
