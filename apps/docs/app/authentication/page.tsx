import type { Metadata } from "next";
import { PageHeader } from "../components/page-header";
import { CodeBlock } from "../components/code-block";
import { Table } from "../components/table";
import { Callout } from "../components/callout";

export const metadata: Metadata = {
  title: "Authentication — Vienna API Docs",
  description: "API keys, OAuth 2.0 bearer tokens, JWT, scopes, and key rotation.",
};

export default function AuthenticationPage(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-4xl mx-auto">
      <PageHeader
        title="Authentication"
        description="The Vienna API supports API keys, OAuth 2.0 bearer tokens, and JWT. All authenticated requests must use HTTPS."
      />

      <section className="space-y-10">
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">API Keys</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            API keys are the primary authentication method for server-to-server integrations.
            Keys follow the format <code className="text-cyan-300 font-mono text-xs">vn_&#123;environment&#125;_&#123;random&#125;</code> where
            environment is either <code className="text-cyan-300 font-mono text-xs">live</code> (production) or <code className="text-cyan-300 font-mono text-xs">test</code> (sandbox).
          </p>

          <h3 className="text-lg font-semibold text-white mb-2">Sending an API key</h3>
          <p className="text-blue-100/70 mb-3">
            Pass the key in the <code className="text-cyan-300 font-mono text-xs">Authorization</code> header as a Bearer token:
          </p>
          <CodeBlock
            code={`curl https://api.48co.ai/v1/messages \\
  -H "Authorization: Bearer vn_live_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345"`}
            language="bash"
          />
          <p className="text-blue-100/70 mb-3 mt-3">
            Alternatively, use the <code className="text-cyan-300 font-mono text-xs">X-API-Key</code> header:
          </p>
          <CodeBlock
            code={`curl https://api.48co.ai/v1/messages \\
  -H "X-API-Key: vn_live_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345"`}
            language="bash"
          />
        </div>

        <div>
          <h3 className="text-lg font-semibold text-white mb-3">Test vs Live Keys</h3>
          <Table
            headers={["Feature", "Test (vn_test_)", "Live (vn_live_)"]}
            rows={[
              ["Sends real email", "No", "Yes"],
              ["Charges to account", "No", "Yes"],
              ["Rate limits", "Reduced", "Full plan limits"],
              ["Webhook events", "Simulated", "Real"],
            ]}
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Scopes</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            Each key can be scoped to a subset of capabilities. A key with no scopes can only call <code className="text-cyan-300 font-mono text-xs">/health</code>.
          </p>
          <Table
            headers={["Scope", "Description"]}
            rows={[
              ["`messages:send`", "Send messages"],
              ["`messages:read`", "Read message status and metadata"],
              ["`domains:read`", "List and inspect domains"],
              ["`domains:write`", "Add and verify domains"],
              ["`webhooks:write`", "Manage webhook endpoints"],
              ["`analytics:read`", "Read aggregated analytics"],
              ["`contacts:read`", "Read contacts"],
              ["`contacts:write`", "Create and update contacts"],
              ["`calendar:read`", "Read calendar events"],
              ["`calendar:write`", "Create and update calendar events"],
              ["`billing:read`", "Read billing and usage info"],
              ["`account:read`", "Read account details"],
              ["`account:write`", "Modify account settings"],
            ]}
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">OAuth 2.0 Bearer Tokens</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            For user-facing applications, the Vienna API supports OAuth 2.0 Bearer tokens obtained through the standard authorization code flow.
          </p>

          <h3 className="text-lg font-semibold text-white mb-2">Token exchange</h3>
          <div className="space-y-3 text-blue-100/70 text-sm mb-4">
            <p>1. Redirect the user to <code className="text-cyan-300 font-mono text-xs">https://auth.48co.ai/authorize</code> with your <code className="text-cyan-300 font-mono text-xs">client_id</code>, <code className="text-cyan-300 font-mono text-xs">redirect_uri</code>, <code className="text-cyan-300 font-mono text-xs">scope</code>, and <code className="text-cyan-300 font-mono text-xs">state</code>.</p>
            <p>2. After the user grants access, exchange the authorization code at <code className="text-cyan-300 font-mono text-xs">https://auth.48co.ai/token</code>.</p>
            <p>3. Include the access token in requests:</p>
          </div>
          <CodeBlock
            code={`Authorization: Bearer eyJhbGciOi...`}
            language="http"
          />

          <h3 className="text-lg font-semibold text-white mb-2 mt-6">Token refresh</h3>
          <p className="text-blue-100/70 mb-3">
            Access tokens expire after 1 hour. Use the refresh token to obtain a new one:
          </p>
          <CodeBlock
            code={`POST https://auth.48co.ai/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=rt_...
&client_id=YOUR_CLIENT_ID
&client_secret=YOUR_CLIENT_SECRET`}
            language="http"
            title="Token refresh"
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">JWT Verification</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            Vienna issues standard JWTs signed with RS256. You can verify tokens using our JWKS endpoint:
          </p>
          <CodeBlock
            code={`GET https://auth.48co.ai/.well-known/jwks.json`}
            language="http"
          />
          <CodeBlock
            code={`import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(
  new URL("https://auth.48co.ai/.well-known/jwks.json")
);

const { payload } = await jwtVerify(token, JWKS, {
  issuer: "https://auth.48co.ai",
  audience: "https://api.48co.ai",
});`}
            language="javascript"
            title="Verify JWT (Node.js with jose)"
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Key rotation</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            Rotate keys at least every 90 days. The dashboard shows the last-used timestamp for every key.
            Revoking a key takes effect within five seconds globally.
          </p>
          <Callout type="warning" title="Never commit keys">
            Use environment variables or a secrets manager. Vienna scans public GitHub for leaked keys and revokes them automatically.
          </Callout>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Error responses</h2>
          <p className="text-blue-100/70 mb-4">
            Authentication failures return <code className="text-cyan-300 font-mono text-xs">401 Unauthorized</code>. Permission failures return <code className="text-cyan-300 font-mono text-xs">403 Forbidden</code>.
          </p>
          <CodeBlock
            code={`{
  "error": {
    "type": "authentication_error",
    "message": "Invalid API key",
    "code": "INVALID_API_KEY"
  }
}`}
            language="json"
            title="401 Unauthorized"
          />
          <CodeBlock
            code={`{
  "error": {
    "type": "authorization_error",
    "message": "API key does not have the 'messages:send' scope",
    "code": "INSUFFICIENT_PERMISSIONS"
  }
}`}
            language="json"
            title="403 Forbidden"
          />
        </div>
      </section>
    </div>
  );
}
