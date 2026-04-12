import type { Metadata } from "next";
import { PageHeader } from "../components/page-header";
import { EndpointCard } from "../components/endpoint-card";
import { Table } from "../components/table";
import { Callout } from "../components/callout";

export const metadata: Metadata = {
  title: "Billing — AlecRae API Docs",
  description: "Plans, checkout, billing portal, usage tracking, and Stripe integration for the AlecRae API.",
};

export default function BillingPage(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-4xl mx-auto">
      <PageHeader
        title="Billing"
        description="Manage subscriptions, create checkout sessions, access the billing portal, and track usage. Powered by Stripe."
        badge="Platform"
      />

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-3">Plans</h2>
        <Table
          headers={["Plan", "Price", "Includes"]}
          rows={[
            ["Free", "$0/mo", "1 account, basic AI (5 composes/day), 30-day search"],
            ["Personal", "$9/mo", "3 accounts, full AI, unlimited search, E2EE, snooze, schedule send"],
            ["Pro", "$19/mo", "Unlimited accounts, priority AI (Sonnet), team features, API access, analytics"],
            ["Team", "$12/user/mo", "Shared inboxes, admin console, audit logs, SSO, priority support"],
            ["Enterprise", "Custom", "On-prem option, compliance, dedicated support, SLA, Opus AI"],
          ]}
        />
      </div>

      <section className="space-y-4">
        <EndpointCard
          method="POST"
          path="/v1/billing/checkout"
          description="Create a Stripe checkout session for subscribing to a plan. Returns a URL to redirect the user to Stripe's hosted checkout page."
          scopes={["billing:read"]}
          parameters={[
            { name: "planId", type: "string", required: true, description: "Plan to subscribe to: personal, pro, team, enterprise" },
            { name: "successUrl", type: "string", required: true, description: "URL to redirect after successful payment" },
            { name: "cancelUrl", type: "string", required: true, description: "URL to redirect if user cancels checkout" },
          ]}
          requestBody={`{
  "planId": "pro",
  "successUrl": "https://mail.alecrae.com/settings/billing?success=true",
  "cancelUrl": "https://mail.alecrae.com/settings/billing?cancelled=true"
}`}
          curlExample={`curl -X POST https://api.alecrae.com/v1/billing/checkout \\
  -H "Authorization: Bearer $ALECRAE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "planId": "pro",
    "successUrl": "https://mail.alecrae.com/settings/billing?success=true",
    "cancelUrl": "https://mail.alecrae.com/settings/billing?cancelled=true"
  }'`}
          jsExample={`const response = await fetch("https://api.alecrae.com/v1/billing/checkout", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    planId: "pro",
    successUrl: window.location.origin + "/settings/billing?success=true",
    cancelUrl: window.location.origin + "/settings/billing?cancelled=true",
  }),
});

const { url } = await response.json();
window.location.href = url; // Redirect to Stripe checkout`}
          pythonExample={`response = requests.post(
    "https://api.alecrae.com/v1/billing/checkout",
    headers={
        "Authorization": f"Bearer {ALECRAE_API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "planId": "pro",
        "successUrl": "https://mail.alecrae.com/settings/billing?success=true",
        "cancelUrl": "https://mail.alecrae.com/settings/billing?cancelled=true",
    },
)

checkout_url = response.json()["url"]
# Redirect user to checkout_url`}
          responseExample={`{
  "url": "https://checkout.stripe.com/c/pay/cs_live_a1B2c3D4..."
}`}
        />

        <EndpointCard
          method="POST"
          path="/v1/billing/portal"
          description="Create a Stripe billing portal session. Allows users to manage their subscription, update payment methods, view invoices, and cancel."
          scopes={["billing:read"]}
          parameters={[
            { name: "returnUrl", type: "string", required: true, description: "URL to redirect when user returns from the portal" },
          ]}
          requestBody={`{
  "returnUrl": "https://mail.alecrae.com/settings/billing"
}`}
          curlExample={`curl -X POST https://api.alecrae.com/v1/billing/portal \\
  -H "Authorization: Bearer $ALECRAE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "returnUrl": "https://mail.alecrae.com/settings/billing" }'`}
          jsExample={`const response = await fetch("https://api.alecrae.com/v1/billing/portal", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    returnUrl: window.location.origin + "/settings/billing",
  }),
});

const { url } = await response.json();
window.location.href = url;`}
          pythonExample={`response = requests.post(
    "https://api.alecrae.com/v1/billing/portal",
    headers={
        "Authorization": f"Bearer {ALECRAE_API_KEY}",
        "Content-Type": "application/json",
    },
    json={"returnUrl": "https://mail.alecrae.com/settings/billing"},
)

portal_url = response.json()["url"]`}
          responseExample={`{
  "url": "https://billing.stripe.com/p/session/bps_a1B2c3D4..."
}`}
        />

        <EndpointCard
          method="GET"
          path="/v1/billing/usage"
          description="Get current billing period usage statistics including emails sent, quota limits, and percentage used."
          scopes={["billing:read"]}
          curlExample={`curl "https://api.alecrae.com/v1/billing/usage" \\
  -H "Authorization: Bearer $ALECRAE_API_KEY"`}
          jsExample={`const response = await fetch("https://api.alecrae.com/v1/billing/usage", {
  headers: { "Authorization": "Bearer " + process.env.ALECRAE_API_KEY },
});

const { data } = await response.json();
console.log(data.emailsSent + " / " + data.emailsLimit);`}
          pythonExample={`response = requests.get(
    "https://api.alecrae.com/v1/billing/usage",
    headers={"Authorization": f"Bearer {ALECRAE_API_KEY}"},
)

usage = response.json()["data"]
print(f"{usage['emailsSent']} / {usage['emailsLimit']}")`}
          responseExample={`{
  "data": {
    "emailsSent": 4523,
    "emailsLimit": 100000,
    "percentUsed": 4.5,
    "planTier": "pro",
    "limitExceeded": false,
    "periodStart": "2026-04-01T00:00:00.000Z",
    "periodEnd": "2026-04-30T23:59:59.999Z"
  }
}`}
        />

        <EndpointCard
          method="GET"
          path="/v1/billing/plan"
          description="Get the current subscription plan details, including features and limits."
          scopes={["billing:read"]}
          curlExample={`curl "https://api.alecrae.com/v1/billing/plan" \\
  -H "Authorization: Bearer $ALECRAE_API_KEY"`}
          jsExample={`const response = await fetch("https://api.alecrae.com/v1/billing/plan", {
  headers: { "Authorization": "Bearer " + process.env.ALECRAE_API_KEY },
});

const { data } = await response.json();`}
          pythonExample={`response = requests.get(
    "https://api.alecrae.com/v1/billing/plan",
    headers={"Authorization": f"Bearer {ALECRAE_API_KEY}"},
)

plan = response.json()["data"]`}
          responseExample={`{
  "data": {
    "planId": "pro",
    "planName": "Pro",
    "price": 1900,
    "currency": "usd",
    "interval": "month",
    "features": {
      "accounts": "unlimited",
      "aiModel": "sonnet",
      "searchHistory": "unlimited",
      "e2ee": true,
      "apiAccess": true,
      "teamFeatures": true,
      "monthlyEmailQuota": 100000
    },
    "status": "active",
    "currentPeriodEnd": "2026-04-30T23:59:59.999Z"
  }
}`}
        />

        <Callout type="warning" title="Stripe webhook">
          AlecRae uses Stripe webhooks to track subscription changes. The webhook endpoint at{" "}
          <code className="text-cyan-300 font-mono text-xs">POST /v1/billing/webhook</code> is
          called by Stripe directly and does not require API key authentication. It verifies the
          Stripe signature header instead.
        </Callout>
      </section>
    </div>
  );
}
