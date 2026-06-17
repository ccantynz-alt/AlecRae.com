"use client";

import { useState, useEffect, useCallback } from "react";
import { Box, Text, Button, Card, CardContent, CardHeader, PageLayout } from "@alecrae/ui";
import { pushNotificationsApi, type NotificationPrefsData } from "../../../lib/api-features";

function ToggleRow({ label, description, value, onChange }: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}): React.ReactNode {
  return (
    <Box className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
      <Box>
        <Text variant="body-sm" className="font-medium">{label}</Text>
        <Text variant="caption" className="text-content-subtle">{description}</Text>
      </Box>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 mt-0.5 focus:outline-none focus:ring-2 focus:ring-brand-500 ${
          value ? "bg-brand-600" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </Box>
  );
}

export default function NotificationsPage(): React.ReactNode {
  const [prefs, setPrefs] = useState<NotificationPrefsData | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await pushNotificationsApi.preferences();
      setPrefs(res.data);
      setPushEnabled("Notification" in window && Notification.permission === "granted");
    } catch {
      // use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updatePref = async (key: keyof NotificationPrefsData, value: boolean | string): Promise<void> => {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSaving(true);
    try {
      await pushNotificationsApi.updatePreferences({ [key]: value });
    } finally {
      setSaving(false);
    }
  };

  const requestPushPermission = async (): Promise<void> => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    if (result === "granted") {
      setPushEnabled(true);
      if ("serviceWorker" in navigator && "PushManager" in window) {
        try {
          const reg = await navigator.serviceWorker.ready;
          const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            ...(vapidKey ? { applicationServerKey: vapidKey } : {}),
          });
          await pushNotificationsApi.subscribe(sub.toJSON());
        } catch {
          // subscription failed — push notifications won't work but don't crash
        }
      }
    }
  };

  return (
    <PageLayout title="Notifications" description="Control exactly when and how AlecRae notifies you.">
      {loading ? (
        <Box className="space-y-4">
          {[1, 2, 3].map((i) => <Box key={i} className="h-20 animate-pulse rounded-xl bg-surface-secondary" />)}
        </Box>
      ) : (
        <Box className="space-y-6">
          {/* Push notification enable */}
          <Card>
            <CardHeader>
              <Text variant="body-sm" className="text-sm font-semibold">Push Notifications</Text>
            </CardHeader>
            <CardContent>
              {pushEnabled ? (
                <Box className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                  <span className="text-green-500">✓</span>
                  <Text variant="body-sm" className="text-green-700 font-medium">
                    Push notifications are enabled
                  </Text>
                </Box>
              ) : (
                <Box className="space-y-3">
                  <Text variant="body-sm" className="text-content-subtle">
                    Enable push notifications to get real-time alerts even when AlecRae isn't open.
                  </Text>
                  <Button variant="primary" size="sm" onClick={() => void requestPushPermission()}>
                    Enable Push Notifications
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Notification preferences */}
          {prefs && (
            <Card>
              <CardHeader>
                <Box className="flex items-center justify-between">
                  <Text variant="body-sm" className="text-sm font-semibold">Notification Preferences</Text>
                  {saving && <Text variant="caption" className="text-content-subtle">Saving…</Text>}
                </Box>
              </CardHeader>
              <CardContent>
                <ToggleRow
                  label="VIP Contact Emails"
                  description="Notify immediately when a VIP contact emails you"
                  value={prefs.vipContacts}
                  onChange={(v) => void updatePref("vipContacts", v)}
                />
                <ToggleRow
                  label="Thread Replies"
                  description="Notify when someone replies to a thread you're in"
                  value={prefs.threadReplies}
                  onChange={(v) => void updatePref("threadReplies", v)}
                />
                <ToggleRow
                  label="Meeting Invites"
                  description="Notify when you receive a calendar invite"
                  value={prefs.meetingInvites}
                  onChange={(v) => void updatePref("meetingInvites", v)}
                />
                <ToggleRow
                  label="AI Agent Completed"
                  description="Notify when the AI agent finishes processing your inbox"
                  value={prefs.agentCompleted}
                  onChange={(v) => void updatePref("agentCompleted", v)}
                />
                <ToggleRow
                  label="Weekly Digest"
                  description="Receive a weekly summary of your email activity"
                  value={prefs.weeklyDigest}
                  onChange={(v) => void updatePref("weeklyDigest", v)}
                />
                <ToggleRow
                  label="Security Alerts"
                  description="Notify when a phishing attempt or security threat is detected"
                  value={prefs.securityAlerts}
                  onChange={(v) => void updatePref("securityAlerts", v)}
                />
              </CardContent>
            </Card>
          )}

          {/* Quiet hours */}
          {prefs && (
            <Card>
              <CardHeader>
                <Text variant="body-sm" className="text-sm font-semibold">Quiet Hours</Text>
              </CardHeader>
              <CardContent>
                <Text variant="body-sm" className="text-content-subtle mb-4">
                  Suppress all notifications during these hours. Emergencies from security alerts will still come through.
                </Text>
                <Box className="flex items-center gap-4 flex-wrap">
                  <Box className="flex items-center gap-2">
                    <Text variant="caption" className="text-content-subtle w-8">From</Text>
                    <input
                      type="time"
                      value={prefs.quietHoursStart}
                      onChange={(e) => void updatePref("quietHoursStart", e.target.value)}
                      className="px-3 py-1.5 text-sm border border-border rounded-lg bg-surface text-content focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </Box>
                  <Box className="flex items-center gap-2">
                    <Text variant="caption" className="text-content-subtle w-8">To</Text>
                    <input
                      type="time"
                      value={prefs.quietHoursEnd}
                      onChange={(e) => void updatePref("quietHoursEnd", e.target.value)}
                      className="px-3 py-1.5 text-sm border border-border rounded-lg bg-surface text-content focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </Box>
                </Box>
              </CardContent>
            </Card>
          )}

          {/* AI batching */}
          {prefs && (
            <Card>
              <CardHeader>
                <Text variant="body-sm" className="text-sm font-semibold">AI Notification Batching</Text>
              </CardHeader>
              <CardContent>
                <ToggleRow
                  label="Batch notifications with AI"
                  description="Group similar notifications into intelligent hourly batches instead of one per email"
                  value={prefs.aiBatching}
                  onChange={(v) => void updatePref("aiBatching", v)}
                />
              </CardContent>
            </Card>
          )}
        </Box>
      )}
    </PageLayout>
  );
}
