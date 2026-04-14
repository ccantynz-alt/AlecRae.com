import type { Metadata } from "next";
import { PageHeader } from "../components/page-header";
import { EndpointCard } from "../components/endpoint-card";

export const metadata: Metadata = {
  title: "Analytics — AlecRae API Docs",
  description: "Delivery and engagement analytics, time-series metrics, and usage overview for the AlecRae API.",
};

export default function AnalyticsPage(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-4xl mx-auto">
      <PageHeader
        title="Analytics"
        description="Track delivery rates, engagement metrics (opens, clicks), and usage analytics with time-series data and configurable granularity."
        badge="Features"
      />

      <section className="space-y-4">
        <EndpointCard
          method="GET"
          path="/v1/analytics/delivery"
          description="Returns time-series delivery metrics (sent, delivered, bounced, deferred) for the specified time range and granularity. Use tag filters to segment by campaign."
          scopes={["analytics:read"]}
          parameters={[
            { name: "from", type: "datetime", required: false, description: "Start of time range (ISO 8601, defaults to 30 days ago)" },
            { name: "to", type: "datetime", required: false, description: "End of time range (ISO 8601, defaults to now)" },
            { name: "granularity", type: "string", required: false, description: "Aggregation: hour, day, week, month (default: day)" },
            { name: "tags", type: "string", required: false, description: "Comma-separated tag filter" },
          ]}
          curlExample={`curl "https://api.alecrae.com/v1/analytics/delivery?from=2026-04-01T00:00:00Z&granularity=day&tags=receipt" \\
  -H "Authorization: Bearer $ALECRAE_API_KEY"`}
          jsExample={`const response = await fetch(
  "https://api.alecrae.com/v1/analytics/delivery?" + new URLSearchParams({
    from: "2026-04-01T00:00:00Z",
    granularity: "day",
    tags: "receipt",
  }),
  {
    headers: { "Authorization": "Bearer " + process.env.ALECRAE_API_KEY },
  }
);

const { data, meta } = await response.json();`}
          pythonExample={`response = requests.get(
    "https://api.alecrae.com/v1/analytics/delivery",
    headers={"Authorization": f"Bearer {ALECRAE_API_KEY}"},
    params={
        "from": "2026-04-01T00:00:00Z",
        "granularity": "day",
        "tags": "receipt",
    },
)

result = response.json()
for point in result["data"]:
    print(f"{point['timestamp']}: {point['delivered']}/{point['sent']} ({point['deliveryRate']:.1%})")`}
          responseExample={`{
  "data": [
    {
      "timestamp": "2026-04-01T00:00:00.000Z",
      "sent": 1200,
      "delivered": 1180,
      "bounced": 15,
      "deferred": 5,
      "deliveryRate": 0.983
    },
    {
      "timestamp": "2026-04-02T00:00:00.000Z",
      "sent": 1350,
      "delivered": 1330,
      "bounced": 12,
      "deferred": 8,
      "deliveryRate": 0.985
    }
  ],
  "meta": {
    "from": "2026-04-01T00:00:00.000Z",
    "to": "2026-04-09T23:59:59.999Z",
    "granularity": "day",
    "tags": ["receipt"]
  }
}`}
        />

        <EndpointCard
          method="GET"
          path="/v1/analytics/engagement"
          description="Returns time-series engagement metrics: opens, unique opens, clicks, unique clicks, open rate, click rate, and click-to-open rate."
          scopes={["analytics:read"]}
          parameters={[
            { name: "from", type: "datetime", required: false, description: "Start of time range (defaults to 30 days ago)" },
            { name: "to", type: "datetime", required: false, description: "End of time range (defaults to now)" },
            { name: "granularity", type: "string", required: false, description: "Aggregation: hour, day, week, month (default: day)" },
            { name: "tags", type: "string", required: false, description: "Comma-separated tag filter" },
          ]}
          curlExample={`curl "https://api.alecrae.com/v1/analytics/engagement?from=2026-04-01T00:00:00Z&granularity=day" \\
  -H "Authorization: Bearer $ALECRAE_API_KEY"`}
          jsExample={`const response = await fetch(
  "https://api.alecrae.com/v1/analytics/engagement?" + new URLSearchParams({
    from: "2026-04-01T00:00:00Z",
    granularity: "day",
  }),
  {
    headers: { "Authorization": "Bearer " + process.env.ALECRAE_API_KEY },
  }
);

const { data } = await response.json();`}
          pythonExample={`response = requests.get(
    "https://api.alecrae.com/v1/analytics/engagement",
    headers={"Authorization": f"Bearer {ALECRAE_API_KEY}"},
    params={"from": "2026-04-01T00:00:00Z", "granularity": "day"},
)

for point in response.json()["data"]:
    print(f"{point['timestamp']}: open={point['openRate']:.1%} click={point['clickRate']:.1%}")`}
          responseExample={`{
  "data": [
    {
      "timestamp": "2026-04-01T00:00:00.000Z",
      "delivered": 1180,
      "opened": 472,
      "uniqueOpens": 380,
      "clicked": 95,
      "uniqueClicks": 82,
      "openRate": 0.322,
      "clickRate": 0.069,
      "clickToOpenRate": 0.216
    }
  ],
  "meta": {
    "from": "2026-04-01T00:00:00.000Z",
    "to": "2026-04-09T23:59:59.999Z",
    "granularity": "day"
  }
}`}
        />

        <EndpointCard
          method="GET"
          path="/v1/analytics/overview"
          description="Get a high-level overview of usage for the current billing period. Includes total sends, delivery rate, engagement rate, and quota status."
          scopes={["analytics:read"]}
          curlExample={`curl "https://api.alecrae.com/v1/analytics/overview" \\
  -H "Authorization: Bearer $ALECRAE_API_KEY"`}
          jsExample={`const response = await fetch("https://api.alecrae.com/v1/analytics/overview", {
  headers: { "Authorization": "Bearer " + process.env.ALECRAE_API_KEY },
});

const { data } = await response.json();`}
          pythonExample={`response = requests.get(
    "https://api.alecrae.com/v1/analytics/overview",
    headers={"Authorization": f"Bearer {ALECRAE_API_KEY}"},
)

overview = response.json()["data"]`}
          responseExample={`{
  "data": {
    "period": {
      "start": "2026-04-01T00:00:00.000Z",
      "end": "2026-04-30T23:59:59.999Z"
    },
    "totalSent": 12500,
    "totalDelivered": 12350,
    "totalBounced": 120,
    "totalComplaints": 3,
    "deliveryRate": 0.988,
    "averageOpenRate": 0.34,
    "averageClickRate": 0.07,
    "quotaUsed": 12500,
    "quotaLimit": 100000,
    "quotaPercent": 12.5
  }
}`}
        />
      </section>
    </div>
  );
}
