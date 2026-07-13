"use client";

/**
 * AlecRae — Notification Center
 *
 * Manage push notification preferences, quiet hours, registered devices, and
 * the AI-powered Notification Intelligence layer.
 *
 * Push API (mounted at /v1/push in server.ts, via lib/api-push-notifications.ts):
 *   GET  /v1/push/preferences     — get notification preferences
 *   PUT  /v1/push/preferences     — update notification preferences
 *   GET  /v1/push/subscriptions   — list registered devices  (PushDevices)
 *   POST /v1/push/subscribe       — register a device         (PushDevices)
 *   DELETE /v1/push/subscribe/:id — unregister a device       (PushDevices)
 *   POST /v1/push/test            — send a test notification  (PushDevices)
 *
 * NB: there is no `/history` endpoint on the server — the previous version of
 * this page fetched `/v1/push-notifications/history` (wrong mount path + no such
 * route), which 404'd. That call has been removed.
 *
 * The Notification Intelligence layer (AI rules, pending batches + digest,
 * evaluate/test panel — /v1/notifications/*) is rendered by
 * NotificationIntelligencePanel (components/notification-intelligence-panel.tsx).
 */

import { useState, useEffect, useCallback } from "react";
import { Box, Text, Button, Card, CardContent, CardHeader, PageLayout } from "@alecrae/ui";
import { NotificationIntelligencePanel } from "../../../components/notification-intelligence-panel";
import { PushDevices } from "../../../components/push-devices";
import {
  pushNotificationsApi,
  type PushPreferences,
  type UpdatePreferencesPayload,
} from "../../../lib/api-push-notifications";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** A binary on/off toggle backed by an "all" | "none" preference. */
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

/** New-email delivery has three modes (all/important/none) — a segmented picker. */
function NewEmailModeRow({
  value,
  onChange,
}: {
  value: PushPreferences["newEmail"];
  onChange: (val: PushPreferences["newEmail"]) => void;
}): React.JSX.Element {
  const options: { key: PushPreferences["newEmail"]; label: string }[] = [
    { key: "all", label: "All" },
    { key: "important", label: "Important only" },
    { key: "none", label: "Off" },
  ];
  return (
    <Box className="flex items-center justify-between gap-4 py-3">
      <Box className="flex-1">
        <Text variant="body-sm" className="font-medium text-content">
          New email
        </Text>
        <Text variant="body-sm" muted className="mt-0.5 text-xs">
          How much to notify you when new mail arrives.
        </Text>
      </Box>
      <Box
        role="radiogroup"
        aria-label="New email notifications"
        className="inline-flex overflow-hidden rounded-lg border border-border"
      >
        {options.map((opt) => {
          const active = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.key)}
              className={[
                "px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-inset",
                active
                  ? "bg-brand-600 text-white"
                  : "bg-surface text-content hover:bg-surface-raised",
              ].join(" ")}
            >
              {opt.label}
            </button>
          );
        })}
      </Box>
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

// ─── Page ─────────────────────────────────────────────────────────────────────

const DEFAULT_PREFS: PushPreferences = {
  newEmail: "important",
  mentions: "all",
  calendarReminders: "all",
  securityAlerts: "all",
  deliverabilityAlerts: "all",
  quietHoursStart: null,
  quietHoursEnd: null,
  quietHoursTimezone: null,
};

export default function NotificationsPage(): React.JSX.Element {
  const [prefs, setPrefs] = useState<PushPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await pushNotificationsApi.getPreferences();
      setPrefs(res.data);
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
    async (patch: UpdatePreferencesPayload): Promise<void> => {
      const prev = prefs;
      setPrefs({ ...prefs, ...patch }); // optimistic
      setSaving(true);
      setSaveError(null);
      try {
        await pushNotificationsApi.updatePreferences(patch);
      } catch (e) {
        setPrefs(prev); // rollback
        setSaveError(errMsg(e));
      } finally {
        setSaving(false);
      }
    },
    [prefs],
  );

  // Quiet hours use HH:MM inputs; the backend stores null when a window isn't
  // set, so an empty input value maps to null.
  const quietStart = prefs.quietHoursStart ?? "";
  const quietEnd = prefs.quietHoursEnd ?? "";

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
          <Box className="rounded-lg border border-red-200 bg-red-50 px-4 py-3" role="alert">
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

        {/* Registered devices — Web Push subscriptions */}
        <PushDevices />

        {/* Notification preferences */}
        <Card>
          <CardHeader>
            <Text variant="heading-sm">Notification Preferences</Text>
            <Text variant="body-sm" muted>
              Choose which activity is worth an interruption.
            </Text>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Box className="space-y-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Box
                    key={i}
                    className="h-10 animate-pulse rounded-lg bg-surface-raised"
                    aria-hidden="true"
                  />
                ))}
              </Box>
            ) : (
              <Box className="divide-y divide-border">
                <NewEmailModeRow
                  value={prefs.newEmail}
                  onChange={(val) => void updatePref({ newEmail: val })}
                />
                <ToggleRow
                  label="Mentions"
                  description="Alert when you're mentioned in a shared thread or comment"
                  checked={prefs.mentions === "all"}
                  onChange={(val) => void updatePref({ mentions: val ? "all" : "none" })}
                />
                <ToggleRow
                  label="Calendar reminders"
                  description="Notify ahead of meetings and calendar events"
                  checked={prefs.calendarReminders === "all"}
                  onChange={(val) =>
                    void updatePref({ calendarReminders: val ? "all" : "none" })
                  }
                />
                <ToggleRow
                  label="Deliverability alerts"
                  description="Warn when a message bounces or your sending reputation dips"
                  checked={prefs.deliverabilityAlerts === "all"}
                  onChange={(val) =>
                    void updatePref({ deliverabilityAlerts: val ? "all" : "none" })
                  }
                />
                <ToggleRow
                  label="Security alerts"
                  description="Suspicious activity and new sign-ins. Strongly recommended."
                  checked={prefs.securityAlerts === "all"}
                  onChange={(val) =>
                    void updatePref({ securityAlerts: val ? "all" : "none" })
                  }
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
              hours end. Clear both fields to disable.
            </Text>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Box className="h-16 animate-pulse rounded-lg bg-surface-raised" aria-busy="true" />
            ) : (
              <Box className="grid grid-cols-2 gap-4">
                <TimeInput
                  label="Start time"
                  value={quietStart}
                  onChange={(val) =>
                    void updatePref({ quietHoursStart: val === "" ? null : val })
                  }
                />
                <TimeInput
                  label="End time"
                  value={quietEnd}
                  onChange={(val) =>
                    void updatePref({ quietHoursEnd: val === "" ? null : val })
                  }
                />
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Notification Intelligence — AI rules, batches + digest, evaluate */}
        <NotificationIntelligencePanel />
      </Box>
    </PageLayout>
  );
}
