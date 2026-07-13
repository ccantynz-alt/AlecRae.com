"use client";

/**
 * AlecRae — Push Devices manager.
 *
 * Wires the device-subscription surface of the Push Notifications backend
 * (/v1/push): list registered devices, subscribe THIS browser via the Web Push
 * API, unsubscribe a device, and send a test notification.
 *
 * Browser-subscribe requires:
 *   1. the Notification + PushManager + serviceWorker APIs (feature-detected),
 *   2. the user granting notification permission,
 *   3. a VAPID application server public key (NEXT_PUBLIC_VAPID_PUBLIC_KEY).
 *
 * If the VAPID key is not configured, real PushManager.subscribe() cannot mint
 * a usable subscription, so we degrade gracefully with a clear message and keep
 * the rest of the surface (device list, unsubscribe, test) fully functional.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Text,
  Button,
  Card,
  CardContent,
  CardHeader,
} from "@alecrae/ui";
import {
  pushNotificationsApi,
  type PushSubscription,
} from "../lib/api-push-notifications";

// ─── Helpers ────────────────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

/** VAPID public key, if the deployment has configured one. */
function getVapidPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  return key && key.length > 0 ? key : null;
}

/** True when this browser has the APIs required for Web Push. */
function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Convert a base64url VAPID key to the buffer PushManager expects. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/** Convert an ArrayBuffer to a base64url string (for the p256dh/auth keys). */
function bufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** A short, human-friendly label for the current browser/device. */
function currentDeviceName(): string {
  if (typeof navigator === "undefined") return "This device";
  const ua = navigator.userAgent;
  let browser = "Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";

  let os = "";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/(iPhone|iPad|iPod)/.test(ua)) os = "iOS";
  else if (/Linux/.test(ua)) os = "Linux";

  return os ? `${browser} on ${os}` : browser;
}

const PLATFORM_ICONS: Record<string, string> = {
  web: "🌐",
  ios: "📱",
  android: "🤖",
  desktop: "💻",
  default: "📟",
};

function platformIcon(platform: string): string {
  return PLATFORM_ICONS[platform] ?? PLATFORM_ICONS.default ?? "📟";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DeviceRow({
  device,
  onRemove,
  removing,
}: {
  device: PushSubscription;
  onRemove: (id: string) => void;
  removing: boolean;
}): React.JSX.Element {
  return (
    <Box className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised px-4 py-3">
      <Box
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-surface text-base select-none"
        aria-hidden="true"
      >
        {platformIcon(device.platform)}
      </Box>
      <Box className="flex-1 min-w-0">
        <Text variant="body-sm" className="font-medium text-content truncate">
          {device.deviceName ?? "Unnamed device"}
        </Text>
        <Text variant="body-sm" muted className="text-xs capitalize">
          {device.platform}
          {device.createdAt ? ` · added ${formatDate(device.createdAt)}` : ""}
        </Text>
      </Box>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRemove(device.id)}
        disabled={removing}
        aria-label={`Remove ${device.deviceName ?? "this device"}`}
      >
        {removing ? "Removing…" : "Remove"}
      </Button>
    </Box>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function PushDevices(): React.JSX.Element {
  const [devices, setDevices] = useState<PushSubscription[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [subscribing, setSubscribing] = useState<boolean>(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [testing, setTesting] = useState<boolean>(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const supported = useMemo<boolean>(() => pushSupported(), []);
  const vapidKey = useMemo<string | null>(() => getVapidPublicKey(), []);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await pushNotificationsApi.listSubscriptions();
      setDevices(res.data);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const subscribeThisBrowser = useCallback(async (): Promise<void> => {
    setActionError(null);
    setNotice(null);

    if (!supported) {
      setActionError("This browser does not support push notifications.");
      return;
    }
    if (!vapidKey) {
      setActionError(
        "Push delivery isn't configured on the server yet (missing VAPID key). Your preferences below are saved, but this browser can't be registered for delivery until the server is set up.",
      );
      return;
    }

    setSubscribing(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setActionError(
          "Notification permission was not granted. Enable notifications for this site in your browser settings and try again.",
        );
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      // Reuse an existing browser subscription if present, else create one.
      let sub = await registration.pushManager.getSubscription();
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      const p256dh = bufferToBase64Url(sub.getKey("p256dh"));
      const auth = bufferToBase64Url(sub.getKey("auth"));

      await pushNotificationsApi.subscribe({
        platform: "web",
        endpoint: sub.endpoint,
        ...(p256dh && auth ? { keys: { p256dh, auth } } : {}),
        deviceName: currentDeviceName(),
      });

      setNotice("This browser is now registered for push notifications.");
      await load();
    } catch (e) {
      setActionError(errMsg(e));
    } finally {
      setSubscribing(false);
    }
  }, [supported, vapidKey, load]);

  const removeDevice = useCallback(
    async (id: string): Promise<void> => {
      setActionError(null);
      setNotice(null);
      setRemovingId(id);
      try {
        await pushNotificationsApi.unsubscribe(id);
        setDevices((prev) => prev.filter((d) => d.id !== id));
        setNotice("Device removed.");
      } catch (e) {
        setActionError(errMsg(e));
      } finally {
        setRemovingId(null);
      }
    },
    [],
  );

  const sendTest = useCallback(async (): Promise<void> => {
    setActionError(null);
    setNotice(null);
    setTesting(true);
    try {
      const res = await pushNotificationsApi.sendTest();
      setNotice(
        `Test notification queued for ${res.data.totalDevices} ${
          res.data.totalDevices === 1 ? "device" : "devices"
        }.`,
      );
    } catch (e) {
      setActionError(errMsg(e));
    } finally {
      setTesting(false);
    }
  }, []);

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">Registered Devices</Text>
        <Text variant="body-sm" muted>
          Browsers and devices that receive AlecRae push notifications.
        </Text>
      </CardHeader>
      <CardContent>
        <Box className="space-y-4">
          {/* Feature-support / config warnings */}
          {!supported && (
            <Box
              className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
              role="status"
            >
              <Text variant="body-sm" className="text-amber-900">
                This browser does not support push notifications. Try a modern
                desktop or Android browser.
              </Text>
            </Box>
          )}
          {supported && !vapidKey && (
            <Box
              className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
              role="status"
            >
              <Text variant="body-sm" className="text-amber-900">
                Push delivery isn&rsquo;t fully set up on the server yet. You can
                manage preferences below, but registering this browser for
                delivery is unavailable until the server VAPID key is configured.
              </Text>
            </Box>
          )}

          {/* Action feedback */}
          {actionError && (
            <Box
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3"
              role="alert"
            >
              <Text variant="body-sm" className="text-red-800">
                {actionError}
              </Text>
            </Box>
          )}
          {notice && (
            <Box
              className="rounded-lg border border-green-200 bg-green-50 px-4 py-3"
              role="status"
              aria-live="polite"
            >
              <Text variant="body-sm" className="text-green-800">
                {notice}
              </Text>
            </Box>
          )}

          {/* Device list */}
          {loading ? (
            <Box className="space-y-2">
              {[0, 1].map((i) => (
                <Box
                  key={i}
                  className="h-16 animate-pulse rounded-xl bg-surface-raised"
                  aria-hidden="true"
                />
              ))}
            </Box>
          ) : error ? (
            <Box
              className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3"
              role="alert"
            >
              <Text variant="body-sm" className="text-red-800">
                {error}
              </Text>
              <Button variant="ghost" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            </Box>
          ) : devices.length === 0 ? (
            <Box className="rounded-xl border border-border bg-surface-raised px-4 py-8 text-center">
              <Text variant="body-sm" muted>
                No devices registered yet. Register this browser below to start
                receiving notifications.
              </Text>
            </Box>
          ) : (
            <Box className="space-y-2">
              {devices.map((device) => (
                <DeviceRow
                  key={device.id}
                  device={device}
                  onRemove={(id) => void removeDevice(id)}
                  removing={removingId === device.id}
                />
              ))}
            </Box>
          )}

          {/* Actions */}
          <Box className="flex flex-wrap gap-3 pt-1">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void subscribeThisBrowser()}
              disabled={subscribing || !supported}
            >
              {subscribing ? "Registering…" : "Register this browser"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void sendTest()}
              disabled={testing || devices.length === 0}
            >
              {testing ? "Sending…" : "Send test notification"}
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
