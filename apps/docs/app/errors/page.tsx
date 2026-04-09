import type { Metadata } from "next";
import { PageHeader } from "../components/page-header";
import { CodeBlock } from "../components/code-block";
import { Table } from "../components/table";

export const metadata: Metadata = {
  title: "Errors — Vienna API Docs",
  description: "Error codes, HTTP status codes, error shapes, and retry guidance for the Vienna API.",
};

export default function ErrorsPage(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-4xl mx-auto">
      <PageHeader
        title="Errors"
        description="All API errors follow a consistent JSON structure. The HTTP status code indicates the error category."
      />

      <section className="space-y-10">
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Error response format</h2>
          <CodeBlock
            code={`{
  "error": {
    "type": "validation_error",
    "message": "Field 'subject' is required.",
    "code": "MISSING_FIELD",
    "context": {
      "field": "subject"
    },
    "request_id": "req_01HX..."
  }
}`}
            language="json"
          />
          <Table
            headers={["Field", "Type", "Description"]}
            rows={[
              ["`type`", "string", "Error category (e.g., validation_error, authentication_error)"],
              ["`message`", "string", "Human-readable description suitable for logs"],
              ["`code`", "string", "Machine-readable error code for programmatic handling"],
              ["`context`", "object", "Optional additional details (field names, limits, etc.)"],
              ["`request_id`", "string", "Unique request ID — include when contacting support"],
            ]}
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">HTTP status codes</h2>
          <Table
            headers={["Status", "Meaning", "When it occurs"]}
            rows={[
              ["`200`", "OK", "Request succeeded"],
              ["`201`", "Created", "Resource created"],
              ["`202`", "Accepted", "Request accepted for async processing (e.g., email queued)"],
              ["`400`", "Bad Request", "Malformed JSON, missing required fields, invalid parameter types"],
              ["`401`", "Unauthorized", "Missing or invalid API key / Bearer token"],
              ["`403`", "Forbidden", "Valid credentials but insufficient permissions"],
              ["`404`", "Not Found", "The requested resource does not exist"],
              ["`409`", "Conflict", "Resource already exists (e.g., duplicate domain)"],
              ["`413`", "Payload Too Large", "Email or attachment exceeds the maximum allowed size"],
              ["`422`", "Unprocessable Entity", "Request is well-formed but contains invalid data"],
              ["`429`", "Too Many Requests", "Rate limit or quota exceeded"],
              ["`500`", "Internal Server Error", "Unexpected server error"],
              ["`502`", "Bad Gateway", "Upstream service failure (SMTP, DNS)"],
              ["`503`", "Service Unavailable", "Vienna is degraded — see status.48co.ai"],
            ]}
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Error codes</h2>

          <h3 className="text-lg font-semibold text-white mb-2 mt-6">Email errors</h3>
          <Table
            headers={["Code", "Status", "Description", "Retry?"]}
            rows={[
              ["`EMAIL_ERROR`", "400", "General email processing error", "No"],
              ["`EMAIL_VALIDATION_ERROR`", "422", "Email address or content failed validation", "No"],
              ["`EMAIL_SEND_ERROR`", "502", "Failed to deliver via SMTP", "Yes"],
              ["`EMAIL_BOUNCE_ERROR`", "502", "The email bounced during delivery", "No"],
              ["`EMAIL_SIZE_EXCEEDED`", "413", "Email size exceeds the 25 MB limit", "No"],
              ["`RECIPIENT_NOT_FOUND`", "422", "Recipient address does not exist", "No"],
            ]}
          />

          <h3 className="text-lg font-semibold text-white mb-2 mt-6">Authentication errors</h3>
          <Table
            headers={["Code", "Status", "Description", "Retry?"]}
            rows={[
              ["`AUTH_ERROR`", "401", "General authentication failure", "No"],
              ["`INVALID_API_KEY`", "401", "API key is malformed or does not exist", "No"],
              ["`EXPIRED_API_KEY`", "401", "API key has been revoked or expired", "No"],
              ["`INSUFFICIENT_PERMISSIONS`", "403", "Key lacks the required scope", "No"],
            ]}
          />

          <h3 className="text-lg font-semibold text-white mb-2 mt-6">Domain errors</h3>
          <Table
            headers={["Code", "Status", "Description", "Retry?"]}
            rows={[
              ["`DNS_ERROR`", "502", "DNS lookup failed", "Yes"],
              ["`DOMAIN_NOT_VERIFIED`", "403", "Domain has not been verified yet", "No"],
              ["`DOMAIN_VERIFICATION_FAILED`", "422", "DNS records do not match expected values", "No"],
              ["`DNS_RECORD_NOT_FOUND`", "422", "Required DNS record is missing", "No"],
            ]}
          />

          <h3 className="text-lg font-semibold text-white mb-2 mt-6">Rate limit errors</h3>
          <Table
            headers={["Code", "Status", "Description", "Retry?"]}
            rows={[
              ["`RATE_LIMIT_EXCEEDED`", "429", "Request rate limit exceeded", "Yes (after Retry-After)"],
              ["`QUOTA_EXCEEDED`", "429", "Monthly send quota exceeded", "No (upgrade plan)"],
            ]}
          />

          <h3 className="text-lg font-semibold text-white mb-2 mt-6">Resource errors</h3>
          <Table
            headers={["Code", "Status", "Description", "Retry?"]}
            rows={[
              ["`NOT_FOUND`", "404", "Requested resource does not exist", "No"],
              ["`CONFLICT`", "409", "Resource already exists (duplicate)", "No"],
            ]}
          />

          <h3 className="text-lg font-semibold text-white mb-2 mt-6">Infrastructure errors</h3>
          <Table
            headers={["Code", "Status", "Description", "Retry?"]}
            rows={[
              ["`DATABASE_ERROR`", "500", "Internal database failure", "Yes"],
              ["`SMTP_CONNECTION_ERROR`", "502", "Could not establish SMTP connection", "Yes"],
              ["`WEBHOOK_DELIVERY_ERROR`", "502", "Failed to deliver webhook event", "Yes (automatic)"],
              ["`INTERNAL_ERROR`", "500", "Unclassified server error", "Yes"],
            ]}
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Validation errors</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            Validation errors (422) include field-level details in the <code className="text-cyan-300 font-mono text-xs">context</code> object:
          </p>
          <CodeBlock
            code={`{
  "error": {
    "type": "validation_error",
    "message": "Request validation failed",
    "code": "EMAIL_VALIDATION_ERROR",
    "context": {
      "fields": [
        {
          "field": "to[0]",
          "message": "Invalid email address",
          "code": "invalid_email"
        },
        {
          "field": "subject",
          "message": "Subject is required",
          "code": "required"
        }
      ]
    }
  }
}`}
            language="json"
            title="Validation error with field details"
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Retry guidance</h2>
          <div className="space-y-3 text-blue-100/70 text-sm leading-relaxed">
            <p><span className="text-white font-medium">Retryable errors:</span> Use exponential backoff starting at 500ms. Cap at 3 retries for idempotent requests.</p>
            <p><span className="text-white font-medium">Rate limit errors (429):</span> Always respect the <code className="text-cyan-300 font-mono text-xs">Retry-After</code> header. Do not retry immediately.</p>
            <p><span className="text-white font-medium">Client errors (4xx except 429):</span> Do not retry. Fix the request and resubmit.</p>
            <p><span className="text-white font-medium">Server errors (5xx):</span> Retry with backoff. If the error persists after 3 attempts, contact support.</p>
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Error handling example</h2>
          <CodeBlock
            code={`async function sendEmail(payload) {
  const response = await fetch("https://api.48co.ai/v1/messages", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + process.env.VIENNA_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const { error } = await response.json();

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      console.log("Rate limited. Retry after " + retryAfter + " seconds");
      return;
    }

    if (response.status >= 500) {
      // Schedule retry with exponential backoff
      console.error("Server error: " + error.code);
      return;
    }

    // Client error — fix the request
    console.error("API error: " + error.code + " — " + error.message);
    return;
  }

  const data = await response.json();
  console.log("Sent:", data.id);
}`}
            language="javascript"
            title="Error handling (JavaScript)"
          />
          <CodeBlock
            code={`import requests

def send_email(payload):
    response = requests.post(
        "https://api.48co.ai/v1/messages",
        headers={
            "Authorization": f"Bearer {VIENNA_API_KEY}",
            "Content-Type": "application/json",
        },
        json=payload,
    )

    if response.status_code == 429:
        retry_after = response.headers.get("Retry-After", "10")
        print(f"Rate limited. Retry after {retry_after} seconds")
        return None

    if response.status_code >= 500:
        error = response.json().get("error", {})
        print(f"Server error: {error.get('code')}")
        return None

    response.raise_for_status()
    data = response.json()
    print(f"Sent: {data['id']}")
    return data`}
            language="python"
            title="Error handling (Python)"
          />
        </div>
      </section>
    </div>
  );
}
