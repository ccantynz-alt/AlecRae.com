import type { Metadata } from "next";
import { PageHeader } from "../components/page-header";
import { CodeBlock } from "../components/code-block";
import { Table } from "../components/table";
import { Callout } from "../components/callout";

export const metadata: Metadata = {
  title: "Rate Limits — AlecRae API Docs",
  description: "Rate limits, quotas, retry strategies, and idempotency for the AlecRae API.",
};

export default function RateLimitsPage(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-4xl mx-auto">
      <PageHeader
        title="Rate Limits"
        description="The AlecRae API enforces rate limits per API key to ensure fair usage and platform stability."
      />

      <section className="space-y-10">
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Limits by plan</h2>
          <Table
            headers={["Plan", "Requests / minute", "Messages / hour", "Burst (req/sec)"]}
            rows={[
              ["Free", "60", "100", "5"],
              ["Personal", "300", "2,000", "15"],
              ["Pro", "3,000", "50,000", "100"],
              ["Team", "3,000", "50,000", "100"],
              ["Enterprise", "Custom", "Custom", "Custom"],
            ]}
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Limits by category</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            Rate limits apply independently per endpoint category. Hitting the limit on one category does not affect others.
          </p>
          <Table
            headers={["Category", "Endpoints"]}
            rows={[
              ["Send", "`POST /v1/messages`, `POST /v1/messages/batch`"],
              ["Read", "`GET /v1/messages`, `GET /v1/messages/{id}`, `GET /v1/threads`"],
              ["Contacts", "All `/v1/contacts/*` endpoints"],
              ["Calendar", "All `/v1/calendar/*` endpoints"],
              ["Domains", "`POST /v1/domains`, `GET /v1/domains/*`, `POST /v1/domains/*/verify`"],
              ["Webhooks", "All `/v1/webhooks/*` endpoints"],
              ["Analytics", "All `/v1/analytics/*` endpoints"],
              ["AI", "All `/v1/ai/*`, `/v1/voice/*`, `/v1/grammar/*` endpoints"],
              ["Search", "`GET /v1/messages/search`, `POST /v1/search/semantic`"],
              ["Health", "`GET /health` (no limit)"],
            ]}
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Rate limit headers</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            Every API response includes rate limit headers so you can track your usage.
          </p>
          <Table
            headers={["Header", "Description"]}
            rows={[
              ["`X-RateLimit-Limit`", "Maximum requests allowed in the current window"],
              ["`X-RateLimit-Remaining`", "Requests remaining in the current window"],
              ["`X-RateLimit-Reset`", "Unix timestamp (seconds) when the window resets"],
            ]}
          />
          <CodeBlock
            code={`HTTP/1.1 200 OK
X-RateLimit-Limit: 3000
X-RateLimit-Remaining: 2994
X-RateLimit-Reset: 1712150400`}
            language="http"
            title="Example response headers"
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Rate limit exceeded (429)</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            When you exceed the rate limit, the API returns <code className="text-cyan-300 font-mono text-xs">429 Too Many Requests</code> with
            a <code className="text-cyan-300 font-mono text-xs">Retry-After</code> header:
          </p>
          <CodeBlock
            code={`HTTP/1.1 429 Too Many Requests
Retry-After: 12
X-RateLimit-Limit: 3000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1712150412
Content-Type: application/json

{
  "error": {
    "type": "rate_limit_error",
    "message": "Rate limit exceeded. Retry after 12 seconds.",
    "code": "RATE_LIMIT_EXCEEDED"
  }
}`}
            language="http"
            title="429 response"
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Retry strategy</h2>
          <div className="space-y-3 text-blue-100/70 text-sm leading-relaxed">
            <p><span className="text-white font-medium">1.</span> Read the <code className="text-cyan-300 font-mono text-xs">Retry-After</code> header and wait the specified seconds.</p>
            <p><span className="text-white font-medium">2.</span> If <code className="text-cyan-300 font-mono text-xs">Retry-After</code> is absent, use exponential backoff starting at 500ms with a multiplier of 2.</p>
            <p><span className="text-white font-medium">3.</span> Cap retries at 3 attempts for idempotent requests (GET, PUT, DELETE) and 1 for non-idempotent (POST) unless you include an idempotency key.</p>
            <p><span className="text-white font-medium">4.</span> Add jitter (random 0-500ms) to avoid thundering herd effects.</p>
          </div>
          <CodeBlock
            code={`delay = min(base * 2^attempt + jitter, maxDelay)

// Where:
//   base     = 500ms
//   attempt  = 0, 1, 2, ...
//   jitter   = random(0, 500ms)
//   maxDelay = 30s`}
            language="text"
            title="Exponential backoff formula"
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Idempotency</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            For POST endpoints, include an <code className="text-cyan-300 font-mono text-xs">Idempotency-Key</code> header to safely retry requests without duplicate side effects.
            The API stores the response for each idempotency key for 24 hours.
          </p>
          <CodeBlock
            code={`curl https://api.alecrae.com/v1/messages \\
  -H "Authorization: Bearer $ALECRAE_API_KEY" \\
  -H "Idempotency-Key: unique-request-id-12345" \\
  -H "Content-Type: application/json" \\
  -d '{ "from": "you@example.com", "to": ["user@example.com"], "subject": "Test" }'`}
            language="bash"
            title="Idempotent request"
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Monthly quotas</h2>
          <Table
            headers={["Plan", "Monthly send quota"]}
            rows={[
              ["Free", "500"],
              ["Personal", "10,000"],
              ["Pro", "100,000"],
              ["Team", "100,000 per seat"],
              ["Enterprise", "Custom"],
            ]}
          />
          <Callout type="info">
            When the monthly quota is exceeded, the API returns <code className="text-cyan-300 font-mono text-xs">429</code> with
            the error code <code className="text-cyan-300 font-mono text-xs">QUOTA_EXCEEDED</code>. Upgrade your plan or contact support to increase the quota.
          </Callout>
        </div>
      </section>
    </div>
  );
}
