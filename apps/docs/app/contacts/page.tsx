import type { Metadata } from "next";
import { PageHeader } from "../components/page-header";
import { EndpointCard } from "../components/endpoint-card";

export const metadata: Metadata = {
  title: "Contacts — Vienna API Docs",
  description: "Contact management, address book, and contact search through the Vienna API.",
};

export default function ContactsPage(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-4xl mx-auto">
      <PageHeader
        title="Contacts"
        description="Manage your address book. Create, update, search, and delete contacts. Contacts are automatically enriched with interaction history."
        badge="Features"
      />

      <section className="space-y-4">
        <EndpointCard
          method="GET"
          path="/v1/contacts"
          description="Returns a paginated list of contacts. Supports filtering by group, search query, and sort order."
          scopes={["contacts:read"]}
          parameters={[
            { name: "cursor", type: "string", required: false, description: "Pagination cursor" },
            { name: "limit", type: "integer", required: false, description: "Max items to return (1-100, default 20)" },
            { name: "q", type: "string", required: false, description: "Search by name or email" },
            { name: "group", type: "string", required: false, description: "Filter by contact group" },
            { name: "sort", type: "string", required: false, description: "Sort by: name, email, lastContacted, createdAt" },
          ]}
          curlExample={`curl "https://api.48co.ai/v1/contacts?q=alice&limit=10" \\
  -H "Authorization: Bearer $VIENNA_API_KEY"`}
          jsExample={`const response = await fetch(
  "https://api.48co.ai/v1/contacts?q=alice&limit=10",
  {
    headers: {
      "Authorization": "Bearer " + process.env.VIENNA_API_KEY,
    },
  }
);

const { data, cursor, hasMore } = await response.json();`}
          pythonExample={`response = requests.get(
    "https://api.48co.ai/v1/contacts",
    headers={"Authorization": f"Bearer {VIENNA_API_KEY}"},
    params={"q": "alice", "limit": 10},
)

contacts = response.json()["data"]`}
          responseExample={`{
  "data": [
    {
      "id": "ct_01HXab...",
      "name": "Alice Johnson",
      "email": "alice@example.com",
      "company": "Acme Corp",
      "title": "Engineering Manager",
      "groups": ["work", "vip"],
      "lastContacted": "2026-04-08T16:00:00.000Z",
      "interactionCount": 42,
      "createdAt": "2026-01-15T10:00:00.000Z"
    }
  ],
  "cursor": "eyJpZCI6ImN0Xy4...",
  "hasMore": false
}`}
        />

        <EndpointCard
          method="POST"
          path="/v1/contacts"
          description="Create a new contact. Duplicate emails are rejected with a 409 Conflict."
          scopes={["contacts:write"]}
          parameters={[
            { name: "email", type: "string", required: true, description: "Email address" },
            { name: "name", type: "string", required: false, description: "Full name" },
            { name: "company", type: "string", required: false, description: "Company name" },
            { name: "title", type: "string", required: false, description: "Job title" },
            { name: "phone", type: "string", required: false, description: "Phone number" },
            { name: "groups", type: "string[]", required: false, description: "Contact groups" },
            { name: "notes", type: "string", required: false, description: "Free-form notes" },
            { name: "metadata", type: "object", required: false, description: "Custom key-value pairs" },
          ]}
          requestBody={`{
  "email": "alice@example.com",
  "name": "Alice Johnson",
  "company": "Acme Corp",
  "title": "Engineering Manager",
  "groups": ["work", "vip"],
  "notes": "Met at the conference in March"
}`}
          curlExample={`curl -X POST https://api.48co.ai/v1/contacts \\
  -H "Authorization: Bearer $VIENNA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "alice@example.com",
    "name": "Alice Johnson",
    "company": "Acme Corp",
    "groups": ["work"]
  }'`}
          jsExample={`const response = await fetch("https://api.48co.ai/v1/contacts", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.VIENNA_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email: "alice@example.com",
    name: "Alice Johnson",
    company: "Acme Corp",
    groups: ["work"],
  }),
});

const { data } = await response.json();`}
          pythonExample={`response = requests.post(
    "https://api.48co.ai/v1/contacts",
    headers={
        "Authorization": f"Bearer {VIENNA_API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "email": "alice@example.com",
        "name": "Alice Johnson",
        "company": "Acme Corp",
        "groups": ["work"],
    },
)

contact = response.json()["data"]`}
          responseExample={`{
  "data": {
    "id": "ct_01HXab...",
    "email": "alice@example.com",
    "name": "Alice Johnson",
    "company": "Acme Corp",
    "groups": ["work"],
    "createdAt": "2026-04-09T12:00:00.000Z"
  }
}`}
        />

        <EndpointCard
          method="GET"
          path="/v1/contacts/{id}"
          description="Retrieve a single contact with full details including interaction history and enrichment data."
          scopes={["contacts:read"]}
          parameters={[
            { name: "id", type: "string", required: true, description: "Contact ID (path parameter)" },
          ]}
          curlExample={`curl "https://api.48co.ai/v1/contacts/ct_01HXab" \\
  -H "Authorization: Bearer $VIENNA_API_KEY"`}
          jsExample={`const response = await fetch(
  "https://api.48co.ai/v1/contacts/ct_01HXab",
  {
    headers: { "Authorization": "Bearer " + process.env.VIENNA_API_KEY },
  }
);

const { data } = await response.json();`}
          pythonExample={`response = requests.get(
    "https://api.48co.ai/v1/contacts/ct_01HXab",
    headers={"Authorization": f"Bearer {VIENNA_API_KEY}"},
)

contact = response.json()["data"]`}
          responseExample={`{
  "data": {
    "id": "ct_01HXab...",
    "email": "alice@example.com",
    "name": "Alice Johnson",
    "company": "Acme Corp",
    "title": "Engineering Manager",
    "groups": ["work", "vip"],
    "notes": "Met at the conference in March",
    "lastContacted": "2026-04-08T16:00:00.000Z",
    "interactionCount": 42,
    "createdAt": "2026-01-15T10:00:00.000Z",
    "updatedAt": "2026-04-08T16:00:00.000Z"
  }
}`}
        />

        <EndpointCard
          method="PUT"
          path="/v1/contacts/{id}"
          description="Update an existing contact. Only provided fields are updated (partial update)."
          scopes={["contacts:write"]}
          parameters={[
            { name: "id", type: "string", required: true, description: "Contact ID (path parameter)" },
          ]}
          requestBody={`{
  "company": "New Corp",
  "groups": ["work", "vip", "partners"]
}`}
          curlExample={`curl -X PUT "https://api.48co.ai/v1/contacts/ct_01HXab" \\
  -H "Authorization: Bearer $VIENNA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "company": "New Corp", "groups": ["work", "vip", "partners"] }'`}
          jsExample={`await fetch("https://api.48co.ai/v1/contacts/ct_01HXab", {
  method: "PUT",
  headers: {
    "Authorization": "Bearer " + process.env.VIENNA_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    company: "New Corp",
    groups: ["work", "vip", "partners"],
  }),
});`}
          pythonExample={`requests.put(
    "https://api.48co.ai/v1/contacts/ct_01HXab",
    headers={
        "Authorization": f"Bearer {VIENNA_API_KEY}",
        "Content-Type": "application/json",
    },
    json={"company": "New Corp", "groups": ["work", "vip", "partners"]},
)`}
          responseExample={`{
  "data": {
    "id": "ct_01HXab...",
    "email": "alice@example.com",
    "name": "Alice Johnson",
    "company": "New Corp",
    "groups": ["work", "vip", "partners"],
    "updatedAt": "2026-04-09T12:30:00.000Z"
  }
}`}
        />

        <EndpointCard
          method="DELETE"
          path="/v1/contacts/{id}"
          description="Delete a contact. The contact enters a 30-day soft-delete window before permanent removal."
          scopes={["contacts:write"]}
          parameters={[
            { name: "id", type: "string", required: true, description: "Contact ID (path parameter)" },
          ]}
          curlExample={`curl -X DELETE "https://api.48co.ai/v1/contacts/ct_01HXab" \\
  -H "Authorization: Bearer $VIENNA_API_KEY"`}
          jsExample={`await fetch("https://api.48co.ai/v1/contacts/ct_01HXab", {
  method: "DELETE",
  headers: { "Authorization": "Bearer " + process.env.VIENNA_API_KEY },
});`}
          pythonExample={`requests.delete(
    "https://api.48co.ai/v1/contacts/ct_01HXab",
    headers={"Authorization": f"Bearer {VIENNA_API_KEY}"},
)`}
          responseExample={`{
  "success": true,
  "message": "Contact deleted (30-day soft-delete window)"
}`}
        />
      </section>
    </div>
  );
}
