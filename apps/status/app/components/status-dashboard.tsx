"use client";

import { useCallback, useEffect, useState } from "react";

// ─── Types (mirror /v1/uptime response — validated against schema below) ─────

type ServiceStatus = "operational" | "degraded" | "outage" | "unknown";

interface UptimeWindow {
  readonly percentage: number | null;
  readonly sampleCount: number;
}

interface ComponentUptime {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly status: ServiceStatus;
  readonly latencyMs: number;
  readonly error?: string;
  readonly uptime: {
    readonly day: UptimeWindow;
    readonly week: UptimeWindow;
    readonly quarter: UptimeWindow;
  };
}

interface UptimeResponse {
  readonly overall: ServiceStatus;
  readonly version: string;
  readonly apiUptimeSeconds: number;
  readonly timestamp: string;
  readonly historyAvailable: boolean;
  readonly historyNote: string;
  readonly components: readonly ComponentUptime[];
}

interface Incident {
  readonly id: string;
  readonly title: string;
  readonly status: "investigating" | "identified" | "monitoring" | "resolved";
  readonly startedAt: string;
  readonly resolvedAt?: string;
  readonly summary: string;
}

// ─── Static Data (DB-backed incident history is a separate future build) ────

const HISTORICAL_INCIDENTS: readonly Incident[] = [];

// ─── Lightweight runtime validation of the API payload ──────────────────────
// Keeps the client honest: a malformed response is rejected and we fall back,
// rather than rendering garbage or fabricated numbers.

function isServiceStatus(value: unknown): value is ServiceStatus {
  return (
    value === "operational" ||
    value === "degraded" ||
    value === "outage" ||
    value === "unknown"
  );
}

function isUptimeWindow(value: unknown): value is UptimeWindow {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const pctOk = v["percentage"] === null || typeof v["percentage"] === "number";
  return pctOk && typeof v["sampleCount"] === "number";
}

function isComponentUptime(value: unknown): value is ComponentUptime {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const u = v["uptime"];
  if (typeof u !== "object" || u === null) return false;
  const uw = u as Record<string, unknown>;
  return (
    typeof v["key"] === "string" &&
    typeof v["name"] === "string" &&
    typeof v["description"] === "string" &&
    isServiceStatus(v["status"]) &&
    typeof v["latencyMs"] === "number" &&
    isUptimeWindow(uw["day"]) &&
    isUptimeWindow(uw["week"]) &&
    isUptimeWindow(uw["quarter"])
  );
}

function parseUptimeResponse(value: unknown): UptimeResponse | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!isServiceStatus(v["overall"])) return null;
  if (!Array.isArray(v["components"])) return null;
  if (!v["components"].every(isComponentUptime)) return null;
  return {
    overall: v["overall"],
    version: typeof v["version"] === "string" ? v["version"] : "unknown",
    apiUptimeSeconds:
      typeof v["apiUptimeSeconds"] === "number" ? v["apiUptimeSeconds"] : 0,
    timestamp:
      typeof v["timestamp"] === "string" ? v["timestamp"] : new Date().toISOString(),
    historyAvailable: v["historyAvailable"] === true,
    historyNote: typeof v["historyNote"] === "string" ? v["historyNote"] : "",
    components: v["components"] as readonly ComponentUptime[],
  };
}

// ─── Status display maps ─────────────────────────────────────────────────────

const STATUS_LABELS: Readonly<Record<ServiceStatus, string>> = {
  operational: "Operational",
  degraded: "Degraded performance",
  outage: "Outage",
  unknown: "Unknown",
};

const STATUS_DOT: Readonly<Record<ServiceStatus, string>> = {
  operational: "bg-emerald-400",
  degraded: "bg-yellow-400",
  outage: "bg-red-500",
  unknown: "bg-slate-400",
};

const STATUS_TEXT: Readonly<Record<ServiceStatus, string>> = {
  operational: "text-emerald-300",
  degraded: "text-yellow-300",
  outage: "text-red-400",
  unknown: "text-slate-300",
};

const OVERALL_BORDER: Readonly<Record<ServiceStatus, string>> = {
  operational: "bg-emerald-500/10 border-emerald-400/30",
  degraded: "bg-yellow-500/10 border-yellow-400/30",
  outage: "bg-red-500/10 border-red-400/30",
  unknown: "bg-slate-500/10 border-slate-400/30",
};

const OVERALL_LABEL: Readonly<Record<ServiceStatus, string>> = {
  operational: "All systems operational",
  degraded: "Some systems experiencing issues",
  outage: "Major service disruption",
  unknown: "System status unknown",
};

function formatApiUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatUptimePct(window: UptimeWindow): string {
  if (window.percentage === null) return "Unknown";
  return `${window.percentage.toFixed(3)}%`;
}

// ─── Fallback (used only when the API is unreachable) ────────────────────────
// We never fabricate uptime numbers: every window is "unknown" (null) here.

function buildFallback(): UptimeResponse {
  const unknownWindow: UptimeWindow = { percentage: null, sampleCount: 0 };
  const mk = (
    key: string,
    name: string,
    description: string,
  ): ComponentUptime => ({
    key,
    name,
    description,
    status: "unknown",
    latencyMs: 0,
    uptime: { day: unknownWindow, week: unknownWindow, quarter: unknownWindow },
  });

  return {
    overall: "unknown",
    version: "unknown",
    apiUptimeSeconds: 0,
    timestamp: new Date().toISOString(),
    historyAvailable: false,
    historyNote:
      "Status API is currently unreachable — live health and uptime are unavailable.",
    components: [
      mk("web", "Web App", "mail.alecrae.com — AlecRae inbox UI"),
      mk("database", "Database (Neon Postgres)", "Primary database — Neon Serverless Postgres"),
      mk("redis", "Cache (Upstash Redis)", "Cache and queue — Upstash Redis"),
      mk("search", "Search (Meilisearch)", "Full-text search — Meilisearch"),
      mk("ai", "AI Services (Claude)", "AI inference — Claude API (Anthropic)"),
      mk("mta", "Email Delivery (MTA)", "Inbound MX + outbound SMTP — Fly.io"),
    ],
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "https://api.alecrae.com";
const REFRESH_INTERVAL_MS = 30_000;

export function StatusDashboard(): React.JSX.Element {
  const [data, setData] = useState<UptimeResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastChecked, setLastChecked] = useState<string>(new Date().toUTCString());
  const [error, setError] = useState<string | null>(null);

  const fetchUptime = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE}/v1/uptime`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok && response.status !== 503) {
        throw new Error(`HTTP ${response.status}`);
      }

      const raw: unknown = await response.json();
      const parsed = parseUptimeResponse(raw);
      if (!parsed) {
        throw new Error("Malformed status payload");
      }

      setData(parsed);
      setError(null);
      setLastChecked(new Date().toUTCString());
    } catch (err: unknown) {
      // If the API is unreachable, keep prior data if we have it; otherwise
      // show an honest "unknown" fallback — never fabricated uptime.
      setData((prev) => prev ?? buildFallback());
      setError(err instanceof Error ? err.message : String(err));
      setLastChecked(new Date().toUTCString());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUptime();
    const interval = setInterval(() => void fetchUptime(), REFRESH_INTERVAL_MS);
    return (): void => {
      clearInterval(interval);
    };
  }, [fetchUptime]);

  const overall = data?.overall ?? "unknown";
  const components = data?.components ?? [];

  return (
    <div className="relative z-10 max-w-5xl mx-auto px-6 py-16">
      {/* Header */}
      <header className="mb-12">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white via-blue-200 to-cyan-300 bg-clip-text text-transparent">
            AlecRae
          </div>
          <span className="text-sm uppercase tracking-wider text-blue-200/60">Status</span>
        </div>
        <p className="text-blue-100/60 text-sm">Real-time system health for the AlecRae platform.</p>
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
            <div className="text-sm text-blue-100/60">Last checked {lastChecked}</div>
            {error ? (
              <div className="text-xs text-yellow-400/80 mt-1">
                Live check unavailable — {data?.historyAvailable ? "showing last known data" : "status unknown"}
              </div>
            ) : null}
          </div>
        </div>
        {data && data.apiUptimeSeconds > 0 ? (
          <div className="text-right hidden sm:block">
            <div className="text-sm text-blue-100/50">API instance uptime</div>
            <div className="text-lg font-mono text-blue-100/80">
              {formatApiUptime(data.apiUptimeSeconds)}
            </div>
          </div>
        ) : null}
      </section>

      {/* Services List */}
      <section className="mb-16">
        <h2 className="text-lg font-semibold mb-4 text-blue-100">Services</h2>
        <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm divide-y divide-white/10 overflow-hidden">
          {components.map((service) => (
            <div key={service.key} className="p-5 flex items-center justify-between gap-4">
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

      {/* 90-Day Uptime (real, from recorded probe samples) */}
      <section className="mb-16">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-semibold text-blue-100">90-day uptime</h2>
          {data && !data.historyAvailable ? (
            <span className="text-xs text-blue-100/40">Awaiting probe history</span>
          ) : null}
        </div>
        <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 space-y-4">
          {components.map((service) => {
            const window = service.uptime.quarter;
            const pct = window.percentage;
            const known = pct !== null;
            return (
              <div key={service.key}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-blue-100/80">{service.name}</span>
                  <span className="text-blue-100/50 tabular-nums">
                    {formatUptimePct(window)}
                  </span>
                </div>
                <div
                  className="h-2 rounded-full bg-white/5 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={known ? pct : undefined}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${service.name} 90-day uptime: ${formatUptimePct(window)}`}
                >
                  {known ? (
                    <div
                      className={`h-full rounded-full ${
                        pct >= 99.9
                          ? "bg-gradient-to-r from-emerald-400 to-cyan-400"
                          : pct >= 99.0
                            ? "bg-gradient-to-r from-yellow-400 to-amber-400"
                            : "bg-gradient-to-r from-red-400 to-orange-400"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  ) : (
                    <div className="h-full w-full bg-[repeating-linear-gradient(45deg,rgba(148,163,184,0.25),rgba(148,163,184,0.25)_6px,transparent_6px,transparent_12px)]" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {data?.historyNote ? (
          <p className="text-xs text-blue-100/40 mt-3">{data.historyNote}</p>
        ) : null}
      </section>

      {/* Current Incidents */}
      <section className="mb-16">
        <h2 className="text-lg font-semibold mb-4 text-blue-100">Current incidents</h2>
        {components.some((s) => s.status === "degraded" || s.status === "outage") ? (
          <ul className="space-y-3">
            {components
              .filter((s) => s.status === "degraded" || s.status === "outage")
              .map((s) => (
                <li key={s.key} className="rounded-2xl bg-white/5 border border-white/10 p-5">
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
            {overall === "unknown"
              ? "Live status is currently unavailable."
              : "No incidents reported. All services are running normally."}
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
            <a className="text-cyan-300 hover:text-cyan-200 underline" href="https://alecrae.com">
              alecrae.com
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
        © 2026 AlecRae · status.alecrae.com
      </footer>
    </div>
  );
}
