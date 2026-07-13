"use client";

/**
 * AlecRae Meet — Video Meetings Dashboard
 *
 * Meeting rooms (create / list / settings / delete), instant meetings,
 * scheduling, recordings with transcripts + AI summaries.
 *
 * API (apps/api/src/routes/video-meetings.ts):
 *   POST   /v1/meetings/rooms
 *   GET    /v1/meetings/rooms
 *   GET    /v1/meetings/rooms/:id
 *   PUT    /v1/meetings/rooms/:id
 *   DELETE /v1/meetings/rooms/:id
 *   POST   /v1/meetings/rooms/:id/schedule
 *   GET    /v1/meetings/rooms/:id/recordings
 *   GET    /v1/meetings/recordings/:id
 *   POST   /v1/meetings/recordings/:id/summarize
 *   POST   /v1/meetings/instant
 *
 * Plan gate: pro+ (FEATURE_PLANS.video_meetings)
 */

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import {
  Box,
  Text,
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  PageLayout,
} from "@alecrae/ui";
import { PlanGate } from "../../../components/plan-gate";
import {
  videoMeetingsApi,
  isPlaceholderSummary,
  type MeetingRoomData,
  type InstantMeetingData,
  type ScheduledMeetingData,
  type RecordingListItem,
  type RecordingDetailData,
} from "../../../lib/api-video-meetings";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || Number.isNaN(seconds)) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Convert a datetime-local input value to an ISO 8601 string (or null). */
function localToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function LoadingSkeleton({ rows = 3 }: { rows?: number }): ReactNode {
  return (
    <Box className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Box
          key={i}
          className="h-20 animate-pulse rounded-lg bg-surface-raised border border-border"
        />
      ))}
    </Box>
  );
}
LoadingSkeleton.displayName = "LoadingSkeleton";

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): ReactNode {
  return (
    <Box
      className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
      role="alert"
    >
      <Text variant="body-sm" className="text-red-800">
        {message}
      </Text>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Box>
  );
}
ErrorBanner.displayName = "ErrorBanner";

function FeaturePill({ label, on }: { label: string; on: boolean }): ReactNode {
  return (
    <Box
      as="span"
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        on
          ? "bg-brand-100 text-brand-700"
          : "bg-surface-raised text-content-subtle border border-border"
      }`}
    >
      {label}
      {on ? " ✓" : " —"}
    </Box>
  );
}
FeaturePill.displayName = "FeaturePill";

function CopyButton({
  value,
  label,
}: {
  value: string;
  label: string;
}): ReactNode {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return (): void => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions / insecure context) — no-op.
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => void handleCopy()}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
    >
      {copied ? "Copied ✓" : "Copy"}
    </Button>
  );
}
CopyButton.displayName = "CopyButton";

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}): ReactNode {
  return (
    <Box as="label" className="flex items-center gap-2 cursor-pointer select-none">
      <Box
        as="input"
        type="checkbox"
        checked={checked}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.checked)
        }
        className="h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-500"
      />
      <Text variant="body-sm" className="text-content">
        {label}
      </Text>
    </Box>
  );
}
CheckboxField.displayName = "CheckboxField";

// ─── Instant meeting banner ──────────────────────────────────────────────────

function InstantMeetingBanner({
  meeting,
  onDismiss,
}: {
  meeting: InstantMeetingData;
  onDismiss: () => void;
}): ReactNode {
  return (
    <Box
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3"
      role="status"
    >
      <Box className="min-w-0">
        <Text variant="body-sm" className="font-semibold text-content">
          Instant meeting ready
        </Text>
        <Text variant="caption" className="text-content-subtle break-all">
          {meeting.joinLink}
        </Text>
      </Box>
      <Box className="flex items-center gap-2 flex-shrink-0">
        <CopyButton value={meeting.joinLink} label="join link" />
        <Button
          variant="primary"
          size="sm"
          onClick={() => window.open(meeting.joinLink, "_blank", "noopener")}
        >
          Join now
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          aria-label="Dismiss instant meeting banner"
        >
          ✕
        </Button>
      </Box>
    </Box>
  );
}
InstantMeetingBanner.displayName = "InstantMeetingBanner";

// ─── Create room form ────────────────────────────────────────────────────────

function CreateRoomForm({
  onCreated,
  onCancel,
}: {
  onCreated: (room: MeetingRoomData) => void;
  onCancel: () => void;
}): ReactNode {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [isPersonal, setIsPersonal] = useState(false);
  const [waitingRoom, setWaitingRoom] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcription, setTranscription] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState("100");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(value: string): void {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);

    const parsedMax = Number.parseInt(maxParticipants, 10);
    if (Number.isNaN(parsedMax) || parsedMax < 2 || parsedMax > 1000) {
      setError("Max participants must be between 2 and 1000.");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setError("Slug must be lowercase letters, numbers, and hyphens only.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await videoMeetingsApi.createRoom({
        name: name.trim(),
        slug,
        isPersonal,
        maxParticipants: parsedMax,
        waitingRoomEnabled: waitingRoom,
        recordingEnabled: recording,
        transcriptionEnabled: transcription,
      });
      onCreated(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          New meeting room
        </Text>
        <Text variant="body-sm" className="text-content-subtle">
          A permanent room with a fixed join link you can reuse.
        </Text>
      </CardHeader>
      <CardContent>
        <Box as="form" onSubmit={(e: React.FormEvent<HTMLFormElement>) => void handleSubmit(e)} className="space-y-4">
          {error && <ErrorBanner message={error} />}
          <Box className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Room name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Design Review"
              required
              maxLength={255}
            />
            <Input
              label="Slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
              placeholder="design-review"
              hint="Lowercase letters, numbers, hyphens. Used in the join link."
              required
              maxLength={100}
            />
          </Box>
          <Box className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Max participants"
              type="number"
              min={2}
              max={1000}
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
            />
            <Box className="flex flex-col justify-end gap-2 pb-1">
              <CheckboxField
                label="Personal room"
                checked={isPersonal}
                onChange={setIsPersonal}
              />
            </Box>
          </Box>
          <Box className="flex flex-wrap gap-x-6 gap-y-2">
            <CheckboxField
              label="Waiting room"
              checked={waitingRoom}
              onChange={setWaitingRoom}
            />
            <CheckboxField
              label="Cloud recording"
              checked={recording}
              onChange={setRecording}
            />
            <CheckboxField
              label="AI transcription"
              checked={transcription}
              onChange={setTranscription}
            />
          </Box>
          <Box className="flex items-center gap-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={submitting}
              disabled={!name.trim() || !slug}
            >
              Create room
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
CreateRoomForm.displayName = "CreateRoomForm";

// ─── Room settings form ──────────────────────────────────────────────────────

function RoomSettingsForm({
  room,
  onUpdated,
  onCancel,
}: {
  room: MeetingRoomData;
  onUpdated: (patch: Partial<MeetingRoomData>) => void;
  onCancel: () => void;
}): ReactNode {
  const [name, setName] = useState(room.name);
  const [maxParticipants, setMaxParticipants] = useState(
    String(room.maxParticipants),
  );
  const [waitingRoom, setWaitingRoom] = useState(room.waitingRoomEnabled);
  const [recording, setRecording] = useState(room.recordingEnabled);
  const [transcription, setTranscription] = useState(room.transcriptionEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);

    const parsedMax = Number.parseInt(maxParticipants, 10);
    if (Number.isNaN(parsedMax) || parsedMax < 2 || parsedMax > 1000) {
      setError("Max participants must be between 2 and 1000.");
      return;
    }

    setSaving(true);
    try {
      const res = await videoMeetingsApi.updateRoom(room.id, {
        name: name.trim(),
        maxParticipants: parsedMax,
        waitingRoomEnabled: waitingRoom,
        recordingEnabled: recording,
        transcriptionEnabled: transcription,
      });
      onUpdated({
        name: res.data.name,
        maxParticipants: res.data.maxParticipants,
        waitingRoomEnabled: res.data.waitingRoomEnabled,
        recordingEnabled: res.data.recordingEnabled,
        transcriptionEnabled: res.data.transcriptionEnabled,
        updatedAt: res.data.updatedAt,
      });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box
      as="form"
      onSubmit={(e: React.FormEvent<HTMLFormElement>) => void handleSave(e)}
      className="space-y-4 rounded-lg border border-border bg-surface-raised p-4"
      aria-label={`Settings for ${room.name}`}
    >
      {error && <ErrorBanner message={error} />}
      <Box className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Room name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={255}
        />
        <Input
          label="Max participants"
          type="number"
          min={2}
          max={1000}
          value={maxParticipants}
          onChange={(e) => setMaxParticipants(e.target.value)}
        />
      </Box>
      <Box className="flex flex-wrap gap-x-6 gap-y-2">
        <CheckboxField
          label="Waiting room"
          checked={waitingRoom}
          onChange={setWaitingRoom}
        />
        <CheckboxField
          label="Cloud recording"
          checked={recording}
          onChange={setRecording}
        />
        <CheckboxField
          label="AI transcription"
          checked={transcription}
          onChange={setTranscription}
        />
      </Box>
      <Box className="flex items-center gap-2">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={saving}
          disabled={!name.trim()}
        >
          Save settings
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
}
RoomSettingsForm.displayName = "RoomSettingsForm";

// ─── Schedule form ───────────────────────────────────────────────────────────

function ScheduleMeetingForm({
  room,
  onCancel,
}: {
  room: MeetingRoomData;
  onCancel: () => void;
}): ReactNode {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [attendees, setAttendees] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledMeetingData | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);

    const startIso = localToIso(start);
    const endIso = localToIso(end);
    if (!startIso || !endIso) {
      setError("Please pick valid start and end times.");
      return;
    }
    if (new Date(endIso) <= new Date(startIso)) {
      setError("End time must be after the start time.");
      return;
    }

    const attendeeList = attendees
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    setSubmitting(true);
    try {
      const res = await videoMeetingsApi.scheduleMeeting(room.id, {
        title: title.trim(),
        startTime: startIso,
        endTime: endIso,
        ...(attendeeList.length > 0 ? { attendees: attendeeList } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      setScheduled(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (scheduled) {
    return (
      <Box
        className="space-y-3 rounded-lg border border-green-200 bg-green-50 p-4"
        role="status"
      >
        <Text variant="body-sm" className="font-semibold text-green-800">
          “{scheduled.title}” scheduled in {scheduled.roomName}
        </Text>
        <Text variant="caption" className="text-green-800 block">
          {formatDateTime(scheduled.startTime)} → {formatDateTime(scheduled.endTime)}
          {scheduled.attendees.length > 0 &&
            ` · ${scheduled.attendees.length} attendee${scheduled.attendees.length === 1 ? "" : "s"}`}
        </Text>
        <Box className="flex items-center gap-2">
          <CopyButton value={scheduled.joinLink} label="join link" />
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Done
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      as="form"
      onSubmit={(e: React.FormEvent<HTMLFormElement>) => void handleSubmit(e)}
      className="space-y-4 rounded-lg border border-border bg-surface-raised p-4"
      aria-label={`Schedule a meeting in ${room.name}`}
    >
      {error && <ErrorBanner message={error} />}
      <Input
        label="Meeting title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Weekly sync"
        required
        maxLength={500}
      />
      <Box className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Starts"
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          required
        />
        <Input
          label="Ends"
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          required
        />
      </Box>
      <Input
        label="Attendees"
        value={attendees}
        onChange={(e) => setAttendees(e.target.value)}
        placeholder="alex@example.com, sam@example.com"
        hint="Comma-separated email addresses (optional)."
      />
      <Box className="flex flex-col gap-1.5">
        <Text variant="body-sm" className="font-medium text-content" as="label" id={`desc-label-${room.id}`}>
          Description
        </Text>
        <Box
          as="textarea"
          value={description}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            setDescription(e.target.value)
          }
          rows={3}
          maxLength={5000}
          aria-labelledby={`desc-label-${room.id}`}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-content placeholder:text-content-tertiary focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          placeholder="Agenda, links, context… (optional)"
        />
      </Box>
      <Box className="flex items-center gap-2">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={submitting}
          disabled={!title.trim() || !start || !end}
        >
          Schedule meeting
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
}
ScheduleMeetingForm.displayName = "ScheduleMeetingForm";

// ─── Recording detail ────────────────────────────────────────────────────────

function RecordingDetail({
  recordingId,
  onClose,
}: {
  recordingId: string;
  onClose: () => void;
}): ReactNode {
  const [detail, setDetail] = useState<RecordingDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await videoMeetingsApi.getRecording(recordingId);
      setDetail(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [recordingId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSummarize(): Promise<void> {
    setSummarizing(true);
    setSummarizeError(null);
    try {
      const res = await videoMeetingsApi.summarizeRecording(recordingId);
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              aiSummary: res.data.aiSummary,
              aiActionItems: res.data.aiActionItems,
            }
          : prev,
      );
    } catch (err) {
      setSummarizeError(errMsg(err));
    } finally {
      setSummarizing(false);
    }
  }

  if (loading) {
    return (
      <Box className="rounded-lg border border-border bg-surface p-4">
        <LoadingSkeleton rows={2} />
      </Box>
    );
  }

  if (error || !detail) {
    return (
      <Box className="rounded-lg border border-border bg-surface p-4">
        <ErrorBanner
          message={error ?? "Recording not found"}
          onRetry={() => void load()}
        />
      </Box>
    );
  }

  const placeholder = isPlaceholderSummary(detail.aiSummary);
  const hasRealSummary = detail.aiSummary !== null && !placeholder;

  return (
    <Box
      className="space-y-4 rounded-lg border border-border bg-surface p-4"
      aria-label={`Recording details: ${detail.title ?? "Untitled recording"}`}
    >
      <Box className="flex items-start justify-between gap-3">
        <Box className="min-w-0">
          <Text variant="body-sm" className="font-semibold text-content">
            {detail.title ?? "Untitled recording"}
          </Text>
          <Text variant="caption" className="text-content-subtle">
            {detail.roomName} · {formatDuration(detail.duration)} ·{" "}
            {formatBytes(detail.size)}
            {detail.recordedAt && ` · ${formatDateTime(detail.recordedAt)}`}
          </Text>
        </Box>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="Close recording details"
        >
          ✕
        </Button>
      </Box>

      {/* Transcript availability */}
      <Box className="flex flex-wrap items-center gap-2">
        <FeaturePill label="Recording file" on={detail.storageKey !== null} />
        <FeaturePill label="Transcript" on={detail.transcriptKey !== null} />
      </Box>

      {/* AI summary */}
      <Box className="space-y-2">
        <Box className="flex items-center justify-between gap-2">
          <Text
            variant="caption"
            className="text-content-subtle uppercase tracking-wide"
          >
            AI Summary
          </Text>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleSummarize()}
            loading={summarizing}
          >
            {hasRealSummary ? "Regenerate summary" : "Generate AI summary"}
          </Button>
        </Box>

        {summarizeError && <ErrorBanner message={summarizeError} />}

        {placeholder && (
          <Box
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
            role="status"
          >
            <Text variant="body-sm" className="text-amber-800">
              AI summarization isn&apos;t fully configured on the server yet —
              the backend returned placeholder output. Check back once the AI
              pipeline is live.
            </Text>
          </Box>
        )}

        {hasRealSummary && (
          <Text variant="body-sm" className="text-content whitespace-pre-wrap">
            {detail.aiSummary}
          </Text>
        )}

        {hasRealSummary &&
          detail.aiActionItems &&
          detail.aiActionItems.length > 0 && (
            <Box className="space-y-1">
              <Text
                variant="caption"
                className="text-content-subtle uppercase tracking-wide"
              >
                Action items
              </Text>
              <Box as="ul" className="list-disc pl-5 space-y-1">
                {detail.aiActionItems.map((item, i) => (
                  <Box as="li" key={i}>
                    <Text variant="body-sm" className="text-content">
                      {item}
                    </Text>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

        {!hasRealSummary && !placeholder && (
          <Text variant="body-sm" className="text-content-subtle">
            No summary yet. Generate one from the transcript.
          </Text>
        )}
      </Box>
    </Box>
  );
}
RecordingDetail.displayName = "RecordingDetail";

// ─── Recordings panel ────────────────────────────────────────────────────────

function RecordingsPanel({ room }: { room: MeetingRoomData }): ReactNode {
  const [recordings, setRecordings] = useState<RecordingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openRecordingId, setOpenRecordingId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await videoMeetingsApi.listRecordings(room.id, { limit: 20 });
      setRecordings(res.data);
      setCursor(res.cursor);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [room.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleLoadMore(): Promise<void> {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await videoMeetingsApi.listRecordings(room.id, {
        limit: 20,
        cursor,
      });
      setRecordings((prev) => [...prev, ...res.data]);
      setCursor(res.cursor);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Box
      className="space-y-3 rounded-lg border border-border bg-surface-raised p-4"
      aria-label={`Recordings for ${room.name}`}
    >
      {loading && <LoadingSkeleton rows={2} />}
      {!loading && error && (
        <ErrorBanner message={error} onRetry={() => void load()} />
      )}
      {!loading && !error && recordings.length === 0 && (
        <Box className="py-6 text-center">
          <Text variant="body-sm" className="text-content-subtle">
            No recordings yet.
            {!room.recordingEnabled &&
              " Enable cloud recording in room settings to capture meetings."}
          </Text>
        </Box>
      )}
      {!loading && !error && recordings.length > 0 && (
        <Box className="space-y-2">
          {recordings.map((rec) => (
            <Box key={rec.id} className="space-y-2">
              <Box className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
                <Box className="min-w-0 flex-1">
                  <Text
                    variant="body-sm"
                    className="font-medium text-content truncate"
                  >
                    {rec.title ?? "Untitled recording"}
                  </Text>
                  <Text variant="caption" className="text-content-subtle">
                    {formatDuration(rec.duration)} · {formatBytes(rec.size)} ·{" "}
                    {formatDate(rec.recordedAt ?? rec.createdAt)}
                    {rec.hasSummary && " · Summarized"}
                  </Text>
                </Box>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setOpenRecordingId((prev) =>
                      prev === rec.id ? null : rec.id,
                    )
                  }
                  aria-expanded={openRecordingId === rec.id}
                  aria-label={`${openRecordingId === rec.id ? "Hide" : "View"} details for ${rec.title ?? "untitled recording"}`}
                >
                  {openRecordingId === rec.id ? "Hide" : "View"}
                </Button>
              </Box>
              {openRecordingId === rec.id && (
                <RecordingDetail
                  recordingId={rec.id}
                  onClose={() => setOpenRecordingId(null)}
                />
              )}
            </Box>
          ))}
          {hasMore && (
            <Box className="pt-1 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleLoadMore()}
                loading={loadingMore}
              >
                Load more recordings
              </Button>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
RecordingsPanel.displayName = "RecordingsPanel";

// ─── Room card ───────────────────────────────────────────────────────────────

type RoomPanel = "schedule" | "recordings" | "settings" | null;

function RoomCard({
  room,
  onUpdated,
  onDeleted,
}: {
  room: MeetingRoomData;
  onUpdated: (id: string, patch: Partial<MeetingRoomData>) => void;
  onDeleted: (id: string) => void;
}): ReactNode {
  const [panel, setPanel] = useState<RoomPanel>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function togglePanel(next: Exclude<RoomPanel, null>): void {
    setPanel((prev) => (prev === next ? null : next));
  }

  async function handleDelete(): Promise<void> {
    if (
      !confirm(
        `Delete meeting room "${room.name}"? Its join link will stop working.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await videoMeetingsApi.deleteRoom(room.id);
      onDeleted(room.id);
    } catch (err) {
      setDeleteError(errMsg(err));
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <Box className="space-y-3">
          {deleteError && <ErrorBanner message={deleteError} />}

          {/* Header row */}
          <Box className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <Box className="min-w-0">
              <Box className="flex items-center gap-2 flex-wrap">
                <Text variant="heading-sm" className="font-semibold text-content">
                  {room.name}
                </Text>
                {room.isPersonal && (
                  <Box
                    as="span"
                    className="inline-flex items-center rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-xs font-medium"
                  >
                    Personal
                  </Box>
                )}
              </Box>
              <Text variant="caption" className="text-content-subtle break-all">
                {room.joinLink}
              </Text>
            </Box>
            <Box className="flex items-center gap-2 flex-shrink-0">
              <CopyButton value={room.joinLink} label={`join link for ${room.name}`} />
              <Button
                variant="primary"
                size="sm"
                onClick={() => window.open(room.joinLink, "_blank", "noopener")}
                aria-label={`Join ${room.name}`}
              >
                Join
              </Button>
            </Box>
          </Box>

          {/* Feature pills */}
          <Box className="flex flex-wrap items-center gap-2">
            <FeaturePill label="Waiting room" on={room.waitingRoomEnabled} />
            <FeaturePill label="Recording" on={room.recordingEnabled} />
            <FeaturePill label="Transcription" on={room.transcriptionEnabled} />
            <Box
              as="span"
              className="inline-flex items-center rounded-full bg-surface-raised border border-border text-content-subtle px-2 py-0.5 text-xs font-medium"
            >
              Up to {room.maxParticipants} participants
            </Box>
          </Box>

          {/* Actions */}
          <Box className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => togglePanel("schedule")}
              aria-expanded={panel === "schedule"}
            >
              Schedule
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => togglePanel("recordings")}
              aria-expanded={panel === "recordings"}
            >
              Recordings
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => togglePanel("settings")}
              aria-expanded={panel === "settings"}
            >
              Settings
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="text-red-600 hover:text-red-700 ml-auto"
              aria-label={`Delete room ${room.name}`}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </Box>

          {/* Expandable panels */}
          {panel === "schedule" && (
            <ScheduleMeetingForm room={room} onCancel={() => setPanel(null)} />
          )}
          {panel === "recordings" && <RecordingsPanel room={room} />}
          {panel === "settings" && (
            <RoomSettingsForm
              room={room}
              onUpdated={(patch) => {
                onUpdated(room.id, patch);
                setPanel(null);
              }}
              onCancel={() => setPanel(null)}
            />
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
RoomCard.displayName = "RoomCard";

// ─── Inner page (inside plan gate) ───────────────────────────────────────────

function MeetContent(): ReactNode {
  const [rooms, setRooms] = useState<MeetingRoomData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [instant, setInstant] = useState<InstantMeetingData | null>(null);
  const [instantLoading, setInstantLoading] = useState(false);
  const [instantError, setInstantError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await videoMeetingsApi.listRooms({ limit: 20 });
      setRooms(res.data);
      setCursor(res.cursor);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleLoadMore(): Promise<void> {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await videoMeetingsApi.listRooms({ limit: 20, cursor });
      setRooms((prev) => [...prev, ...res.data]);
      setCursor(res.cursor);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleInstant(): Promise<void> {
    setInstantLoading(true);
    setInstantError(null);
    try {
      const res = await videoMeetingsApi.createInstant();
      setInstant(res.data);
      // Instant meetings create a room server-side — refresh the list so it appears.
      void load();
    } catch (err) {
      setInstantError(errMsg(err));
    } finally {
      setInstantLoading(false);
    }
  }

  function handleRoomUpdated(id: string, patch: Partial<MeetingRoomData>): void {
    setRooms((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  function handleRoomDeleted(id: string): void {
    setRooms((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <Box className="space-y-6">
      {/* Action bar */}
      <Box className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="md"
          onClick={() => void handleInstant()}
          loading={instantLoading}
        >
          Start instant meeting
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={() => setShowCreate((v) => !v)}
          aria-expanded={showCreate}
        >
          {showCreate ? "Close" : "New room"}
        </Button>
      </Box>

      {instantError && (
        <ErrorBanner
          message={instantError}
          onRetry={() => void handleInstant()}
        />
      )}
      {instant && (
        <InstantMeetingBanner
          meeting={instant}
          onDismiss={() => setInstant(null)}
        />
      )}

      {showCreate && (
        <CreateRoomForm
          onCreated={(room) => {
            setRooms((prev) => [room, ...prev]);
            setShowCreate(false);
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Rooms */}
      {loading && <LoadingSkeleton rows={3} />}
      {!loading && error && (
        <ErrorBanner message={error} onRetry={() => void load()} />
      )}
      {!loading && !error && rooms.length === 0 && (
        <Card>
          <CardContent>
            <Box className="py-10 text-center space-y-2">
              <Text variant="heading-sm" className="font-semibold text-content">
                No meeting rooms yet
              </Text>
              <Text variant="body-sm" className="text-content-subtle">
                Create a permanent room with a reusable link, or start an
                instant meeting right now.
              </Text>
            </Box>
          </CardContent>
        </Card>
      )}
      {!loading && !error && rooms.length > 0 && (
        <Box className="space-y-4" aria-label="Meeting rooms">
          {rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              onUpdated={handleRoomUpdated}
              onDeleted={handleRoomDeleted}
            />
          ))}
          {hasMore && (
            <Box className="text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleLoadMore()}
                loading={loadingMore}
              >
                Load more rooms
              </Button>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
MeetContent.displayName = "MeetContent";

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MeetPage(): ReactNode {
  return (
    <PageLayout
      title="AlecRae Meet"
      description="Video meeting rooms with recordings, transcripts, and AI summaries."
    >
      <PlanGate feature="video_meetings" required="pro">
        <MeetContent />
      </PlanGate>
    </PageLayout>
  );
}
