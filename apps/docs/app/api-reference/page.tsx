import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "../components/page-header";
import { Table } from "../components/table";
import { CodeBlock } from "../components/code-block";

export const metadata: Metadata = {
  title: "OpenAPI Spec — AlecRae API Docs",
  description: "Download the full OpenAPI 3.1 specification for the AlecRae API.",
};

export default function ApiReferencePage(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-4xl mx-auto">
      <PageHeader
        title="OpenAPI Specification"
        description="The full AlecRae API is described as an OpenAPI 3.1 specification. Import it into Postman, Insomnia, or your favorite codegen tool."
      />

      <section className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Download</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href="https://api.alecrae.com/openapi.yaml"
              className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 transition-all group"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center shrink-0">
                <span className="text-cyan-300 text-xs font-mono font-bold">YML</span>
              </div>
              <div>
                <div className="text-sm font-semibold text-white group-hover:text-cyan-200 transition-colors">openapi.yaml</div>
                <div className="text-xs text-blue-100/50">YAML format</div>
              </div>
            </a>
            <a
              href="https://api.alecrae.com/openapi.json"
              className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 transition-all group"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                <span className="text-blue-300 text-xs font-mono font-bold">JSON</span>
              </div>
              <div>
                <div className="text-sm font-semibold text-white group-hover:text-cyan-200 transition-colors">openapi.json</div>
                <div className="text-xs text-blue-100/50">JSON format</div>
              </div>
            </a>
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Base URLs</h2>
          <Table
            headers={["Environment", "URL"]}
            rows={[
              ["Production", "`https://api.alecrae.com`"],
              ["Staging", "`https://api.staging.alecrae.com`"],
              ["Local development", "`http://localhost:3001`"],
            ]}
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Authentication</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            The API supports two authentication schemes. See the{" "}
            <Link href="/authentication" className="text-cyan-300 hover:text-cyan-200 underline">Authentication</Link> page for full details.
          </p>
          <Table
            headers={["Scheme", "Type", "Header"]}
            rows={[
              ["BearerAuth", "HTTP Bearer", "`Authorization: Bearer vn_live_...`"],
              ["ApiKeyAuth", "API Key", "`X-API-Key: vn_live_...`"],
            ]}
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Endpoint summary</h2>
          <Table
            headers={["Category", "Endpoints", "Docs"]}
            rows={[
              ["Messages", "POST /v1/messages, GET /v1/messages, GET /v1/messages/{id}, POST /v1/messages/batch, GET /v1/messages/search", "/emails"],
              ["Threads", "GET /v1/threads, GET /v1/threads/{id}, POST /v1/threads/{id}/archive, PUT /v1/threads/{id}/labels, GET /v1/threads/{id}/summary", "/threads"],
              ["Contacts", "GET /v1/contacts, POST /v1/contacts, GET /v1/contacts/{id}, PUT /v1/contacts/{id}, DELETE /v1/contacts/{id}", "/contacts"],
              ["Calendar", "GET /v1/calendar/events, POST /v1/calendar/events, GET /v1/calendar/availability", "/calendar"],
              ["Search", "GET /v1/messages/search, POST /v1/search/natural, POST /v1/search/semantic", "/search"],
              ["AI / Voice", "POST /v1/voice/analyze, GET /v1/voice/profile, POST /v1/voice/draft, POST /v1/voice/adjust", "/ai"],
              ["Grammar", "POST /v1/grammar/check", "/ai"],
              ["Translation", "POST /v1/translate", "/ai"],
              ["Templates", "POST /v1/templates, GET /v1/templates, GET /v1/templates/{id}, PUT /v1/templates/{id}, DELETE /v1/templates/{id}, POST /v1/templates/{id}/render", "/templates"],
              ["Domains", "POST /v1/domains, GET /v1/domains/{id}, POST /v1/domains/{id}/verify, DELETE /v1/domains/{id}", "/domains"],
              ["Webhooks", "POST /v1/webhooks, GET /v1/webhooks, GET /v1/webhooks/{id}, DELETE /v1/webhooks/{id}", "/webhooks"],
              ["Suppressions", "POST /v1/suppressions, GET /v1/suppressions, DELETE /v1/suppressions/{id}", "/suppressions"],
              ["Analytics", "GET /v1/analytics/delivery, GET /v1/analytics/engagement, GET /v1/analytics/overview", "/analytics"],
              ["Billing", "POST /v1/billing/checkout, POST /v1/billing/portal, GET /v1/billing/usage, GET /v1/billing/plan", "/billing"],
              ["Health", "GET /health (no auth required)", "---"],
            ]}
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Generate a client</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            Use any OpenAPI code generator to create a type-safe client in your language of choice.
          </p>
          <CodeBlock
            code={`# TypeScript client (openapi-typescript-codegen)
npx openapi-typescript-codegen --input https://api.alecrae.com/openapi.yaml --output ./alecrae-client

# Python client (openapi-python-client)
pip install openapi-python-client
openapi-python-client generate --url https://api.alecrae.com/openapi.yaml

# Go client (oapi-codegen)
go install github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@latest
oapi-codegen -package alecrae https://api.alecrae.com/openapi.yaml > alecrae.gen.go`}
            language="bash"
            title="Generate a typed client"
          />
        </div>
      </section>
    </div>
  );
}
