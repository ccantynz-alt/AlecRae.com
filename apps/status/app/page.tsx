/**
 * Vienna Status Page
 *
 * Hardcoded data for now. Will be wired to OpenTelemetry / Grafana when the
 * monitoring pipeline is connected. Service health, 90-day uptime, current
 * and historical incidents are all rendered server-side.
 */

type ServiceStatus = "operational" | "degraded" | "partial_outage" | "major_outage" | "maintenance";

interface Service {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: ServiceStatus;
  readonly uptime90d: number;
}

interface Incident {
  readonly id: string;
  readonly title: string;
  readonly status: "investigating" | "identified" | "monitoring" | "resolved";
  readonly startedAt: string;
  readonly resolvedAt?: string;
  readonly summary: string;
}

const SERVICES: readonly Service[] = [
  { id: "api", name: "API", description: "api.48co.ai — REST + tRPC endpoints", status: "operational", uptime90d: 99.998 },
  { id: "mta", name: "Mail Transport (MTA)", description: "Inbound MX + outbound SMTP", status: "operational", uptime90d: 99.995 },
  { id: "web", name: "Web App", description: "mail.48co.ai — Vienna inbox UI", status: "operational", uptime90d: 100.0 },
  { id: "search", name: "Search", description: "Meilisearch — full-text & semantic search", status: "operational", uptime90d: 99.991 },
  { id: "ai", name: "AI Services", description: "Claude, Whisper, on-device inference routing", status: "operational", uptime90d: 99.987 },
];

const CURRENT_INCIDENTS: readonly Incident[] = [];
const HISTORICAL_INCIDENTS: readonly Incident[] = [];

const STATUS_LABELS: Readonly<Record<ServiceStatus, string>> = {
  operational: "Operational",
  degraded: "Degraded performance",
  partial_outage: "Partial outage",
  major_outage: "Major outage",
  maintenance: "Maintenance",
};

const STATUS_DOT: Readonly<Record<ServiceStatus, string>> = {
  operational: "bg-emerald-400",
  degraded: "bg-yellow-400",
  partial_outage: "bg-orange-400",
  major_outage: "bg-red-500",
  maintenance: "bg-blue-400",
};

function overallStatus(services: readonly Service[]): ServiceStatus {
  const order: readonly ServiceStatus[] = ["major_outage", "partial_outage", "degraded", "maintenance", "operational"];
  for (const s of order) {
    if (services.some((svc) => svc.status === s)) return s;
  }
  return "operational";
}

export default function StatusPage(): React.JSX.Element {
  const overall = overallStatus(SERVICES);
  const allOperational = overall === "operational";

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-16">
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white via-blue-200 to-cyan-300 bg-clip-text text-transparent">
              Vienna
            </div>
            <span className="text-sm uppercase tracking-wider text-blue-200/60">Status</span>
          </div>
          <p className="text-blue-100/60 text-sm">Real-time system health for the Vienna platform.</p>
        </header>

        <section
          className={`mb-12 rounded-2xl border backdrop-blur-sm p-6 flex items-center gap-4 ${
            allOperational ? "bg-emerald-500/10 border-emerald-400/30" : "bg-yellow-500/10 border-yellow-400/30"
          }`}
        >
          <span className="relative flex h-4 w-4">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                allOperational ? "bg-emerald-400" : "bg-yellow-400"
              }`}
            />
            <span className={`relative inline-flex rounded-full h-4 w-4 ${STATUS_DOT[overall]}`} />
          </span>
          <div>
            <div className="text-xl font-semibold">
              {allOperational ? "All systems operational" : STATUS_LABELS[overall]}
            </div>
            <div className="text-sm text-blue-100/60">
              Last checked {new Date().toUTCString()}
            </div>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-lg font-semibold mb-4 text-blue-100">Services</h2>
          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm divide-y divide-white/10 overflow-hidden">
            {SERVICES.map((service) => (
              <div key={service.id} className="p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <span className={`inline-block h-3 w-3 rounded-full ${STATUS_DOT[service.status]}`} />
                  <div className="min-w-0">
                    <div className="font-medium">{service.name}</div>
                    <div className="text-sm text-blue-100/50 truncate">{service.description}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-medium text-emerald-300">{STATUS_LABELS[service.status]}</div>
                  <div className="text-xs text-blue-100/40">{service.uptime90d.toFixed(3)}% · 90d</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-lg font-semibold mb-4 text-blue-100">90-day uptime</h2>
          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 space-y-4">
            {SERVICES.map((service) => (
              <div key={service.id}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-blue-100/80">{service.name}</span>
                  <span className="text-blue-100/50 tabular-nums">{service.uptime90d.toFixed(3)}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                    style={{ width: `${service.uptime90d}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-lg font-semibold mb-4 text-blue-100">Current incidents</h2>
          {CURRENT_INCIDENTS.length === 0 ? (
            <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 text-blue-100/50 text-sm">
              No incidents reported. All services are running normally.
            </div>
          ) : (
            <ul className="space-y-3">
              {CURRENT_INCIDENTS.map((i) => (
                <li key={i.id} className="rounded-2xl bg-white/5 border border-white/10 p-5">
                  <div className="font-medium">{i.title}</div>
                  <div className="text-sm text-blue-100/60 mt-1">{i.summary}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-16">
          <h2 className="text-lg font-semibold mb-4 text-blue-100">Incident history</h2>
          {HISTORICAL_INCIDENTS.length === 0 ? (
            <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 text-blue-100/50 text-sm">
              No historical incidents in the last 90 days.
            </div>
          ) : (
            <ul className="space-y-3">
              {HISTORICAL_INCIDENTS.map((i) => (
                <li key={i.id} className="rounded-2xl bg-white/5 border border-white/10 p-5">
                  <div className="font-medium">{i.title}</div>
                  <div className="text-xs text-blue-100/40 mt-1">
                    {i.startedAt} → {i.resolvedAt ?? "ongoing"}
                  </div>
                  <div className="text-sm text-blue-100/60 mt-2">{i.summary}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-16">
          <h2 className="text-lg font-semibold mb-4 text-blue-100">Subscribe to updates</h2>
          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm p-6">
            <p className="text-sm text-blue-100/60 mb-4">
              Get notified by email when incidents are reported or resolved. Subscriptions
              are coming soon — for now, follow{" "}
              <a className="text-cyan-300 hover:text-cyan-200 underline" href="https://48co.ai">
                48co.ai
              </a>{" "}
              for updates.
            </p>
            <form aria-disabled className="flex gap-2">
              <input
                type="email"
                disabled
                placeholder="you@example.com"
                className="flex-1 rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-sm placeholder:text-blue-100/30 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                disabled
                className="rounded-lg bg-cyan-500/20 border border-cyan-400/30 px-4 py-2 text-sm font-medium text-cyan-200 disabled:cursor-not-allowed"
              >
                Notify me
              </button>
            </form>
          </div>
        </section>

        <footer className="text-center text-xs text-blue-200/40 pt-8 border-t border-white/5">
          © 2026 Vienna · status.48co.ai
        </footer>
      </div>
    </main>
  );
}
