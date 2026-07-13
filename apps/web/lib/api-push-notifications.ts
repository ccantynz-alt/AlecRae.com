/**
 * API client for the Push Notifications feature domain
 * (apps/api/src/routes/push-notifications.ts).
 *
 * IMPORTANT — mount path: the router is mounted at `/v1/push` in server.ts
 * (`app.route("/v1/push", pushNotificationsRouter)`), NOT `/v1/push-notifications`.
 * The 6 real endpoints are:
 *   POST   /v1/push/subscribe       — register a Web Push subscription (device)
 *   DELETE /v1/push/subscribe/:id   — unregister a subscription
 *   GET    /v1/push/subscriptions   — list the user's registered devices
 *   GET    /v1/push/preferences     — get notification preferences
 *   PUT    /v1/push/preferences     — update notification preferences
 *   POST   /v1/push/test            — queue a test notification to all devices
 *
 * There is NO `/history` endpoint on the server (the older notifications page
 * called `/v1/push-notifications/history`, which 404s — it is not wired here).
 *
 * Mirrors the featureFetch wrapper in lib/api-delegation.ts so this domain has
 * its own typed entry point with silent 401 → refresh → retry handling.
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface PushApiError {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

async function pushFetch<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const token = getAccessToken();

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // Silent access-token renewal on expiry — mirrors lib/api-delegation.ts.
  if (res.status === 401 && !retried && getRefreshToken()) {
    const fresh = await refreshSession();
    if (fresh) {
      return pushFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => null)) as PushApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type PushPlatform = "web" | "ios" | "android" | "desktop";

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

/** A registered device (row from GET /v1/push/subscriptions). */
export interface PushSubscription {
  id: string;
  platform: PushPlatform;
  endpoint: string;
  deviceName: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface SubscribePayload {
  platform: PushPlatform;
  endpoint: string;
  keys?: PushSubscriptionKeys;
  deviceName?: string;
}

/**
 * Result of POST /v1/push/subscribe. The backend returns `updated: true` when
 * an existing endpoint was refreshed, otherwise a `createdAt` for a new row.
 */
export interface SubscribeResult {
  id: string;
  platform: PushPlatform;
  endpoint: string;
  deviceName: string | null;
  updated?: boolean;
  createdAt?: string;
}

/** Per-category delivery mode. `important` is only valid for `newEmail`. */
export type EmailDeliveryMode = "all" | "important" | "none";
export type BinaryDeliveryMode = "all" | "none";

/** Notification preferences (GET/PUT /v1/push/preferences). */
export interface PushPreferences {
  newEmail: EmailDeliveryMode;
  mentions: BinaryDeliveryMode;
  calendarReminders: BinaryDeliveryMode;
  securityAlerts: BinaryDeliveryMode;
  deliverabilityAlerts: BinaryDeliveryMode;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  quietHoursTimezone: string | null;
  updatedAt?: string;
}

export interface UpdatePreferencesPayload {
  newEmail?: EmailDeliveryMode;
  mentions?: BinaryDeliveryMode;
  calendarReminders?: BinaryDeliveryMode;
  securityAlerts?: BinaryDeliveryMode;
  deliverabilityAlerts?: BinaryDeliveryMode;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  quietHoursTimezone?: string | null;
}

export interface TestNotificationDevice {
  id: string;
  platform: PushPlatform;
  deviceName: string | null;
  status: "queued";
}

export interface TestNotificationResult {
  message: string;
  devices: TestNotificationDevice[];
  totalDevices: number;
  note?: string;
}

// ─── API (/v1/push) ───────────────────────────────────────────────────────────

export const pushNotificationsApi = {
  /** POST /v1/push/subscribe — register (or refresh) a device subscription. */
  subscribe(payload: SubscribePayload): Promise<{ data: SubscribeResult }> {
    return pushFetch<{ data: SubscribeResult }>("/v1/push/subscribe", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** DELETE /v1/push/subscribe/:id — unregister a device. */
  unsubscribe(id: string): Promise<{ deleted: boolean; id: string }> {
    return pushFetch<{ deleted: boolean; id: string }>(
      `/v1/push/subscribe/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  /** GET /v1/push/subscriptions — list the user's registered devices. */
  listSubscriptions(): Promise<{ data: PushSubscription[] }> {
    return pushFetch<{ data: PushSubscription[] }>("/v1/push/subscriptions");
  },

  /** GET /v1/push/preferences — get notification preferences (defaults if unset). */
  getPreferences(): Promise<{ data: PushPreferences }> {
    return pushFetch<{ data: PushPreferences }>("/v1/push/preferences");
  },

  /** PUT /v1/push/preferences — update notification preferences. */
  updatePreferences(
    payload: UpdatePreferencesPayload,
  ): Promise<{ data: { updated?: boolean; created?: boolean; updatedAt: string } }> {
    return pushFetch<{
      data: { updated?: boolean; created?: boolean; updatedAt: string };
    }>("/v1/push/preferences", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  /** POST /v1/push/test — queue a test notification to every registered device. */
  sendTest(): Promise<{ data: TestNotificationResult }> {
    return pushFetch<{ data: TestNotificationResult }>("/v1/push/test", {
      method: "POST",
    });
  },
};
