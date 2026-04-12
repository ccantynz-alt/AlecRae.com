import type { Metadata } from "next";
import { PageHeader } from "../components/page-header";
import { EndpointCard } from "../components/endpoint-card";

export const metadata: Metadata = {
  title: "Threads — AlecRae API Docs",
  description: "Thread-level operations, conversation view, thread summaries, and labeling.",
};

export default function ThreadsPage(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-4xl mx-auto">
      <PageHeader
        title="Threads"
        description="Threads group related messages into conversations. List threads, get thread details, archive, label, and get AI-generated summaries."
        badge="Email"
      />

      <section className="space-y-4">
        <EndpointCard
          method="GET"
          path="/v1/threads"
          description="Returns a paginated list of email threads for the authenticated user. Threads are sorted by most recent message. Supports filtering by label, mailbox, and unread status."
          scopes={["messages:read"]}
          parameters={[
            { name: "cursor", type: "string", required: false, description: "Pagination cursor" },
            { name: "limit", type: "integer", required: false, description: "Max items to return (1-100, default 20)" },
            { name: "mailbox", type: "string", required: false, description: "Filter by mailbox: inbox, sent, drafts, trash, spam, archive" },
            { name: "label", type: "string", required: false, description: "Filter by label" },
            { name: "unread", type: "boolean", required: false, description: "Filter by unread status" },
          ]}
          curlExample={`curl "https://api.alecrae.com/v1/threads?mailbox=inbox&unread=true&limit=20" \\
  -H "Authorization: Bearer $ALECRAE_API_KEY"`}
          jsExample={`const response = await fetch(
  "https://api.alecrae.com/v1/threads?mailbox=inbox&unread=true&limit=20",
  {
    headers: {
      "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    },
  }
);

const { data, cursor, hasMore } = await response.json();`}
          pythonExample={`response = requests.get(
    "https://api.alecrae.com/v1/threads",
    headers={"Authorization": f"Bearer {ALECRAE_API_KEY}"},
    params={"mailbox": "inbox", "unread": "true", "limit": 20},
)

result = response.json()
threads = result["data"]`}
          responseExample={`{
  "data": [
    {
      "id": "thr_01HXab...",
      "subject": "Re: Project update",
      "snippet": "Sounds good, let's sync tomorrow...",
      "participants": ["alice@example.com", "you@yourdomain.com"],
      "messageCount": 5,
      "unread": true,
      "labels": ["work", "important"],
      "lastMessageAt": "2026-04-09T14:30:00.000Z",
      "createdAt": "2026-04-07T09:00:00.000Z"
    }
  ],
  "cursor": "eyJpZCI6InRocl8...",
  "hasMore": true
}`}
        />

        <EndpointCard
          method="GET"
          path="/v1/threads/{id}"
          description="Retrieve a thread with all its messages, ordered chronologically. Includes full message bodies, headers, and attachment metadata."
          scopes={["messages:read"]}
          parameters={[
            { name: "id", type: "string", required: true, description: "Thread ID (path parameter)" },
          ]}
          curlExample={`curl "https://api.alecrae.com/v1/threads/thr_01HXab" \\
  -H "Authorization: Bearer $ALECRAE_API_KEY"`}
          jsExample={`const response = await fetch(
  "https://api.alecrae.com/v1/threads/thr_01HXab",
  {
    headers: {
      "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    },
  }
);

const { data } = await response.json();
console.log(data.subject, data.messages.length);`}
          pythonExample={`response = requests.get(
    "https://api.alecrae.com/v1/threads/thr_01HXab",
    headers={"Authorization": f"Bearer {ALECRAE_API_KEY}"},
)

thread = response.json()["data"]
print(thread["subject"], len(thread["messages"]))`}
          responseExample={`{
  "data": {
    "id": "thr_01HXab",
    "subject": "Re: Project update",
    "participants": ["alice@example.com", "you@yourdomain.com"],
    "labels": ["work"],
    "unread": false,
    "messages": [
      {
        "id": "msg_a1b2...",
        "from": "alice@example.com",
        "to": ["you@yourdomain.com"],
        "subject": "Project update",
        "text": "Here is the latest on the project...",
        "createdAt": "2026-04-07T09:00:00.000Z"
      },
      {
        "id": "msg_c3d4...",
        "from": "you@yourdomain.com",
        "to": ["alice@example.com"],
        "subject": "Re: Project update",
        "text": "Thanks, looks great. Let's sync tomorrow.",
        "createdAt": "2026-04-07T10:15:00.000Z"
      }
    ],
    "createdAt": "2026-04-07T09:00:00.000Z"
  }
}`}
        />

        <EndpointCard
          method="POST"
          path="/v1/threads/{id}/archive"
          description="Archive a thread. The thread is removed from the inbox but remains searchable and accessible."
          scopes={["messages:send"]}
          parameters={[
            { name: "id", type: "string", required: true, description: "Thread ID (path parameter)" },
          ]}
          curlExample={`curl -X POST "https://api.alecrae.com/v1/threads/thr_01HXab/archive" \\
  -H "Authorization: Bearer $ALECRAE_API_KEY"`}
          jsExample={`await fetch("https://api.alecrae.com/v1/threads/thr_01HXab/archive", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
  },
});`}
          pythonExample={`requests.post(
    "https://api.alecrae.com/v1/threads/thr_01HXab/archive",
    headers={"Authorization": f"Bearer {ALECRAE_API_KEY}"},
)`}
          responseExample={`{
  "success": true,
  "message": "Thread archived"
}`}
        />

        <EndpointCard
          method="PUT"
          path="/v1/threads/{id}/labels"
          description="Set labels on a thread. Replaces existing labels with the provided set."
          scopes={["messages:send"]}
          parameters={[
            { name: "id", type: "string", required: true, description: "Thread ID (path parameter)" },
            { name: "labels", type: "string[]", required: true, description: "Array of label names" },
          ]}
          requestBody={`{
  "labels": ["work", "important", "project-x"]
}`}
          curlExample={`curl -X PUT "https://api.alecrae.com/v1/threads/thr_01HXab/labels" \\
  -H "Authorization: Bearer $ALECRAE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "labels": ["work", "important", "project-x"] }'`}
          jsExample={`await fetch("https://api.alecrae.com/v1/threads/thr_01HXab/labels", {
  method: "PUT",
  headers: {
    "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ labels: ["work", "important", "project-x"] }),
});`}
          pythonExample={`requests.put(
    "https://api.alecrae.com/v1/threads/thr_01HXab/labels",
    headers={
        "Authorization": f"Bearer {ALECRAE_API_KEY}",
        "Content-Type": "application/json",
    },
    json={"labels": ["work", "important", "project-x"]},
)`}
          responseExample={`{
  "data": {
    "id": "thr_01HXab",
    "labels": ["work", "important", "project-x"]
  }
}`}
        />

        <EndpointCard
          method="GET"
          path="/v1/threads/{id}/summary"
          description="Get an AI-generated summary of the thread. Returns key points, action items, and commitments extracted from the conversation."
          scopes={["messages:read"]}
          parameters={[
            { name: "id", type: "string", required: true, description: "Thread ID (path parameter)" },
          ]}
          curlExample={`curl "https://api.alecrae.com/v1/threads/thr_01HXab/summary" \\
  -H "Authorization: Bearer $ALECRAE_API_KEY"`}
          jsExample={`const response = await fetch(
  "https://api.alecrae.com/v1/threads/thr_01HXab/summary",
  {
    headers: {
      "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    },
  }
);

const { data } = await response.json();
console.log(data.summary, data.actionItems);`}
          pythonExample={`response = requests.get(
    "https://api.alecrae.com/v1/threads/thr_01HXab/summary",
    headers={"Authorization": f"Bearer {ALECRAE_API_KEY}"},
)

summary = response.json()["data"]
print(summary["summary"])
print(summary["actionItems"])`}
          responseExample={`{
  "data": {
    "summary": "Alice shared the latest project update. You agreed to sync tomorrow to review the deliverables.",
    "actionItems": [
      "Schedule sync meeting with Alice for tomorrow",
      "Review project deliverables before the meeting"
    ],
    "commitments": [
      {
        "by": "you@yourdomain.com",
        "action": "Sync with Alice tomorrow",
        "dueDate": "2026-04-10"
      }
    ],
    "sentiment": "positive"
  }
}`}
        />
      </section>
    </div>
  );
}
