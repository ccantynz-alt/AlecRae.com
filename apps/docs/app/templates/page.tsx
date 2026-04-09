import type { Metadata } from "next";
import { PageHeader } from "../components/page-header";
import { EndpointCard } from "../components/endpoint-card";

export const metadata: Metadata = {
  title: "Templates — Vienna API Docs",
  description: "Email template CRUD, variable rendering, and template management through the Vienna API.",
};

export default function TemplatesPage(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-4xl mx-auto">
      <PageHeader
        title="Templates"
        description="Create reusable email templates with variable substitution. Store templates server-side and render them with dynamic data at send time."
        badge="Email"
      />

      <section className="space-y-4">
        <EndpointCard
          method="POST"
          path="/v1/templates"
          description="Create a new email template. Templates support Mustache-style variable substitution."
          scopes={["messages:send"]}
          parameters={[
            { name: "name", type: "string", required: true, description: "Template name (unique per account)" },
            { name: "subject", type: "string", required: true, description: "Subject line (supports variables)" },
            { name: "htmlBody", type: "string", required: false, description: "HTML body with {{variable}} placeholders" },
            { name: "textBody", type: "string", required: false, description: "Plain text body with {{variable}} placeholders" },
            { name: "metadata", type: "object", required: false, description: "Custom metadata" },
          ]}
          requestBody={`{
  "name": "welcome_v3",
  "subject": "Welcome to {{company}}, {{first_name}}!",
  "htmlBody": "<h1>Welcome, {{first_name}}</h1><p>Click <a href='{{verify_url}}'>here</a> to verify.</p>",
  "textBody": "Welcome, {{first_name}}! Verify your account: {{verify_url}}"
}`}
          curlExample={`curl -X POST https://api.48co.ai/v1/templates \\
  -H "Authorization: Bearer $VIENNA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "welcome_v3",
    "subject": "Welcome, {{first_name}}!",
    "htmlBody": "<h1>Welcome, {{first_name}}</h1>",
    "textBody": "Welcome, {{first_name}}!"
  }'`}
          jsExample={`const response = await fetch("https://api.48co.ai/v1/templates", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.VIENNA_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: "welcome_v3",
    subject: "Welcome, {{first_name}}!",
    htmlBody: "<h1>Welcome, {{first_name}}</h1>",
    textBody: "Welcome, {{first_name}}!",
  }),
});

const { data } = await response.json();`}
          pythonExample={`response = requests.post(
    "https://api.48co.ai/v1/templates",
    headers={
        "Authorization": f"Bearer {VIENNA_API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "name": "welcome_v3",
        "subject": "Welcome, {{first_name}}!",
        "htmlBody": "<h1>Welcome, {{first_name}}</h1>",
        "textBody": "Welcome, {{first_name}}!",
    },
)

template = response.json()["data"]`}
          responseExample={`{
  "data": {
    "id": "tmpl_01HXab...",
    "name": "welcome_v3",
    "subject": "Welcome, {{first_name}}!",
    "createdAt": "2026-04-09T12:00:00.000Z"
  }
}`}
        />

        <EndpointCard
          method="GET"
          path="/v1/templates"
          description="List all templates. Supports pagination and filtering by name."
          scopes={["messages:read"]}
          parameters={[
            { name: "cursor", type: "string", required: false, description: "Pagination cursor" },
            { name: "limit", type: "integer", required: false, description: "Max items to return (1-100, default 20)" },
            { name: "name", type: "string", required: false, description: "Filter by template name (partial match)" },
          ]}
          curlExample={`curl "https://api.48co.ai/v1/templates?limit=10" \\
  -H "Authorization: Bearer $VIENNA_API_KEY"`}
          jsExample={`const response = await fetch(
  "https://api.48co.ai/v1/templates?limit=10",
  { headers: { "Authorization": "Bearer " + process.env.VIENNA_API_KEY } }
);

const { data } = await response.json();`}
          pythonExample={`response = requests.get(
    "https://api.48co.ai/v1/templates",
    headers={"Authorization": f"Bearer {VIENNA_API_KEY}"},
    params={"limit": 10},
)

templates = response.json()["data"]`}
          responseExample={`{
  "data": [
    {
      "id": "tmpl_01HXab...",
      "name": "welcome_v3",
      "subject": "Welcome, {{first_name}}!",
      "createdAt": "2026-04-09T12:00:00.000Z"
    }
  ],
  "hasMore": false
}`}
        />

        <EndpointCard
          method="POST"
          path="/v1/templates/{id}/render"
          description="Render a template with variables. Returns the rendered subject, HTML, and text bodies without sending. Useful for previewing templates."
          scopes={["messages:read"]}
          parameters={[
            { name: "id", type: "string", required: true, description: "Template ID (path parameter)" },
            { name: "variables", type: "object", required: true, description: "Key-value pairs to substitute in the template" },
          ]}
          requestBody={`{
  "variables": {
    "first_name": "Ada",
    "company": "Acme Corp",
    "verify_url": "https://yourdomain.com/verify?t=abc123"
  }
}`}
          curlExample={`curl -X POST "https://api.48co.ai/v1/templates/tmpl_01HXab/render" \\
  -H "Authorization: Bearer $VIENNA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "variables": { "first_name": "Ada", "company": "Acme Corp" }
  }'`}
          jsExample={`const response = await fetch(
  "https://api.48co.ai/v1/templates/tmpl_01HXab/render",
  {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + process.env.VIENNA_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      variables: { first_name: "Ada", company: "Acme Corp" },
    }),
  }
);

const { data } = await response.json();
console.log(data.subject); // "Welcome to Acme Corp, Ada!"`}
          pythonExample={`response = requests.post(
    "https://api.48co.ai/v1/templates/tmpl_01HXab/render",
    headers={
        "Authorization": f"Bearer {VIENNA_API_KEY}",
        "Content-Type": "application/json",
    },
    json={"variables": {"first_name": "Ada", "company": "Acme Corp"}},
)

rendered = response.json()["data"]
print(rendered["subject"])`}
          responseExample={`{
  "data": {
    "subject": "Welcome to Acme Corp, Ada!",
    "htmlBody": "<h1>Welcome, Ada</h1><p>Click <a href='https://yourdomain.com/verify?t=abc123'>here</a> to verify.</p>",
    "textBody": "Welcome, Ada! Verify your account: https://yourdomain.com/verify?t=abc123"
  }
}`}
        />

        <EndpointCard
          method="PUT"
          path="/v1/templates/{id}"
          description="Update an existing template. Only provided fields are updated."
          scopes={["messages:send"]}
          parameters={[
            { name: "id", type: "string", required: true, description: "Template ID (path parameter)" },
          ]}
          requestBody={`{
  "subject": "Welcome aboard, {{first_name}}!",
  "htmlBody": "<h1>Welcome aboard, {{first_name}}</h1>"
}`}
          curlExample={`curl -X PUT "https://api.48co.ai/v1/templates/tmpl_01HXab" \\
  -H "Authorization: Bearer $VIENNA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "subject": "Welcome aboard, {{first_name}}!" }'`}
          jsExample={`await fetch("https://api.48co.ai/v1/templates/tmpl_01HXab", {
  method: "PUT",
  headers: {
    "Authorization": "Bearer " + process.env.VIENNA_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ subject: "Welcome aboard, {{first_name}}!" }),
});`}
          pythonExample={`requests.put(
    "https://api.48co.ai/v1/templates/tmpl_01HXab",
    headers={
        "Authorization": f"Bearer {VIENNA_API_KEY}",
        "Content-Type": "application/json",
    },
    json={"subject": "Welcome aboard, {{first_name}}!"},
)`}
          responseExample={`{
  "data": {
    "id": "tmpl_01HXab...",
    "name": "welcome_v3",
    "subject": "Welcome aboard, {{first_name}}!",
    "updatedAt": "2026-04-09T13:00:00.000Z"
  }
}`}
        />

        <EndpointCard
          method="DELETE"
          path="/v1/templates/{id}"
          description="Delete a template. Messages that reference this template will fail to send."
          scopes={["messages:send"]}
          parameters={[
            { name: "id", type: "string", required: true, description: "Template ID (path parameter)" },
          ]}
          curlExample={`curl -X DELETE "https://api.48co.ai/v1/templates/tmpl_01HXab" \\
  -H "Authorization: Bearer $VIENNA_API_KEY"`}
          jsExample={`await fetch("https://api.48co.ai/v1/templates/tmpl_01HXab", {
  method: "DELETE",
  headers: { "Authorization": "Bearer " + process.env.VIENNA_API_KEY },
});`}
          pythonExample={`requests.delete(
    "https://api.48co.ai/v1/templates/tmpl_01HXab",
    headers={"Authorization": f"Bearer {VIENNA_API_KEY}"},
)`}
          responseExample={`{
  "success": true,
  "message": "Template deleted"
}`}
        />
      </section>
    </div>
  );
}
