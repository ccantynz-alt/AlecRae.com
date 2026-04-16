/**
 * AlecRae — Admin Console (Preview)
 *
 * Single-page admin overview rendered inside the marketing app so Craig (and any
 * pre-launch operator) can actually SEE the admin surface from his iPad without
 * waiting on the standalone admin sub-app at admin.alecrae.com to be deployed.
 *
 * Real wiring lives in apps/admin (Next.js, port 3001). That app reads from the
 * production API (api.alecrae.com) and is gated behind SAML/passkeys. This page
 * mirrors its information architecture using illustrative data so the design,
 * typography and layout can be reviewed end-to-end on a phone or tablet today.
 *
 * When the backend is live + admin.alecrae.com deploys, this route can either:
 *   - redirect to the standalone admin app, or
 *   - be removed entirely.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AlecRae · Admin",
  description: "AlecRae admin console — operations, users, security, infrastructure.",
  robots: { index: false, follow: false },
};

type Trend = "up" | "down" | "flat";

interface Kpi {
  readonly label: string;
  readonly value: string;
  readonly delta: string;
  readonly trend: Trend;
  readonly hint: string;
}

interface ActivityRow {
  readonly time: string;
  readonly kind: "delivered" | "bounced" | "deferred" | "sso" | "billing" | "abuse";
  readonly subject: string;
  readonly detail: string;
}

interface SectionTile {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly metric: string;
}

const kpis: readonly Kpi[] = [
  { label: "Messages sent · 24h", value: "0", delta: "—", trend: "flat", hint: "MTA idle until DNS cuts over" },
  { label: "Delivery rate · 30d", value: "—", delta: "target ≥ 99.2%", trend: "flat", hint: "Awaiting first batch" },
  { label: "Bounce rate · 30d", value: "—", delta: "target ≤ 1.5%", trend: "flat", hint: "Awaiting first batch" },
  { label: "Queue depth", value: "0", delta: "0 deferred", trend: "flat", hint: "Upstash Redis pending" },
  { label: "Active accounts", value: "0", delta: "0 paid", trend: "flat", hint: "Neon Postgres pending" },
  { label: "MRR", value: "$0", delta: "Stripe pending", trend: "flat", hint: "Plans locked: $9 / $19 / $12pp" },
];

const activity: readonly ActivityRow[] = [
  {
    time: "—",
    kind: "delivered",
    subject: "No traffic yet",
    detail: "Outbound MTA (smtp.alecrae.com) becomes active once DNS is provisioned.",
  },
  {
    time: "—",
    kind: "sso",
    subject: "SAML SP ready",
    detail: "ACS + SLO endpoints live in code; awaiting first IdP metadata exchange.",
  },
  {
    time: "—",
    kind: "billing",
    subject: "Stripe waiting",
    detail: "Webhook URLs reserved at api.alecrae.com/billing/webhook — need keys.",
  },
  {
    time: "—",
    kind: "abuse",
    subject: "Reputation monitors armed",
    detail: "SPF / DKIM / DMARC report ingestion will populate once mx1/mx2 resolve.",
  },
];

const sections: readonly SectionTile[] = [
  { key: "users", label: "Users", description: "Accounts, plans, passkeys, sessions.", metric: "0 accounts" },
  { key: "queue", label: "Queue", description: "Outbound MTA queue, retries, deferrals.", metric: "0 in flight" },
  { key: "security", label: "Security", description: "Auth events, abuse signals, audit log.", metric: "All clear" },
  { key: "domains", label: "Domains", description: "Sending domains, DNS posture, DKIM keys.", metric: "0 verified" },
  { key: "analytics", label: "Analytics", description: "Engagement, deliverability, cohort retention.", metric: "Awaiting data" },
  { key: "reputation", label: "Reputation", description: "Blocklists, ISP feedback loops, complaint rate.", metric: "Untested" },
];

const buildGates: readonly { label: string; status: "done" | "pending" }[] = [
  { label: "Web (Coming Soon) deployed", status: "done" },
  { label: "Admin sub-app code complete", status: "done" },
  { label: "API / MTA code complete", status: "done" },
  { label: "Neon Postgres provisioned", status: "pending" },
  { label: "Upstash Redis provisioned", status: "pending" },
  { label: "DNS for alecrae.com cut over", status: "pending" },
  { label: "Stripe live keys + webhook", status: "pending" },
  { label: "Anthropic / OpenAI / Google / Microsoft keys", status: "pending" },
];

function trendGlyph(trend: Trend): string {
  if (trend === "up") return "▲";
  if (trend === "down") return "▼";
  return "◦";
}

function activityKindLabel(kind: ActivityRow["kind"]): string {
  switch (kind) {
    case "delivered": return "Delivery";
    case "bounced": return "Bounce";
    case "deferred": return "Deferral";
    case "sso": return "SSO";
    case "billing": return "Billing";
    case "abuse": return "Abuse";
  }
}

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-[#f5f4ef] text-neutral-900">
      {/* Top bar */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#f5f4ef]/85 border-b border-neutral-300/60">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-baseline gap-3">
            <span
              className="text-3xl leading-none"
              style={{
                fontFamily: "var(--font-italianno), 'Snell Roundhand', cursive",
                fontWeight: 400,
              }}
            >
              AlecRae
            </span>
            <span className="hidden sm:inline text-[10px] tracking-[0.3em] uppercase text-neutral-500">
              Admin
            </span>
          </a>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-neutral-300/70 px-3 py-1 text-[10px] tracking-[0.18em] uppercase text-neutral-600">
              <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" aria-hidden="true" />
              Preview · backend offline
            </span>
            <a
              href="/"
              className="hidden sm:inline-block text-xs tracking-[0.18em] uppercase text-neutral-500 hover:text-neutral-900 transition-colors"
            >
              Back to site
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 pt-12 pb-24">
        {/* Page title */}
        <section className="mb-12">
          <h1
            className="text-6xl sm:text-7xl leading-[0.9] text-neutral-900"
            style={{
              fontFamily: "var(--font-italianno), 'Snell Roundhand', cursive",
              fontWeight: 400,
              letterSpacing: "-0.01em",
            }}
          >
            Admin Console
          </h1>
          <div className="mt-3 mb-5 w-32 h-px bg-neutral-400/50" aria-hidden="true" />
          <p
            className="max-w-2xl text-sm sm:text-base text-neutral-600 leading-relaxed"
            style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
          >
            Operations, users, security, infrastructure. The full console runs at{" "}
            <span className="text-neutral-900">admin.alecrae.com</span> behind SAML
            and passkeys. This is the preview surface so the design and information
            architecture can be reviewed before production cuts over.
          </p>
        </section>

        {/* KPI grid */}
        <section
          aria-label="Key metrics"
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-neutral-300/60 border border-neutral-300/60 rounded-2xl overflow-hidden"
        >
          {kpis.map((kpi) => (
            <article key={kpi.label} className="bg-[#f5f4ef] p-5 flex flex-col gap-2">
              <p
                className="text-[10px] tracking-[0.18em] uppercase text-neutral-500"
                style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
              >
                {kpi.label}
              </p>
              <p
                className="text-2xl sm:text-3xl font-light text-neutral-900 tabular-nums"
                style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
              >
                {kpi.value}
              </p>
              <p className="text-[11px] text-neutral-500 flex items-center gap-1.5">
                <span aria-hidden="true" className="text-neutral-400">{trendGlyph(kpi.trend)}</span>
                {kpi.delta}
              </p>
              <p className="text-[11px] text-neutral-400 leading-snug mt-auto">{kpi.hint}</p>
            </article>
          ))}
        </section>

        {/* Two-column: activity + launch gates */}
        <section className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Activity feed (spans 2 cols) */}
          <article className="lg:col-span-2 rounded-2xl border border-neutral-300/60 bg-[#fafaf6] p-6">
            <header className="flex items-end justify-between mb-5">
              <div>
                <h2
                  className="text-lg text-neutral-900"
                  style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", fontWeight: 500 }}
                >
                  Recent activity
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Live feed once api.alecrae.com is reachable.
                </p>
              </div>
              <span className="text-[10px] tracking-[0.18em] uppercase text-neutral-400">Stub</span>
            </header>
            <ul className="divide-y divide-neutral-300/50" role="log" aria-label="Recent admin activity">
              {activity.map((row, idx) => (
                <li key={idx} className="py-4 flex items-start gap-4">
                  <span className="w-16 shrink-0 text-[10px] tracking-[0.18em] uppercase text-neutral-400 pt-0.5">
                    {row.time}
                  </span>
                  <span className="w-24 shrink-0 text-[11px] tracking-[0.12em] uppercase text-neutral-600 pt-0.5">
                    {activityKindLabel(row.kind)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-neutral-900">{row.subject}</span>
                    <span className="block text-xs text-neutral-500 mt-0.5 leading-relaxed">{row.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </article>

          {/* Launch gates */}
          <article className="rounded-2xl border border-neutral-300/60 bg-[#fafaf6] p-6">
            <header className="mb-5">
              <h2
                className="text-lg text-neutral-900"
                style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", fontWeight: 500 }}
              >
                Launch gates
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">Code is done. Infra is Craig&rsquo;s call.</p>
            </header>
            <ul className="space-y-3" role="list">
              {buildGates.map((gate) => (
                <li key={gate.label} className="flex items-center gap-3">
                  <span
                    className={[
                      "h-2 w-2 rounded-full shrink-0",
                      gate.status === "done" ? "bg-neutral-900" : "bg-neutral-300 ring-1 ring-neutral-400",
                    ].join(" ")}
                    aria-hidden="true"
                  />
                  <span className="text-sm text-neutral-800 flex-1">{gate.label}</span>
                  <span className="text-[10px] tracking-[0.18em] uppercase text-neutral-500">
                    {gate.status === "done" ? "Done" : "Pending"}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        </section>

        {/* Section navigation */}
        <section className="mt-10">
          <header className="flex items-end justify-between mb-5">
            <div>
              <h2
                className="text-lg text-neutral-900"
                style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", fontWeight: 500 }}
              >
                Console sections
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Each section is fully built in <code className="text-neutral-700">apps/admin</code> and ships to admin.alecrae.com.
              </p>
            </div>
          </header>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sections.map((section) => (
              <article
                key={section.key}
                className="rounded-2xl border border-neutral-300/60 bg-[#fafaf6] p-5 transition-colors hover:bg-white"
              >
                <header className="flex items-baseline justify-between">
                  <h3
                    className="text-base text-neutral-900"
                    style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", fontWeight: 500 }}
                  >
                    {section.label}
                  </h3>
                  <span className="text-[10px] tracking-[0.18em] uppercase text-neutral-500">
                    {section.metric}
                  </span>
                </header>
                <p className="mt-2 text-sm text-neutral-600 leading-relaxed">{section.description}</p>
                <p className="mt-4 text-[11px] tracking-[0.18em] uppercase text-neutral-400">
                  Available at admin.alecrae.com/{section.key}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* Footer note */}
        <footer className="mt-16 pt-8 border-t border-neutral-300/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-[11px] tracking-[0.18em] uppercase text-neutral-500">
            Admin · Preview build
          </p>
          <p className="text-[11px] text-neutral-500">
            All numbers above are placeholders until Neon, Upstash, Stripe and DNS are provisioned.
          </p>
        </footer>
      </div>
    </main>
  );
}
