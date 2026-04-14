import type { Metadata } from "next";
import { PageHeader } from "../components/page-header";
import { EndpointCard } from "../components/endpoint-card";
import { Callout } from "../components/callout";

export const metadata: Metadata = {
  title: "Suppressions — AlecRae API Docs",
  description: "Suppression list management for bounces, complaints, and unsubscribes through the AlecRae API.",
};

export default function SuppressionsPage(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-4xl mx-auto">
      <PageHeader
        title="Suppressions"
        description="Manage the suppression list to prevent sending to addresses that have bounced, complained, or unsubscribed. AlecRae automatically adds bounces and complaints."
        badge="Email"
      />

      <Callout type="info" title="Automatic suppression">
        AlecRae automatically adds email addresses to the suppression list when a hard bounce or spam complaint is received.
        You can also manually add addresses to prevent future sends.
      </Callout>

      <section className="space-y-4 mt-8">
        <EndpointCard
          method="GET"
          path="/v1/suppressions"
          description="List suppressed email addresses with pagination and filtering by domain and reason."
          scopes={["messages:read"]}
          parameters={[
            { name: "cursor", type: "string", required: false, description: "Pagination cursor" },
            { name: "limit", type: "integer", required: false, description: "Max items (1-100, default 20)" },
            { name: "domain", type: "string", required: false, description: "Filter by sending domain" },
            { name: "reason", type: "string", required: false, description: "Filter by reason: bounce, complaint, unsubscribe, manual" },
          ]}
          curlExample={`curl "https://api.alecrae.com/v1/suppressions?reason=bounce&limit=20" \\
  -H "Authorization: Bearer $ALECRAE_API_KEY"`}
          jsExample={`const response = await fetch(
  "https://api.alecrae.com/v1/suppressions?reason=bounce&limit=20",
  { headers: { "Authorization": "Bearer " + process.env.ALECRAE_API_KEY } }
);

const { data } = await response.json();`}
          pythonExample={`response = requests.get(
    "https://api.alecrae.com/v1/suppressions",
    headers={"Authorization": f"Bearer {ALECRAE_API_KEY}"},
    params={"reason": "bounce", "limit": 20},
)

suppressions = response.json()["data"]`}
          responseExample={`{
  "data": [
    {
      "id": "sup_01HXab...",
      "email": "invalid@example.com",
      "domainId": "dom_01HXab...",
      "reason": "bounce",
      "bounceType": "hard",
      "createdAt": "2026-04-05T10:00:00.000Z"
    }
  ],
  "hasMore": false
}`}
        />

        <EndpointCard
          method="POST"
          path="/v1/suppressions"
          description="Manually add an email address to the suppression list. Useful for honoring external unsubscribe requests."
          scopes={["messages:send"]}
          parameters={[
            { name: "email", type: "string", required: true, description: "Email address to suppress" },
            { name: "domainId", type: "string", required: true, description: "Sending domain ID" },
            { name: "reason", type: "string", required: true, description: "Reason: bounce, complaint, unsubscribe, manual" },
          ]}
          requestBody={`{
  "email": "user@example.com",
  "domainId": "dom_01HXab...",
  "reason": "manual"
}`}
          curlExample={`curl -X POST https://api.alecrae.com/v1/suppressions \\
  -H "Authorization: Bearer $ALECRAE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "user@example.com",
    "domainId": "dom_01HXab",
    "reason": "manual"
  }'`}
          jsExample={`const response = await fetch("https://api.alecrae.com/v1/suppressions", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email: "user@example.com",
    domainId: "dom_01HXab",
    reason: "manual",
  }),
});`}
          pythonExample={`requests.post(
    "https://api.alecrae.com/v1/suppressions",
    headers={
        "Authorization": f"Bearer {ALECRAE_API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "email": "user@example.com",
        "domainId": "dom_01HXab",
        "reason": "manual",
    },
)`}
          responseExample={`{
  "data": {
    "id": "sup_02HYcd...",
    "email": "user@example.com",
    "reason": "manual",
    "createdAt": "2026-04-09T12:00:00.000Z"
  }
}`}
        />

        <EndpointCard
          method="DELETE"
          path="/v1/suppressions/{id}"
          description="Remove an address from the suppression list, allowing future sends to that address."
          scopes={["messages:send"]}
          parameters={[
            { name: "id", type: "string", required: true, description: "Suppression ID (path parameter)" },
          ]}
          curlExample={`curl -X DELETE "https://api.alecrae.com/v1/suppressions/sup_02HYcd" \\
  -H "Authorization: Bearer $ALECRAE_API_KEY"`}
          jsExample={`await fetch("https://api.alecrae.com/v1/suppressions/sup_02HYcd", {
  method: "DELETE",
  headers: { "Authorization": "Bearer " + process.env.ALECRAE_API_KEY },
});`}
          pythonExample={`requests.delete(
    "https://api.alecrae.com/v1/suppressions/sup_02HYcd",
    headers={"Authorization": f"Bearer {ALECRAE_API_KEY}"},
)`}
          responseExample={`{
  "success": true,
  "message": "Suppression removed"
}`}
        />
      </section>
    </div>
  );
}
