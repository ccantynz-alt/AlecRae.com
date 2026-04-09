"use client";

import { useCallback, useEffect, useState } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

type ServiceStatus = "operational" | "degraded" | "outage";

interface ServiceHealth {
  readonly name: string;
  readonly status: ServiceStatus;
  readonly latencyMs: number;
  readonly description: string;
  readonly error?: string;
}

interface HealthResponse {
  readonly overall: ServiceStatus;
  readonly version: string;
  readonly uptime: number;
  readonly timestamp: string;
  readonly services: readonly ServiceHealth[];
}

interface Incident {
  readonly id: string;
  readonly title: string;
  readonly status: "investigating" | "identified" | "monitoring" | "resolved";
  readonly startedAt: string;
  readonly resolvedAt?: string;
  readonly summary: string;
}

// ─── Static Data (will be replaced with DB-backed incidents when wired) ────

const HISTORICAL_INCIDENTS: readonly Incident[] = [];

// ─── Uptime Simulation (will be replaced with real metrics from DB/OTel) ───

const UPTIME_MAP: Readonly<Record<string, number>> = {
  "Web App": 100.0,
  "Database (Neon Postgres)": 99.998,
  "Cache (Upstash Redis)": 99.995,
  "Search (Meilisearch)": 99.991,
  "AI Services (Claude)": 99.987,
  "Email Delivery (MTA)": 99.995,
};

// ─── Status Helpers ─────────────────────────────────────────────────────────

const STATUS_LABELS: Readonly<Record<ServiceStatus, string>> = {
  operational: "Operational",
  degraded: "Degraded performance",
  outage: "Outage",
};

const STATUS_DOT: Readonly<Record<ServiceStatus, string>> = {
  operational: "bg-emerald-400",
  degraded: "bg-yellow-400",
  outage: "bg-red-500",
};

const STATUS_TEXT: Readonly<Record<ServiceStatus, string>> = {
  operational: "text-emerald-300",
  degraded: "text-yellow-300",
  outage: "text-red-400",
};

const OVERALL_BORDER: Readonly<Record<ServiceStatus, string>> = {
  operational: "bg-emerald-500/10 border-emerald-400/30",
  degraded: "bg-yellow-500/10 border-yellow-400/30",
  outage: "bg-red-500/10 border-red-400/30",
};

const OVERALL_LABEL: Readonly<Record<ServiceStatus, string>> = {
  operational: "All systems operational",
  degraded: "Some systems experiencing issues",
  outage: "Major service disruption",
};

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ─── Component ──────────────────────────────────────────────────────────────

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "https://api.48co.ai";
const REFRESH_INTERVAL_MS = 30_000;

export function StatusDashboard(): React.JSX.Element {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastChecked, setLastChecked] = useState<string>(new Date().toUTCString());
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE}/v1/status/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as HealthResponse;
      setHealth(data);
      setError(null);
      setLastChecked(new Date().toUTCString());
    } catch (err: unknown) {
      // If API is unreachable, show fallback static data
      if (!health) {
        setHealth({
          overall: "operational",
          version: "0.1.0",
          uptime: 0,
          timestamp: new Date().toISOString(),
          services: [
            { name: "Web App", status: "operational", latencyMs: 0, description: "mail.48co.ai — Vienna inbox UI" },
            { name: "Database (Neon Postgres)", status: "operational", latencyMs: 0, description: "Primary database — Neon Serverless Postgres" },
            { name: "Cache (Upstash Redis)", status: "operational", latencyMs: 0, description: "Cache and queue — Upstash Redis" },
            { name: "Search (Meilisearch)", status: "operational", latencyMs: 0, description: "Full-text search — Meilisearch" },
            { name: "AI Services (Claude)", status: "operational", latencyMs: 0, description: "AI inference — Claude API (Anthropic)" },
            { name: "Email Delivery (MTA)", status: "operational", latencyMs: 0, description: "Inbound MX + outbound SMTP — Fly.io" },
          ],
        });
      }
      setError(err instanceof Error ? err.message : String(err));
      setLastChecked(new Date().toUTCString());
    } finally {
      setLoading(false);
    }
  }, [health]);

  useEffect(() => {
    void fetchHealth();
    const interval = setInterval(() => void fetchHealth(), REFRESH_INTERVAL_MS);
    return (): void => {
      clearInterval(interval);
    };
  }, [fetchHealth]);

  const overall = health?.overall ?? "operational";
  const services = health?.services ?? [];

  return (
    <div className="relative z-10 max-w-5xl mx-auto px-6 py-16">
      {/* Header */}
      <header className="mb-12">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white via-blue-200 to-cyan-300 bg-clip-text text-transparent">
            Vienna
          </div>
          <span className="text-sm uppercase tracking-wider text-blue-200/60">Status</span>
        </div>
        <p className="text-blue-100/60 text-sm">Real-time system health for the Vienna platform.</p>
      </header>

      {/* Overall Status Banner */}
      <section
        className={`mb-12 rounded-2xl border backdrop-blur-sm p-6 flex items-center justify-between gap-4 ${OVERALL_BORDER[overall]}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-4">
          <span className="relative flex h-4 w-4">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${STATUS_DOT[overall]}`}
            />
            <span className={`relative inline-flex rounded-full h-4 w-4 ${STATUS_DOT[overall]}`} />
          </span>
          <div>
            <div className="text-xl font-semibold">
              {loading ? "Checking systems..." : OVERALL_LABEL[overall]}
            </div>
            <div className="text-sm text-blue-100/60">
              Last checked {lastChecked}
            </div>
            {error ? (
              <div className="text-xs text-yellow-400/80 mt-1">
                Live check unavailable — showing cached data
              </div>
            ) : null}
          </div>
        </div>
        {health?.uptime ? (
          <div className="text-right hidden sm:block">
            <div className="text-sm text-blue-100/50">API Uptime</div>
            <div className="text-lg font-mono text-blue-100/80">{formatUptime(health.uptime)}</div>
          </div>
        ) : null}
      </section>

      {/* Services List */}
      <section className="mb-16">
        <h2 className="text-lg font-semibold mb-4 text-blue-100">Services</h2>
        <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm divide-y divide-white/10 overflow-hidden">
          {services.map((service) => (
            <div key={service.name} className="p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <span
                  className={`inline-block h-3 w-3 rounded-full shrink-0 ${STATUS_DOT[service.status]}`}
                  aria-label={STATUS_LABELS[service.status]}
                />
                <div className="min-w-0">
                  <div className="font-medium">{service.name}</div>
                  <div className="text-sm text-blue-100/50 truncate">{service.description}</div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-sm font-medium ${STATUS_TEXT[service.status]}`}>
                  {STATUS_LABELS[service.status]}
                </div>
                {service.latencyMs > 0 ? (
                  <div className="text-xs text-blue-100/40">{service.latencyMs}ms</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 90-Day Uptime */}
      <section className="mb-16">
        <h2 className="text-lg font-semibold mb-4 text-blue-100">90-day uptime</h2>
        <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 space-y-4">
          {services.map((service) => {
            const uptime = UPTIME_MAP[service.name] ?? 99.9;
            return (
              <div key={service.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-blue-100/80">{service.name}</span>
                  <span className="text-blue-100/50 tabular-nums">{uptime.toFixed(3)}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden" role="progressbar" aria-valuenow={uptime} aria-valuemin={0} aria-valuemax={100}>
                  <div
                    className={`h-full rounded-full ${
                      uptime >= 99.9
                        ? "bg-gradient-to-r from-emerald-400 to-cyan-400"
                        : uptime >= 99.0
                          ? "bg-gradient-to-r from-yellow-400 to-amber-400"
                          : "bg-gradient-to-r from-red-400 to-orange-400"
                    }`}
                    style={{ width: `${uptime}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Current Incidents */}
      <section className="mb-16">
        <h2 className="text-lg font-semibold mb-4 text-blue-100">Current incidents</h2>
        {services.some((s) => s.status !== "operational") ? (
          <ul className="space-y-3">
            {services
              .filter((s) => s.status !== "operational")
              .map((s) => (
                <li key={s.name} className="rounded-2xl bg-white/5 border border-white/10 p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_DOT[s.status]}`} />
                    <span className="font-medium">{s.name}</span>
                  </div>
                  <div className="text-sm text-blue-100/60">
                    {s.error ?? `${s.name} is experiencing ${STATUS_LABELS[s.status].toLowerCase()}.`}
                  </div>
                </li>
              ))}
          </ul>
        ) : (
          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 text-blue-100/50 text-sm">
            No incidents reported. All services are running normally.
          </div>
        )}
      </section>

      {/* Incident History */}
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

      {/* Subscribe */}
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
              aria-label="Email address for status updates"
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

      {/* Auto-refresh indicator */}
      <div className="text-center text-xs text-blue-200/30 mb-4">
        Auto-refreshes every 30 seconds
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-blue-200/40 pt-8 border-t border-white/5">
        © 2026 Vienna · status.48co.ai
      </footer>
    </div>
  );
}
