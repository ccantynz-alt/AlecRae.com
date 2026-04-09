import type { Metadata } from "next";
import { PageHeader } from "../components/page-header";
import { EndpointCard } from "../components/endpoint-card";
import { Table } from "../components/table";
import { Callout } from "../components/callout";

export const metadata: Metadata = {
  title: "Domains — Vienna API Docs",
  description: "Domain management, DNS verification, SPF, DKIM, and DMARC configuration for the Vienna API.",
};

export default function DomainsPage(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-4xl mx-auto">
      <PageHeader
        title="Domains"
        description="Register sending domains, configure DNS records (SPF, DKIM, DMARC), and verify ownership before sending email."
        badge="Email"
      />

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-3">Required DNS records</h2>
        <p className="text-blue-100/70 mb-4 leading-relaxed">
          After adding a domain, Vienna provides DNS records you must add to your DNS provider.
        </p>
        <Table
          headers={["Type", "Name", "Value"]}
          rows={[
            ["`TXT`", "yourdomain.com", "v=spf1 include:_spf.48co.ai ~all"],
            ["`TXT`", "vienna._domainkey.yourdomain.com", "v=DKIM1; k=rsa; p=..."],
            ["`TXT`", "_dmarc.yourdomain.com", "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com"],
            ["`MX`", "yourdomain.com", "10 mx1.48co.ai / 20 mx2.48co.ai (only if receiving inbound)"],
          ]}
        />
        <Callout type="tip" title="Tracking subdomain">
          To improve deliverability, set up a CNAME for tracking: <code className="text-cyan-300 font-mono text-xs">track.yourdomain.com CNAME t.48co.ai</code>.
          This avoids third-party domains in your emails.
        </Callout>
      </div>

      <section className="space-y-4">
        <EndpointCard
          method="POST"
          path="/v1/domains"
          description="Register a new sending domain. Returns the required DNS records that must be configured before verification."
          scopes={["domains:write"]}
          parameters={[
            { name: "domain", type: "string", required: true, description: "The domain name to register (e.g., yourdomain.com)" },
          ]}
          requestBody={`{
  "domain": "yourdomain.com"
}`}
          curlExample={`curl -X POST https://api.48co.ai/v1/domains \\
  -H "Authorization: Bearer $VIENNA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "domain": "yourdomain.com" }'`}
          jsExample={`const response = await fetch("https://api.48co.ai/v1/domains", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.VIENNA_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ domain: "yourdomain.com" }),
});

const { data, message } = await response.json();
console.log(message); // "Domain added. Configure the DNS records below, then verify."
console.log(data.dnsRecords); // Records to add to your DNS`}
          pythonExample={`response = requests.post(
    "https://api.48co.ai/v1/domains",
    headers={
        "Authorization": f"Bearer {VIENNA_API_KEY}",
        "Content-Type": "application/json",
    },
    json={"domain": "yourdomain.com"},
)

result = response.json()
for record in result["data"]["dnsRecords"]:
    print(f"{record['type']} {record['host']} -> {record['value']}")`}
          responseExample={`{
  "data": {
    "id": "dom_01HXab...",
    "domain": "yourdomain.com",
    "status": "pending",
    "dnsRecords": [
      { "type": "TXT", "host": "yourdomain.com", "value": "v=spf1 include:_spf.48co.ai ~all" },
      { "type": "TXT", "host": "vienna._domainkey.yourdomain.com", "value": "v=DKIM1; k=rsa; p=MIIBIj..." },
      { "type": "TXT", "host": "_dmarc.yourdomain.com", "value": "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com" }
    ],
    "spfVerified": false,
    "dkimVerified": false,
    "dmarcVerified": false,
    "mxVerified": false,
    "createdAt": "2026-04-09T12:00:00.000Z"
  },
  "message": "Domain added. Configure the DNS records below, then verify."
}`}
        />

        <EndpointCard
          method="GET"
          path="/v1/domains/{id}"
          description="Retrieve domain configuration and verification status."
          scopes={["domains:read"]}
          parameters={[
            { name: "id", type: "string", required: true, description: "Domain ID (path parameter)" },
          ]}
          curlExample={`curl "https://api.48co.ai/v1/domains/dom_01HXab" \\
  -H "Authorization: Bearer $VIENNA_API_KEY"`}
          jsExample={`const response = await fetch(
  "https://api.48co.ai/v1/domains/dom_01HXab",
  {
    headers: { "Authorization": "Bearer " + process.env.VIENNA_API_KEY },
  }
);

const { data } = await response.json();
console.log("Status:", data.status);
console.log("SPF:", data.spfVerified, "DKIM:", data.dkimVerified);`}
          pythonExample={`response = requests.get(
    "https://api.48co.ai/v1/domains/dom_01HXab",
    headers={"Authorization": f"Bearer {VIENNA_API_KEY}"},
)

domain = response.json()["data"]
print(f"Status: {domain['status']}")`}
          responseExample={`{
  "data": {
    "id": "dom_01HXab...",
    "domain": "yourdomain.com",
    "status": "verified",
    "spfVerified": true,
    "dkimVerified": true,
    "dmarcVerified": true,
    "mxVerified": false,
    "createdAt": "2026-04-09T12:00:00.000Z"
  }
}`}
        />

        <EndpointCard
          method="POST"
          path="/v1/domains/{id}/verify"
          description="Initiate DNS verification for the domain. Vienna checks SPF, DKIM, DMARC, and MX records. DNS propagation may take up to 48 hours."
          scopes={["domains:write"]}
          parameters={[
            { name: "id", type: "string", required: true, description: "Domain ID (path parameter)" },
          ]}
          curlExample={`curl -X POST "https://api.48co.ai/v1/domains/dom_01HXab/verify" \\
  -H "Authorization: Bearer $VIENNA_API_KEY"`}
          jsExample={`const response = await fetch(
  "https://api.48co.ai/v1/domains/dom_01HXab/verify",
  {
    method: "POST",
    headers: { "Authorization": "Bearer " + process.env.VIENNA_API_KEY },
  }
);

const { data, message } = await response.json();
console.log(message);`}
          pythonExample={`response = requests.post(
    "https://api.48co.ai/v1/domains/dom_01HXab/verify",
    headers={"Authorization": f"Bearer {VIENNA_API_KEY}"},
)

result = response.json()
print(result["message"])`}
          responseExample={`{
  "data": {
    "id": "dom_01HXab...",
    "domain": "yourdomain.com",
    "status": "verified",
    "spfVerified": true,
    "dkimVerified": true,
    "dmarcVerified": true,
    "mxVerified": false
  },
  "message": "Domain verified successfully."
}`}
        />

        <EndpointCard
          method="DELETE"
          path="/v1/domains/{id}"
          description="Remove a domain. Pending and queued messages from that domain are cancelled immediately."
          scopes={["domains:write"]}
          parameters={[
            { name: "id", type: "string", required: true, description: "Domain ID (path parameter)" },
          ]}
          curlExample={`curl -X DELETE "https://api.48co.ai/v1/domains/dom_01HXab" \\
  -H "Authorization: Bearer $VIENNA_API_KEY"`}
          jsExample={`await fetch("https://api.48co.ai/v1/domains/dom_01HXab", {
  method: "DELETE",
  headers: { "Authorization": "Bearer " + process.env.VIENNA_API_KEY },
});`}
          pythonExample={`requests.delete(
    "https://api.48co.ai/v1/domains/dom_01HXab",
    headers={"Authorization": f"Bearer {VIENNA_API_KEY}"},
)`}
          responseExample={`{
  "success": true,
  "message": "Domain removed. Pending messages cancelled."
}`}
        />
      </section>
    </div>
  );
}
