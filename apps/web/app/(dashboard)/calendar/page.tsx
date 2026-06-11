"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Text,
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  CardFooter,
  PageLayout,
} from "@alecrae/ui";
import {
  calendarEventsApi,
  type CalendarEventData,
  type TodayAgendaData,
  type FindTimeSlotData,
} from "../../../lib/api-features";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatEventTime(startIso: string, endIso: string, allDay: boolean): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const day = start.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (allDay) return `${day} · All day`;
  const fmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${day} · ${start.toLocaleTimeString("en-US", fmt)} – ${end.toLocaleTimeString("en-US", fmt)}`;
}

/** Convert a datetime-local input value to an ISO 8601 string. */
function localToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CalendarPage(): React.ReactNode {
  const [today, setToday] = useState<TodayAgendaData | null>(null);
  const [events, setEvents] = useState<CalendarEventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<{ startAt: string; endAt: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const nowIso = new Date().toISOString();
      const [todayRes, listRes] = await Promise.all([
        calendarEventsApi.today().catch(() => ({ data: null })),
        calendarEventsApi.list({ startAfter: nowIso, limit: 50 }),
      ]);
      setToday(todayRes.data);
      setEvents(listRes.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await calendarEventsApi.remove(id);
      setEvents((prev) => prev.filter((e) => e.id !== id));
      setDeleteConfirmId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete event");
    }
  };

  const actions = (
    <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
      New Event
    </Button>
  );

  return (
    <PageLayout
      title="Calendar"
      description="Upcoming events, AI agenda, and smart scheduling."
      actions={actions}
    >
      {error && (
        <Box className="mb-4 rounded-md border border-red-200 bg-red-50 p-3" role="alert">
          <Text variant="body-sm" className="text-red-800">
            {error}
          </Text>
        </Box>
      )}

      {showCreate && (
        <CreateEventForm
          prefill={prefill}
          onClose={() => {
            setShowCreate(false);
            setPrefill(null);
          }}
          onCreated={() => {
            setShowCreate(false);
            setPrefill(null);
            void load();
          }}
        />
      )}

      {loading ? (
        <Box className="space-y-4" aria-busy="true" aria-label="Loading calendar">
          {[1, 2, 3].map((i) => (
            <Box key={i} className="h-20 animate-pulse rounded-lg bg-surface-secondary" />
          ))}
        </Box>
      ) : (
        <Box className="space-y-6">
          {today && (
            <Card className="border-accent/30">
              <CardContent>
                <Text variant="caption" muted>
                  Today · {today.date}
                </Text>
                <Text variant="body-md" className="mt-1">
                  {today.aiAgenda}
                </Text>
              </CardContent>
            </Card>
          )}

          {events.length === 0 ? (
            <Card>
              <CardContent>
                <Box className="py-8 text-center">
                  <Text variant="heading-sm" muted className="mb-2">
                    No upcoming events
                  </Text>
                  <Text variant="body-sm" muted>
                    Create your first event or use Find a time below.
                  </Text>
                </Box>
              </CardContent>
            </Card>
          ) : (
            <Box className="space-y-3">
              <Text variant="heading-sm">Upcoming</Text>
              {events.map((event) => (
                <Card key={event.id} className="border-border">
                  <CardContent>
                    <Box className="flex items-start justify-between gap-4">
                      <Box className="min-w-0 flex-1">
                        <Box className="flex items-center gap-2">
                          <Text variant="body-md" className="font-semibold truncate">
                            {event.title}
                          </Text>
                          {event.status !== "confirmed" && (
                            <Box className="rounded-full bg-surface-secondary px-2 py-0.5">
                              <Text variant="caption" muted>
                                {event.status}
                              </Text>
                            </Box>
                          )}
                        </Box>
                        <Text variant="body-sm" muted className="mt-0.5">
                          {formatEventTime(event.startAt, event.endAt, event.allDay)}
                          {event.location ? ` · ${event.location}` : ""}
                        </Text>
                        {event.description && (
                          <Text variant="caption" muted className="mt-1 block truncate">
                            {event.description}
                          </Text>
                        )}
                      </Box>
                      <Box className="flex shrink-0 items-center gap-2">
                        {deleteConfirmId === event.id ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(event.id)}
                              className="text-red-600 hover:bg-red-50"
                            >
                              Confirm
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirmId(null)}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirmId(event.id)}
                            className="text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </Button>
                        )}
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}

          <FindTimeSection
            onPickSlot={(slot) => {
              setPrefill({ startAt: slot.startAt, endAt: slot.endAt });
              setShowCreate(true);
              window.scrollTo({ top: 0 });
            }}
          />
        </Box>
      )}
    </PageLayout>
  );
}

// ─── Create event form ───────────────────────────────────────────────────────

/** ISO → value usable by <input type="datetime-local"> (local time). */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CreateEventForm({
  prefill,
  onClose,
  onCreated,
}: {
  prefill: { startAt: string; endAt: string } | null;
  onClose: () => void;
  onCreated: () => void;
}): React.ReactNode {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(prefill ? isoToLocalInput(prefill.startAt) : "");
  const [end, setEnd] = useState(prefill ? isoToLocalInput(prefill.endAt) : "");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (): Promise<void> => {
    const startIso = localToIso(start);
    const endIso = localToIso(end);
    if (!title.trim() || !startIso || !endIso) {
      setFormError("Title, start, and end are required.");
      return;
    }
    if (new Date(endIso) <= new Date(startIso)) {
      setFormError("End must be after start.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await calendarEventsApi.create({
        title: title.trim(),
        startAt: startIso,
        endAt: endIso,
        ...(location.trim() ? { location: location.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      onCreated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-6 border-border">
      <CardHeader>
        <Text variant="heading-sm">Create event</Text>
      </CardHeader>
      <CardContent>
        {formError && (
          <Box className="mb-3 rounded border border-red-200 bg-red-50 p-2" role="alert">
            <Text variant="body-sm" className="text-red-800">
              {formError}
            </Text>
          </Box>
        )}
        <Box className="space-y-4">
          <Input
            label="Title"
            variant="text"
            placeholder="e.g. Quarterly review"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Box className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Box>
              <Text variant="body-sm" className="mb-1 font-medium text-content">
                Starts
              </Text>
              <input
                type="datetime-local"
                className="w-full rounded-md border border-border bg-surface p-2.5 text-sm text-content focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                aria-label="Event start"
              />
            </Box>
            <Box>
              <Text variant="body-sm" className="mb-1 font-medium text-content">
                Ends
              </Text>
              <input
                type="datetime-local"
                className="w-full rounded-md border border-border bg-surface p-2.5 text-sm text-content focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                aria-label="Event end"
              />
            </Box>
          </Box>
          <Input
            label="Location (optional)"
            variant="text"
            placeholder="e.g. Meeting Room 2 or video link"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <Box>
            <Text variant="body-sm" className="mb-1 font-medium text-content">
              Description (optional)
            </Text>
            <textarea
              className="w-full rounded-md border border-border bg-surface p-3 text-sm text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label="Event description"
            />
          </Box>
        </Box>
      </CardContent>
      <CardFooter>
        <Box className="flex items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={saving || !title.trim() || !start || !end}
          >
            {saving ? "Creating..." : "Create Event"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </Box>
      </CardFooter>
    </Card>
  );
}

CreateEventForm.displayName = "CreateEventForm";

// ─── Find a time ─────────────────────────────────────────────────────────────

function FindTimeSection({
  onPickSlot,
}: {
  onPickSlot: (slot: FindTimeSlotData) => void;
}): React.ReactNode {
  const [emails, setEmails] = useState("");
  const [duration, setDuration] = useState("30");
  const [slots, setSlots] = useState<FindTimeSlotData[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);

  const handleFind = async (): Promise<void> => {
    const attendeeEmails = emails
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (attendeeEmails.length === 0) {
      setFindError("Enter at least one attendee email.");
      return;
    }
    const durationMinutes = Number.parseInt(duration, 10);
    if (Number.isNaN(durationMinutes) || durationMinutes < 15) {
      setFindError("Duration must be at least 15 minutes.");
      return;
    }
    setSearching(true);
    setFindError(null);
    try {
      const res = await calendarEventsApi.findTime({ attendeeEmails, durationMinutes });
      setSlots(res.data.suggestedSlots);
      setNote(res.data.note);
    } catch (err) {
      setFindError(err instanceof Error ? err.message : "Failed to find time slots");
    } finally {
      setSearching(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">Find a time</Text>
        <Text variant="body-sm" muted>
          AI suggests meeting slots based on attendee availability.
        </Text>
      </CardHeader>
      <CardContent>
        {findError && (
          <Box className="mb-3 rounded border border-red-200 bg-red-50 p-2" role="alert">
            <Text variant="body-sm" className="text-red-800">
              {findError}
            </Text>
          </Box>
        )}
        <Box className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Box className="flex-1">
            <Input
              label="Attendee emails (comma separated)"
              variant="text"
              placeholder="alice@example.com, bob@example.com"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
            />
          </Box>
          <Box className="w-32">
            <Input
              label="Minutes"
              variant="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </Box>
          <Button variant="secondary" size="sm" onClick={handleFind} disabled={searching}>
            {searching ? "Searching..." : "Find slots"}
          </Button>
        </Box>

        {slots.length > 0 && (
          <Box className="mt-4 space-y-2">
            {slots.map((slot) => (
              <Box
                key={slot.startAt}
                className="flex items-center justify-between gap-4 rounded-lg bg-surface-secondary p-3"
              >
                <Box>
                  <Text variant="body-sm" className="font-medium">
                    {formatEventTime(slot.startAt, slot.endAt, false)}
                  </Text>
                  <Text variant="caption" muted>
                    {Math.round(slot.confidence * 100)}% confidence
                  </Text>
                </Box>
                <Button variant="secondary" size="sm" onClick={() => onPickSlot(slot)}>
                  Use this slot
                </Button>
              </Box>
            ))}
            {note && (
              <Text variant="caption" muted>
                {note}
              </Text>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

FindTimeSection.displayName = "FindTimeSection";
