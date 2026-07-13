/**
 * API client for AlecRae Meet (video meetings) — the /v1/meetings/* surface
 * defined in apps/api/src/routes/video-meetings.ts (meeting rooms, instant
 * meetings, scheduling, recordings, transcripts, AI summaries).
 *
 * NOT to be confused with lib/api.ts `meetingsApi`, which talks to the
 * thread-level meeting-link route (S9).
 *
 * Replicates the private `featureFetch` 401-refresh pattern from
 * lib/api-features.ts (which is owned elsewhere and does not export it).
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface MeetApiError {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

async function meetFetch<T>(
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

  // Silent access-token renewal on expiry — mirrors lib/api-features.ts.
  if (res.status === 401 && !retried && getRefreshToken()) {
    const fresh = await refreshSession();
    if (fresh) {
      return meetFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as MeetApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MeetingRoomData {
  id: string;
  name: string;
  slug: string;
  joinLink: string;
  isPersonal: boolean;
  maxParticipants: number;
  waitingRoomEnabled: boolean;
  recordingEnabled: boolean;
  transcriptionEnabled: boolean;
  createdAt: string;
  /** Absent on the POST /rooms (create) response; present on list/get. */
  updatedAt?: string;
}

export interface UpdatedRoomData {
  id: string;
  name: string;
  slug: string;
  joinLink: string;
  maxParticipants: number;
  waitingRoomEnabled: boolean;
  recordingEnabled: boolean;
  transcriptionEnabled: boolean;
  updatedAt: string;
}

export interface InstantMeetingData {
  id: string;
  name: string;
  slug: string;
  joinLink: string;
  createdAt: string;
}

export interface ScheduledMeetingData {
  eventId: string;
  roomId: string;
  roomName: string;
  title: string;
  startTime: string;
  endTime: string;
  joinLink: string;
  attendees: string[];
  description: string | null;
  sendInvites: boolean;
  createdAt: string;
}

export interface RecordingListItem {
  id: string;
  title: string | null;
  duration: number | null;
  size: number | null;
  hasSummary: boolean;
  recordedAt: string | null;
  createdAt: string;
}

export interface RecordingDetailData {
  id: string;
  roomId: string;
  roomName: string;
  title: string | null;
  duration: number | null;
  size: number | null;
  storageKey: string | null;
  transcriptKey: string | null;
  aiSummary: string | null;
  aiActionItems: string[] | null;
  recordedAt: string | null;
  createdAt: string;
}

export interface SummarizeResultData {
  id: string;
  aiSummary: string;
  aiActionItems: string[];
  confidence: number;
  generatedAt: string;
}

export interface CreateRoomPayload {
  name: string;
  slug: string;
  isPersonal?: boolean;
  maxParticipants?: number;
  waitingRoomEnabled?: boolean;
  recordingEnabled?: boolean;
  transcriptionEnabled?: boolean;
}

export interface UpdateRoomPayload {
  name?: string;
  maxParticipants?: number;
  waitingRoomEnabled?: boolean;
  recordingEnabled?: boolean;
  transcriptionEnabled?: boolean;
}

export interface ScheduleMeetingPayload {
  title: string;
  /** ISO 8601 datetime string. */
  startTime: string;
  /** ISO 8601 datetime string. */
  endTime: string;
  attendees?: string[];
  description?: string;
  sendInvites?: boolean;
}

export interface PagedResult<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
}

// ─── API ─────────────────────────────────────────────────────────────────────

export const videoMeetingsApi = {
  /** POST /v1/meetings/rooms */
  createRoom(payload: CreateRoomPayload): Promise<{ data: MeetingRoomData }> {
    return meetFetch<{ data: MeetingRoomData }>("/v1/meetings/rooms", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** GET /v1/meetings/rooms */
  listRooms(params?: {
    limit?: number;
    cursor?: string;
  }): Promise<PagedResult<MeetingRoomData>> {
    const query = new URLSearchParams();
    if (params?.limit !== undefined) query.set("limit", String(params.limit));
    if (params?.cursor) query.set("cursor", params.cursor);
    const qs = query.toString();
    return meetFetch<PagedResult<MeetingRoomData>>(
      `/v1/meetings/rooms${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /v1/meetings/rooms/:id */
  getRoom(id: string): Promise<{ data: MeetingRoomData }> {
    return meetFetch<{ data: MeetingRoomData }>(
      `/v1/meetings/rooms/${encodeURIComponent(id)}`,
    );
  },

  /** PUT /v1/meetings/rooms/:id */
  updateRoom(
    id: string,
    payload: UpdateRoomPayload,
  ): Promise<{ data: UpdatedRoomData }> {
    return meetFetch<{ data: UpdatedRoomData }>(
      `/v1/meetings/rooms/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
  },

  /** DELETE /v1/meetings/rooms/:id */
  deleteRoom(id: string): Promise<{ deleted: boolean; id: string }> {
    return meetFetch<{ deleted: boolean; id: string }>(
      `/v1/meetings/rooms/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  /** POST /v1/meetings/rooms/:id/schedule */
  scheduleMeeting(
    roomId: string,
    payload: ScheduleMeetingPayload,
  ): Promise<{ data: ScheduledMeetingData }> {
    return meetFetch<{ data: ScheduledMeetingData }>(
      `/v1/meetings/rooms/${encodeURIComponent(roomId)}/schedule`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  /** GET /v1/meetings/rooms/:id/recordings */
  listRecordings(
    roomId: string,
    params?: { limit?: number; cursor?: string },
  ): Promise<PagedResult<RecordingListItem>> {
    const query = new URLSearchParams();
    if (params?.limit !== undefined) query.set("limit", String(params.limit));
    if (params?.cursor) query.set("cursor", params.cursor);
    const qs = query.toString();
    return meetFetch<PagedResult<RecordingListItem>>(
      `/v1/meetings/rooms/${encodeURIComponent(roomId)}/recordings${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /v1/meetings/recordings/:id */
  getRecording(id: string): Promise<{ data: RecordingDetailData }> {
    return meetFetch<{ data: RecordingDetailData }>(
      `/v1/meetings/recordings/${encodeURIComponent(id)}`,
    );
  },

  /** POST /v1/meetings/recordings/:id/summarize */
  summarizeRecording(id: string): Promise<{ data: SummarizeResultData }> {
    return meetFetch<{ data: SummarizeResultData }>(
      `/v1/meetings/recordings/${encodeURIComponent(id)}/summarize`,
      { method: "POST" },
    );
  },

  /** POST /v1/meetings/instant */
  createInstant(): Promise<{ data: InstantMeetingData }> {
    return meetFetch<{ data: InstantMeetingData }>("/v1/meetings/instant", {
      method: "POST",
    });
  },
};

// ─── Shared helpers ──────────────────────────────────────────────────────────

/**
 * The summarize endpoint is a known backend stub — it stores placeholder text
 * until the Claude pipeline is wired. Detect it so the UI can degrade honestly
 * instead of presenting boilerplate as a real AI summary.
 */
export function isPlaceholderSummary(summary: string | null): boolean {
  if (!summary) return false;
  return summary.startsWith(
    "Meeting summary will be generated when Claude API is configured",
  );
}
