import type { Metadata } from "next";
import { PageHeader } from "../components/page-header";
import { EndpointCard } from "../components/endpoint-card";

export const metadata: Metadata = {
  title: "Calendar — AlecRae API Docs",
  description: "Calendar events, scheduling, and availability through the AlecRae API.",
};

export default function CalendarPage(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-4xl mx-auto">
      <PageHeader
        title="Calendar"
        description="Manage calendar events, check availability, and create scheduling links. Integrates with Google Calendar and Microsoft Outlook."
        badge="Features"
      />

      <section className="space-y-4">
        <EndpointCard
          method="GET"
          path="/v1/calendar/events"
          description="Returns a list of calendar events within the specified time range. Aggregates events from all connected calendar providers."
          scopes={["calendar:read"]}
          parameters={[
            { name: "from", type: "datetime", required: false, description: "Start of range (ISO 8601, defaults to now)" },
            { name: "to", type: "datetime", required: false, description: "End of range (ISO 8601, defaults to 7 days from now)" },
            { name: "calendar_id", type: "string", required: false, description: "Filter by specific calendar" },
            { name: "limit", type: "integer", required: false, description: "Max events to return (1-100, default 50)" },
          ]}
          curlExample={`curl "https://api.alecrae.com/v1/calendar/events?from=2026-04-09T00:00:00Z&to=2026-04-16T00:00:00Z" \\
  -H "Authorization: Bearer $ALECRAE_API_KEY"`}
          jsExample={`const response = await fetch(
  "https://api.alecrae.com/v1/calendar/events?" + new URLSearchParams({
    from: "2026-04-09T00:00:00Z",
    to: "2026-04-16T00:00:00Z",
  }),
  {
    headers: { "Authorization": "Bearer " + process.env.ALECRAE_API_KEY },
  }
);

const { data } = await response.json();`}
          pythonExample={`response = requests.get(
    "https://api.alecrae.com/v1/calendar/events",
    headers={"Authorization": f"Bearer {ALECRAE_API_KEY}"},
    params={
        "from": "2026-04-09T00:00:00Z",
        "to": "2026-04-16T00:00:00Z",
    },
)

events = response.json()["data"]`}
          responseExample={`{
  "data": [
    {
      "id": "evt_01HXab...",
      "title": "Team standup",
      "description": "Daily sync with engineering team",
      "start": "2026-04-09T09:00:00.000Z",
      "end": "2026-04-09T09:30:00.000Z",
      "location": "https://meet.google.com/abc-defg-hij",
      "attendees": [
        { "email": "alice@example.com", "status": "accepted" },
        { "email": "bob@example.com", "status": "tentative" }
      ],
      "calendar": "Work",
      "provider": "google",
      "recurring": true
    }
  ]
}`}
        />

        <EndpointCard
          method="POST"
          path="/v1/calendar/events"
          description="Create a new calendar event. Sends invitations to all attendees."
          scopes={["calendar:write"]}
          parameters={[
            { name: "title", type: "string", required: true, description: "Event title" },
            { name: "start", type: "datetime", required: true, description: "Start time (ISO 8601)" },
            { name: "end", type: "datetime", required: true, description: "End time (ISO 8601)" },
            { name: "description", type: "string", required: false, description: "Event description" },
            { name: "location", type: "string", required: false, description: "Location or meeting URL" },
            { name: "attendees", type: "string[]", required: false, description: "Attendee email addresses" },
            { name: "calendar_id", type: "string", required: false, description: "Target calendar (defaults to primary)" },
          ]}
          requestBody={`{
  "title": "Project review",
  "start": "2026-04-10T14:00:00Z",
  "end": "2026-04-10T15:00:00Z",
  "description": "Review Q2 deliverables",
  "attendees": ["alice@example.com", "bob@example.com"],
  "location": "Conference Room B"
}`}
          curlExample={`curl -X POST https://api.alecrae.com/v1/calendar/events \\
  -H "Authorization: Bearer $ALECRAE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Project review",
    "start": "2026-04-10T14:00:00Z",
    "end": "2026-04-10T15:00:00Z",
    "attendees": ["alice@example.com"]
  }'`}
          jsExample={`const response = await fetch("https://api.alecrae.com/v1/calendar/events", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    title: "Project review",
    start: "2026-04-10T14:00:00Z",
    end: "2026-04-10T15:00:00Z",
    attendees: ["alice@example.com"],
  }),
});

const { data } = await response.json();`}
          pythonExample={`response = requests.post(
    "https://api.alecrae.com/v1/calendar/events",
    headers={
        "Authorization": f"Bearer {ALECRAE_API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "title": "Project review",
        "start": "2026-04-10T14:00:00Z",
        "end": "2026-04-10T15:00:00Z",
        "attendees": ["alice@example.com"],
    },
)

event = response.json()["data"]`}
          responseExample={`{
  "data": {
    "id": "evt_01HXcd...",
    "title": "Project review",
    "start": "2026-04-10T14:00:00.000Z",
    "end": "2026-04-10T15:00:00.000Z",
    "attendees": [
      { "email": "alice@example.com", "status": "pending" }
    ],
    "createdAt": "2026-04-09T12:00:00.000Z"
  }
}`}
        />

        <EndpointCard
          method="GET"
          path="/v1/calendar/availability"
          description="Check free/busy availability for one or more participants in a given time range. Useful for scheduling."
          scopes={["calendar:read"]}
          parameters={[
            { name: "emails", type: "string", required: true, description: "Comma-separated email addresses" },
            { name: "from", type: "datetime", required: true, description: "Start of range (ISO 8601)" },
            { name: "to", type: "datetime", required: true, description: "End of range (ISO 8601)" },
            { name: "duration", type: "integer", required: false, description: "Desired meeting duration in minutes (default 30)" },
          ]}
          curlExample={`curl "https://api.alecrae.com/v1/calendar/availability?emails=alice@example.com,bob@example.com&from=2026-04-10T08:00:00Z&to=2026-04-10T18:00:00Z&duration=60" \\
  -H "Authorization: Bearer $ALECRAE_API_KEY"`}
          jsExample={`const response = await fetch(
  "https://api.alecrae.com/v1/calendar/availability?" + new URLSearchParams({
    emails: "alice@example.com,bob@example.com",
    from: "2026-04-10T08:00:00Z",
    to: "2026-04-10T18:00:00Z",
    duration: "60",
  }),
  {
    headers: { "Authorization": "Bearer " + process.env.ALECRAE_API_KEY },
  }
);

const { data } = await response.json();`}
          pythonExample={`response = requests.get(
    "https://api.alecrae.com/v1/calendar/availability",
    headers={"Authorization": f"Bearer {ALECRAE_API_KEY}"},
    params={
        "emails": "alice@example.com,bob@example.com",
        "from": "2026-04-10T08:00:00Z",
        "to": "2026-04-10T18:00:00Z",
        "duration": 60,
    },
)

slots = response.json()["data"]`}
          responseExample={`{
  "data": {
    "slots": [
      { "start": "2026-04-10T10:00:00Z", "end": "2026-04-10T11:00:00Z" },
      { "start": "2026-04-10T14:00:00Z", "end": "2026-04-10T15:00:00Z" },
      { "start": "2026-04-10T16:00:00Z", "end": "2026-04-10T17:00:00Z" }
    ],
    "participants": {
      "alice@example.com": { "busySlots": 4 },
      "bob@example.com": { "busySlots": 6 }
    }
  }
}`}
        />
      </section>
    </div>
  );
}
