import type { Metadata } from "next";
import { PageHeader } from "../components/page-header";
import { EndpointCard } from "../components/endpoint-card";
import { Callout } from "../components/callout";

export const metadata: Metadata = {
  title: "Search — AlecRae API Docs",
  description: "Full-text search, AI-powered natural language search, and semantic search through the AlecRae API.",
};

export default function SearchPage(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-4xl mx-auto">
      <PageHeader
        title="Search"
        description="Full-text search powered by Meilisearch with sub-50ms response times. AI-powered natural language queries and semantic search for finding emails by meaning, not just keywords."
        badge="Features"
      />

      <Callout type="tip" title="Three search modes">
        AlecRae offers three search modes: keyword (fast full-text), natural language (AI interprets your intent), and semantic (meaning-based vector search).
        The API automatically selects the best mode based on your query, or you can specify one explicitly.
      </Callout>

      <section className="space-y-4 mt-8">
        <EndpointCard
          method="GET"
          path="/v1/messages/search"
          description="Full-text keyword search across all messages. Powered by Meilisearch with typo tolerance, faceted filtering, and sub-50ms response times."
          scopes={["messages:read"]}
          parameters={[
            { name: "q", type: "string", required: true, description: "Search query" },
            { name: "mailbox", type: "string", required: false, description: "Filter by mailbox: inbox, sent, drafts, trash, spam" },
            { name: "from", type: "string", required: false, description: "Filter by sender email" },
            { name: "to", type: "string", required: false, description: "Filter by recipient email" },
            { name: "after", type: "datetime", required: false, description: "Messages after this date" },
            { name: "before", type: "datetime", required: false, description: "Messages before this date" },
            { name: "has_attachment", type: "boolean", required: false, description: "Filter by attachment presence" },
            { name: "limit", type: "integer", required: false, description: "Max results (1-100, default 20)" },
            { name: "offset", type: "integer", required: false, description: "Offset for pagination (default 0)" },
          ]}
          curlExample={`curl "https://api.alecrae.com/v1/messages/search?q=invoice+Q1&mailbox=inbox&has_attachment=true&limit=10" \\
  -H "Authorization: Bearer $ALECRAE_API_KEY"`}
          jsExample={`const response = await fetch(
  "https://api.alecrae.com/v1/messages/search?" + new URLSearchParams({
    q: "invoice Q1",
    mailbox: "inbox",
    has_attachment: "true",
    limit: "10",
  }),
  {
    headers: { "Authorization": "Bearer " + process.env.ALECRAE_API_KEY },
  }
);

const { data, totalHits, processingTimeMs } = await response.json();
console.log("Found " + totalHits + " results in " + processingTimeMs + "ms");`}
          pythonExample={`response = requests.get(
    "https://api.alecrae.com/v1/messages/search",
    headers={"Authorization": f"Bearer {ALECRAE_API_KEY}"},
    params={
        "q": "invoice Q1",
        "mailbox": "inbox",
        "has_attachment": "true",
        "limit": 10,
    },
)

result = response.json()
print(f"Found {result['totalHits']} in {result['processingTimeMs']}ms")`}
          responseExample={`{
  "data": [
    {
      "id": "msg_a1b2...",
      "from": "finance@example.com",
      "to": ["you@yourdomain.com"],
      "subject": "Q1 Invoice #1234",
      "snippet": "Please find attached the Q1 invoice...",
      "status": "delivered",
      "hasAttachments": true,
      "createdAt": "2026-03-31T10:00:00.000Z"
    }
  ],
  "totalHits": 3,
  "processingTimeMs": 12,
  "query": "invoice Q1"
}`}
        />

        <EndpointCard
          method="POST"
          path="/v1/search/natural"
          description="AI-powered natural language search. Describe what you are looking for in plain English and the AI interprets your intent. Uses Claude to parse the query into structured filters."
          scopes={["messages:read"]}
          parameters={[
            { name: "query", type: "string", required: true, description: "Natural language search query" },
            { name: "limit", type: "integer", required: false, description: "Max results (1-50, default 10)" },
          ]}
          requestBody={`{
  "query": "emails from Alice about the budget that had attachments, sent last week",
  "limit": 10
}`}
          curlExample={`curl -X POST https://api.alecrae.com/v1/search/natural \\
  -H "Authorization: Bearer $ALECRAE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "emails from Alice about the budget that had attachments, sent last week"
  }'`}
          jsExample={`const response = await fetch("https://api.alecrae.com/v1/search/natural", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query: "emails from Alice about the budget that had attachments, sent last week",
  }),
});

const { data, interpretation } = await response.json();`}
          pythonExample={`response = requests.post(
    "https://api.alecrae.com/v1/search/natural",
    headers={
        "Authorization": f"Bearer {ALECRAE_API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "query": "emails from Alice about the budget that had attachments, sent last week",
    },
)

result = response.json()
print(result["interpretation"])  # Shows how AI parsed the query`}
          responseExample={`{
  "data": [
    {
      "id": "msg_a1b2...",
      "from": "alice@example.com",
      "subject": "Q2 Budget Draft - Updated",
      "snippet": "Attached the revised budget spreadsheet...",
      "hasAttachments": true,
      "createdAt": "2026-04-03T14:00:00.000Z",
      "relevanceScore": 0.95
    }
  ],
  "interpretation": {
    "from": "alice",
    "keywords": ["budget"],
    "hasAttachment": true,
    "dateRange": { "after": "2026-04-02", "before": "2026-04-09" }
  },
  "totalHits": 2
}`}
        />

        <EndpointCard
          method="POST"
          path="/v1/search/semantic"
          description="Semantic vector search using embeddings. Finds emails by meaning, not just keywords. Ideal for queries like 'find the email where someone mentioned considering the budget' where exact keywords may not match."
          scopes={["messages:read"]}
          parameters={[
            { name: "query", type: "string", required: true, description: "Semantic search query (describe the meaning)" },
            { name: "limit", type: "integer", required: false, description: "Max results (1-50, default 10)" },
            { name: "threshold", type: "number", required: false, description: "Minimum similarity score (0-1, default 0.5)" },
          ]}
          requestBody={`{
  "query": "someone mentioned we should reconsider the quarterly spending plan",
  "limit": 5,
  "threshold": 0.6
}`}
          curlExample={`curl -X POST https://api.alecrae.com/v1/search/semantic \\
  -H "Authorization: Bearer $ALECRAE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "someone mentioned we should reconsider the quarterly spending plan",
    "threshold": 0.6
  }'`}
          jsExample={`const response = await fetch("https://api.alecrae.com/v1/search/semantic", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query: "someone mentioned we should reconsider the quarterly spending plan",
    threshold: 0.6,
  }),
});

const { data } = await response.json();`}
          pythonExample={`response = requests.post(
    "https://api.alecrae.com/v1/search/semantic",
    headers={
        "Authorization": f"Bearer {ALECRAE_API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "query": "someone mentioned we should reconsider the quarterly spending plan",
        "threshold": 0.6,
    },
)

results = response.json()["data"]`}
          responseExample={`{
  "data": [
    {
      "id": "msg_e5f6...",
      "from": "cfo@example.com",
      "subject": "Re: Q2 Planning",
      "snippet": "I think we should take another look at the budget allocation...",
      "similarityScore": 0.87,
      "createdAt": "2026-04-01T11:30:00.000Z"
    }
  ],
  "totalHits": 1
}`}
        />
      </section>
    </div>
  );
}
