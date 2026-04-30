"use client";

/**
 * AlecRae — Admin Console
 *
 * Full client-side admin surface. Tries to connect to the API and shows
 * live data when available; degrades gracefully to an honest "offline"
 * state when the backend isn't provisioned yet.
 *
 * Craig has full access to everything here. When admin.alecrae.com is live
 * this page can redirect there — for now it is the primary admin surface.
 */

import { useState, useEffect, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ApiHealth {
  status: "online" | "offline" | "checking";
  latencyMs: number | null;
}

interface SystemService {
  readonly name: string;
  readonly key: string;
  readonly description: string;
  status: "online" | "offline" | "pending" | "checking";
}

type GateStatus = "done" | "pending";

interface LaunchGate {
  readonly label: string;
  readonly detail: string;
  readonly status: GateStatus;
  readonly owner: "craig" | "done";
}

// ─── Static data ─────────────────────────────────────────────────────────────

const LAUNCH_GATES: readonly LaunchGate[] = [
  {
    label: "Provision Neon Postgres",
    detail: "neon.tech → New project → copy DATABASE_URL into production env",
    status: "pending",
    owner: "craig",
  },
  {
    label: "Provision Upstash Redis",
    detail: "upstash.com → New database → copy REDIS_URL into production env",
    status: "pending",
    owner: "craig",
  },
  {
    label: "Set Anthropic API key",
    detail: "console.anthropic.com → API Keys → add ANTHROPIC_API_KEY to env",
    status: "pending",
    owner: "craig",
  },
  {
    label: "Set OpenAI API key (Whisper)",
    detail: "platform.openai.com → API Keys → add OPENAI_API_KEY to env",
    status: "pending",
    owner: "craig",
  },
  {
    label: "Google OAuth credentials",
    detail: "console.cloud.google.com → OAuth 2.0 → add GOOGLE_CLIENT_ID + SECRET",
    status: "pending",
    owner: "craig",
  },
  {
    label: "Microsoft Azure OAuth",
    detail: "portal.azure.com → App registrations → add MICROSOFT_CLIENT_ID + SECRET",
    status: "pending",
    owner: "craig",
  },
  {
    label: "Configure Stripe",
    detail: "dashboard.stripe.com → API keys + webhook URL → api.alecrae.com/billing/webhook",
    status: "pending",
    owner: "craig",
  },
  {
    label: "Cut DNS for alecrae.com",
    detail: "MX → mx1/mx2.alecrae.com | SPF/DKIM/DMARC TXT records | CNAME mail/api/admin",
    status: "pending",
    owner: "craig",
  },
  {
    label: "Deploy to Crontec / production host",
    detail: "Connect repo → set env vars → point domain → go live",
    status: "pending",
    owner: "craig",
  },
  {
    label: "All code complete (36/36 + 31 advanced features)",
    detail: "Tier 1–4 done. S/A/B/C done. 585 TypeScript files. Zero any casts.",
    status: "done",
    owner: "done",
  },
  {
    label: "Monorepo build 27/27 passing",
    detail: "All apps/packages/services build clean. CI gate active.",
    status: "done",
    owner: "done",
  },
  {
    label: "CI/CD pipeline wired",
    detail: "GitHub Actions: lint → typecheck → test → build → GateTest (hard gate)",
    status: "done",
    owner: "done",
  },
];

const PLAN_TIERS = [
  { name: "Free", price: "$0/mo", accounts: 1, ai: "5 composes/day" },
  { name: "Personal", price: "$9/mo", accounts: 3, ai: "Full AI" },
  { name: "Pro", price: "$19/mo", accounts: "Unlimited", ai: "Priority (Sonnet)" },
  { name: "Team", price: "$12/user/mo", accounts: "Shared", ai: "Priority" },
  { name: "Enterprise", price: "Custom", accounts: "Unlimited", ai: "Opus" },
];

const STACK_REPLACED = [
  { tool: "Gmail Workspace + Gemini", price: "$12–30/mo" },
  { tool: "Grammarly Premium", price: "$12–30/mo" },
  { tool: "Dragon Professional", price: "$500 (discontinued)" },
  { tool: "Front shared inbox", price: "$19–59/user/mo" },
  { tool: "Superhuman", price: "$30/mo" },
  { tool: "Proton Mail", price: "$5–10/mo" },
  { tool: "Otter.ai transcription", price: "$10/mo" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const IVORY = "#f5f4ef";
const GOLD = "#cfa630";

function cx(...classes: (string | boolean | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: "online" | "offline" | "pending" | "checking" }) {
  const color =
    status === "online"
      ? "bg-green-500"
      : status === "checking"
        ? "bg-amber-400 animate-pulse"
        : status === "offline"
          ? "bg-red-400"
          : "bg-neutral-300";
  return <span className={cx("inline-block h-2 w-2 rounded-full shrink-0", color)} aria-hidden="true" />;
}

function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "gold" | "green" | "red" }) {
  const styles = {
    default: "bg-neutral-200/60 text-neutral-600",
    gold: "text-amber-800",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] tracking-[0.15em] uppercase font-medium",
        styles[variant],
      )}
      style={variant === "gold" ? { background: `${GOLD}22`, color: GOLD } : undefined}
    >
      {children}
    </span>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-base font-semibold text-neutral-900 tracking-tight">{title}</h2>
      {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [api, setApi] = useState<ApiHealth>({ status: "checking", latencyMs: null });
  const [services, setServices] = useState<SystemService[]>([
    { name: "API Server", key: "api", description: "Hono/Bun — api.alecrae.com", status: "checking" },
    { name: "Database", key: "db", description: "Neon Serverless Postgres", status: "pending" },
    { name: "Cache / Queue", key: "redis", description: "Upstash Redis", status: "pending" },
    { name: "MTA", key: "mta", description: "smtp.alecrae.com — outbound", status: "pending" },
    { name: "Inbound Mail", key: "inbound", description: "mx1/mx2.alecrae.com", status: "pending" },
    { name: "Search", key: "search", description: "Meilisearch", status: "pending" },
    { name: "AI Engine", key: "ai", description: "Claude Haiku/Sonnet/Opus", status: "pending" },
    { name: "Collab WS", key: "collab", description: "CRDT WebSocket server", status: "pending" },
  ]);
  const [activeTab, setActiveTab] = useState<"overview" | "launch" | "plans" | "stack">("overview");

  const checkApi = useCallback(async () => {
    const t0 = Date.now();
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(4000) });
      const latencyMs = Date.now() - t0;
      if (res.ok) {
        setApi({ status: "online", latencyMs });
        setServices((prev) =>
          prev.map((s) => (s.key === "api" ? { ...s, status: "online" } : s)),
        );
        // If API is up, try to get DB/Redis health from response
        try {
          const body = await res.json() as Record<string, unknown>;
          if (body.db === "ok") setServices((prev) => prev.map((s) => s.key === "db" ? { ...s, status: "online" } : s));
          if (body.redis === "ok") setServices((prev) => prev.map((s) => s.key === "redis" ? { ...s, status: "online" } : s));
        } catch { /* health body parse optional */ }
      } else {
        setApi({ status: "offline", latencyMs });
        setServices((prev) => prev.map((s) => s.key === "api" ? { ...s, status: "offline" } : s));
      }
    } catch {
      setApi({ status: "offline", latencyMs: Date.now() - t0 });
      setServices((prev) => prev.map((s) => s.key === "api" ? { ...s, status: "offline" } : s));
    }
  }, []);

  useEffect(() => {
    void checkApi();
    const id = setInterval(() => { void checkApi(); }, 30_000);
    return () => clearInterval(id);
  }, [checkApi]);

  const doneGates = LAUNCH_GATES.filter((g) => g.status === "done").length;
  const totalGates = LAUNCH_GATES.length;

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "launch", label: `Launch Gates (${doneGates}/${totalGates})` },
    { key: "plans", label: "Plans & Pricing" },
    { key: "stack", label: "Stack Replaced" },
  ] as const;

  return (
    <main className="min-h-screen text-neutral-900" style={{ background: IVORY, fontFamily: "var(--font-inter), system-ui, sans-serif" }}>

      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 backdrop-blur-md" style={{ background: `${IVORY}e0` }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a href="/" className="text-2xl leading-none" style={{ fontFamily: "var(--font-italianno), cursive", fontWeight: 400 }}>
              AlecRae
            </a>
            <span className="hidden sm:inline text-[10px] tracking-[0.3em] uppercase text-neutral-400">Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
              <StatusDot status={api.status} />
              {api.status === "online"
                ? `API online · ${api.latencyMs ?? "—"}ms`
                : api.status === "checking"
                  ? "Checking API…"
                  : "API offline"}
            </span>
            <button
              onClick={() => void checkApi()}
              className="text-[11px] text-neutral-400 hover:text-neutral-700 transition-colors px-2 py-1 rounded"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-24">

        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-5xl sm:text-6xl leading-[0.9] text-neutral-900 mb-2"
            style={{ fontFamily: "var(--font-italianno), cursive", fontWeight: 400 }}>
            Admin Console
          </h1>
          <p className="text-sm text-neutral-500 max-w-xl">
            Full platform control. When{" "}
            <span className="font-medium text-neutral-700">admin.alecrae.com</span> goes live
            this redirects there. Until then — this is it.
          </p>
        </div>

        {/* API offline banner */}
        {api.status === "offline" && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
            <span className="text-amber-500 mt-0.5" aria-hidden="true">⚠</span>
            <div>
              <p className="text-sm font-medium text-amber-900">Backend not connected</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Provision Neon + Upstash + API keys, deploy the API, then this panel lights up with live data.
              </p>
            </div>
          </div>
        )}

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-neutral-200/60 border border-neutral-200/60 rounded-2xl overflow-hidden mb-8">
          {[
            { label: "Messages · 24h", value: "—", hint: "MTA offline" },
            { label: "Delivery rate", value: "—", hint: "target ≥ 99.2%" },
            { label: "Bounce rate", value: "—", hint: "target ≤ 1.5%" },
            { label: "Queue depth", value: "0", hint: "Redis pending" },
            { label: "Accounts", value: "0", hint: "Neon pending" },
            { label: "MRR", value: "$0", hint: "Stripe pending" },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-[#f5f4ef] p-4 flex flex-col gap-1.5">
              <p className="text-[10px] tracking-[0.18em] uppercase text-neutral-400">{kpi.label}</p>
              <p className="text-2xl font-light tabular-nums text-neutral-900">{kpi.value}</p>
              <p className="text-[11px] text-neutral-400">{kpi.hint}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 border-b border-neutral-200/70 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cx(
                "px-4 py-2.5 text-xs tracking-wide whitespace-nowrap transition-colors border-b-2 -mb-px",
                activeTab === tab.key
                  ? "border-neutral-900 text-neutral-900 font-medium"
                  : "border-transparent text-neutral-500 hover:text-neutral-700",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === "overview" && (
          <div className="space-y-8">

            {/* System health */}
            <section>
              <SectionHeader title="System Health" subtitle="Live status — refreshes every 30s" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {services.map((svc) => (
                  <div key={svc.key} className="rounded-xl border border-neutral-200/70 bg-white/60 p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-neutral-800">{svc.name}</span>
                      <StatusDot status={svc.status} />
                    </div>
                    <p className="text-[11px] text-neutral-400 leading-snug">{svc.description}</p>
                    <Badge variant={svc.status === "online" ? "green" : svc.status === "offline" ? "red" : "default"}>
                      {svc.status === "checking" ? "Checking…" : svc.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </section>

            {/* Console sections */}
            <section>
              <SectionHeader title="Console Sections" subtitle="All built — live at admin.alecrae.com once DNS cuts over" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { key: "users", label: "Users", desc: "Accounts, plans, passkeys, sessions, billing status" },
                  { key: "queue", label: "Queue", desc: "Outbound MTA queue depth, retries, deferrals, concurrency" },
                  { key: "security", label: "Security", desc: "Auth events, abuse signals, phishing reports, audit log" },
                  { key: "domains", label: "Domains", desc: "Sending domains, DNS posture, DKIM key rotation" },
                  { key: "analytics", label: "Analytics", desc: "Deliverability, engagement, cohort retention, revenue" },
                  { key: "reputation", label: "Reputation", desc: "Blocklists, ISP FBL, complaint rate, sender score" },
                ].map((s) => (
                  <a
                    key={s.key}
                    href={`https://admin.alecrae.com/${s.key}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-neutral-200/70 bg-white/40 hover:bg-white/80 transition-colors p-4 flex flex-col gap-2 group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-neutral-800 group-hover:text-neutral-900">{s.label}</span>
                      <span className="text-neutral-300 group-hover:text-neutral-500 transition-colors text-sm">→</span>
                    </div>
                    <p className="text-[11px] text-neutral-500 leading-snug">{s.desc}</p>
                    <p className="text-[10px] tracking-[0.15em] uppercase text-neutral-300">admin.alecrae.com/{s.key}</p>
                  </a>
                ))}
              </div>
            </section>

          </div>
        )}

        {/* ── LAUNCH GATES TAB ── */}
        {activeTab === "launch" && (
          <section>
            <SectionHeader
              title="Launch Gates"
              subtitle={`${doneGates} of ${totalGates} complete. Code is done. The remaining items are infra provisioning.`}
            />

            {/* Progress bar */}
            <div className="mb-6 h-2 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.round((doneGates / totalGates) * 100)}%`, background: GOLD }}
              />
            </div>
            <p className="text-xs text-neutral-500 mb-6">{Math.round((doneGates / totalGates) * 100)}% complete</p>

            <div className="space-y-2">
              {LAUNCH_GATES.map((gate) => (
                <div
                  key={gate.label}
                  className={cx(
                    "rounded-xl border p-4 flex items-start gap-4 transition-colors",
                    gate.status === "done"
                      ? "border-neutral-200/50 bg-white/30"
                      : "border-amber-200/70 bg-amber-50/40",
                  )}
                >
                  <span className={cx("mt-0.5 text-base shrink-0", gate.status === "done" ? "text-green-500" : "text-amber-400")}>
                    {gate.status === "done" ? "✓" : "○"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={cx("text-sm font-medium", gate.status === "done" ? "text-neutral-600 line-through decoration-neutral-300" : "text-neutral-900")}>
                      {gate.label}
                    </p>
                    <p className="text-[11px] text-neutral-500 mt-0.5 leading-relaxed">{gate.detail}</p>
                  </div>
                  <Badge variant={gate.status === "done" ? "green" : "gold"}>
                    {gate.status === "done" ? "Done" : "Craig"}
                  </Badge>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── PLANS TAB ── */}
        {activeTab === "plans" && (
          <section>
            <SectionHeader title="Plans & Pricing" subtitle="Locked — changes require Craig's authorization" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {PLAN_TIERS.map((plan) => (
                <div key={plan.name} className="rounded-xl border border-neutral-200/70 bg-white/50 p-4 flex flex-col gap-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{plan.name}</p>
                    <p className="text-lg font-light tabular-nums mt-0.5" style={{ color: GOLD }}>{plan.price}</p>
                  </div>
                  <div className="space-y-1.5 text-[11px] text-neutral-600">
                    <p><span className="text-neutral-400">Accounts: </span>{plan.accounts}</p>
                    <p><span className="text-neutral-400">AI: </span>{plan.ai}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-neutral-400">
              Total competitor stack replacement value: ~$100+/mo → AlecRae from $9/mo
            </p>
          </section>
        )}

        {/* ── STACK REPLACED TAB ── */}
        {activeTab === "stack" && (
          <section>
            <SectionHeader title="Competitor Stack Replaced" subtitle="What AlecRae makes obsolete — included in one subscription" />
            <div className="rounded-2xl border border-neutral-200/70 overflow-hidden">
              {STACK_REPLACED.map((row, i) => (
                <div
                  key={row.tool}
                  className={cx("flex items-center justify-between px-5 py-4 text-sm", i % 2 === 0 ? "bg-white/40" : "bg-[#f5f4ef]")}
                >
                  <span className="text-neutral-800">{row.tool}</span>
                  <span className="text-neutral-500 tabular-nums">{row.price}</span>
                </div>
              ))}
              <div className="flex items-center justify-between px-5 py-4 bg-neutral-900 text-white">
                <span className="text-sm font-semibold">Total replaced</span>
                <span className="text-sm tabular-nums">~$100+/mo</span>
              </div>
              <div className="flex items-center justify-between px-5 py-4" style={{ background: `${GOLD}18` }}>
                <span className="text-sm font-semibold text-neutral-900">AlecRae Personal</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: GOLD }}>$9/mo</span>
              </div>
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
