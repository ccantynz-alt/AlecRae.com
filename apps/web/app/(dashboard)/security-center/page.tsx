"use client";

/**
 * AlecRae — Security Center
 *
 * Security score, event log, trust settings, on-demand sender reputation,
 * and the full Security Intelligence suite (threat detection, policies,
 * audit log, sender reputation intelligence).
 *
 * API (Overview tab):
 *   GET  /v1/security                    → score + stats + trustSettings
 *   GET  /v1/security/events             → recent events[]
 *   POST /v1/security/verify-sender      → sender reputation check
 *   PATCH /v1/security/settings          → update trust settings
 *
 * API (Security Intelligence tabs — see components/security-intelligence-panels.tsx):
 *   POST   /v1/security-intelligence/scan
 *   POST   /v1/security-intelligence/scan/batch
 *   GET    /v1/security-intelligence/threats
 *   GET    /v1/security-intelligence/threats/:emailId
 *   POST   /v1/security-intelligence/threats/:id/action
 *   GET    /v1/security-intelligence/policies
 *   POST   /v1/security-intelligence/policies
 *   DELETE /v1/security-intelligence/policies/:id
 *   GET    /v1/security-intelligence/audit-log
 *   GET    /v1/security-intelligence/dashboard
 *   GET    /v1/security-intelligence/sender-reputation/:email
 *   POST   /v1/security-intelligence/report-phishing
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Box,
  Text,
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  PageLayout,
} from "@alecrae/ui";
import { getAccessToken } from "../../../lib/auth-token";
import {
  ThreatIntelligencePanel,
  PoliciesPanel,
  AuditLogPanel,
  SenderReputationPanel,
} from "../../../components/security-intelligence-panels";

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Mirrors `data` from GET /v1/security.
 *
 * That endpoint did not exist — the default Overview tab, the first thing
 * every user sees, 404'd on load for everyone. It now returns counts taken
 * from real rows.
 *
 * `score` is deliberately null: nothing in the product computes a security
 * score, and rendering an invented number in a gauge is the same fabrication
 * already removed from the threat-scanning endpoints.
 *
 * The four "trust settings" toggles that used to sit here are gone. They were
 * never stored anywhere (PATCH /v1/security/settings also did not exist), and
 * more importantly they controlled nothing: attachment scanning already runs
 * unconditionally on send, and the inbox strips all HTML, so external images
 * can never load regardless of a toggle. Adding a store for switches that no
 * code reads would have been theatre.
 */
interface SecurityOverview {
  score: number | null;
  scoreAvailable: boolean;
  threatsDetected: number;
  phishingReported: number;
  suspiciousSenders: number;
}

interface SecurityEvent {
  id: string;
  type: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  createdAt: string;
}

/**
 * Mirrors `data` from POST /v1/security/verify-sender.
 *
 * The previous shape here (`score` / `risk` / `details[]`) matched nothing the
 * endpoint returns, and the fetch also treated the `{ data }` envelope as the
 * result — so every field read was undefined. The real verification is far
 * richer than what the page was trying to show: live SPF/DKIM/DMARC lookups,
 * typosquat detection against known brands, and per-signal indicators.
 */
interface SenderVerificationResult {
  email: string;
  domain: string;
  spfPass: boolean;
  dkimPass: boolean;
  dmarcPass: boolean;
  reputationScore: number;
  trustLevel: "high" | "medium" | "low" | "suspicious";
  isKnownService: boolean;
  knownServiceName: string | null;
  isFreeEmailProvider: boolean;
  hasMxRecords: boolean;
  indicators: { type: "positive" | "negative" | "neutral"; message: string }[];
  typosquatMatch: { brand: string; legitimateDomain: string } | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.alecrae.com";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function gradeFromScore(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function scoreColorClass(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

function severityBadgeClass(severity: SecurityEvent["severity"]): string {
  switch (severity) {
    case "critical":
      return "bg-red-100 text-red-800 border border-red-200";
    case "high":
      return "bg-orange-100 text-orange-800 border border-orange-200";
    case "medium":
      return "bg-yellow-100 text-yellow-800 border border-yellow-200";
    case "low":
    default:
      return "bg-surface-raised text-content-subtle border border-border";
  }
}

/**
 * Colour for a sender's trust level. Note the scale runs the opposite way to
 * the old `risk` field this replaced: HIGH trust is good, where high risk was
 * bad. Getting that backwards would paint a trustworthy sender red.
 */
function riskBadgeClass(trust: SenderVerificationResult["trustLevel"]): string {
  switch (trust) {
    case "suspicious":
      return "bg-red-100 text-red-800 border border-red-200";
    case "low":
      return "bg-orange-100 text-orange-800 border border-orange-200";
    case "medium":
      return "bg-yellow-100 text-yellow-800 border border-yellow-200";
    case "high":
    default:
      return "bg-green-100 text-green-700 border border-green-200";
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function LoadingSkeleton(): ReactNode {
  return (
    <Box className="space-y-3" aria-busy="true" aria-label="Loading">
      {[1, 2, 3].map((i) => (
        <Box
          key={i}
          className="h-14 animate-pulse rounded-lg bg-surface-raised border border-border"
        />
      ))}
    </Box>
  );
}
LoadingSkeleton.displayName = "LoadingSkeleton";

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): ReactNode {
  return (
    <Box
      className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3"
      role="alert"
    >
      <Text variant="body-sm" className="text-red-800">
        {message}
      </Text>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Box>
  );
}
ErrorBanner.displayName = "ErrorBanner";

// ─── Score Card ────────────────────────────────────────────────────────────────

function ScoreCard({ overview }: { overview: SecurityOverview }): ReactNode {
  const hasScore = overview.scoreAvailable && overview.score !== null;
  const grade = hasScore ? gradeFromScore(overview.score as number) : "—";
  const color = hasScore ? scoreColorClass(overview.score as number) : "text-content-subtle";

  return (
    <Card>
      <CardContent>
        <Box className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Big score + grade */}
          <Box className="flex items-center gap-5">
            <Box className="flex flex-col items-center justify-center w-24 h-24 rounded-2xl bg-surface-raised border border-border">
              {/* No score is computed anywhere in the product. This used to
                  render a number the API never returned; showing a dash beats
                  inventing a grade for a security posture nobody measured. */}
              <Text variant="heading-lg" className={`font-bold leading-none ${color}`}>
                {hasScore ? overview.score : "—"}
              </Text>
              <Text variant="caption" className="text-content-subtle mt-0.5">
                {hasScore ? "/ 100" : "no score"}
              </Text>
            </Box>
            <Box>
              <Text variant="caption" className="text-content-subtle uppercase tracking-wide mb-0.5">
                Security Grade
              </Text>
              <Text variant="heading-lg" className={`font-bold leading-none ${color}`}>
                {grade}
              </Text>
              {!hasScore && (
                <Text variant="caption" className="text-content-subtle mt-1 block max-w-[22ch]">
                  Scoring isn&apos;t implemented yet — the counts beside this are real.
                </Text>
              )}
            </Box>
          </Box>

          {/* Stat pills */}
          <Box className="flex flex-wrap gap-4 flex-1">
            {(
              [
                { label: "Threats Detected", value: overview.threatsDetected },
                { label: "Phishing Reported", value: overview.phishingReported },
                { label: "Suspicious Senders", value: overview.suspiciousSenders },
              ] as const
            ).map(({ label, value }) => (
              <Box
                key={label}
                className="flex flex-col rounded-lg border border-border bg-surface-raised px-5 py-3 min-w-[140px]"
              >
                <Text variant="heading-md" className="font-bold text-content">
                  {value.toLocaleString()}
                </Text>
                <Text variant="caption" className="text-content-subtle mt-0.5">
                  {label}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
ScoreCard.displayName = "ScoreCard";

// ─── Events Table ──────────────────────────────────────────────────────────────

function EventsTable({
  events,
  loading,
  error,
  onRetry,
}: {
  events: SecurityEvent[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}): ReactNode {
  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          Recent Security Events
        </Text>
      </CardHeader>
      <CardContent>
        {loading && <LoadingSkeleton />}
        {!loading && error && <ErrorBanner message={error} onRetry={onRetry} />}
        {!loading && !error && events.length === 0 && (
          <Box className="py-8 text-center">
            <Text variant="body-sm" className="text-content-subtle">
              No security events recorded yet.
            </Text>
          </Box>
        )}
        {!loading && !error && events.length > 0 && (
          <Box className="overflow-x-auto">
            <Box
              as="table"
              className="w-full text-sm border-collapse"
              aria-label="Recent security events"
            >
              <Box as="thead">
                <Box as="tr" className="border-b border-border">
                  {["Time", "Type", "Description", "Severity"].map((h) => (
                    <Box
                      key={h}
                      as="th"
                      className="py-2 pr-4 text-left text-content-subtle font-medium text-xs uppercase tracking-wide"
                    >
                      {h}
                    </Box>
                  ))}
                </Box>
              </Box>
              <Box as="tbody">
                {events.map((ev) => (
                  <Box
                    key={ev.id}
                    as="tr"
                    className="border-b border-border last:border-0 hover:bg-surface-raised transition-colors"
                  >
                    <Box as="td" className="py-2.5 pr-4 whitespace-nowrap">
                      <Text variant="body-sm" className="text-content-subtle">
                        {formatTime(ev.createdAt)}
                      </Text>
                    </Box>
                    <Box as="td" className="py-2.5 pr-4 whitespace-nowrap">
                      <Text variant="body-sm" className="font-medium text-content">
                        {ev.type}
                      </Text>
                    </Box>
                    <Box as="td" className="py-2.5 pr-4">
                      <Text variant="body-sm" className="text-content">
                        {ev.description}
                      </Text>
                    </Box>
                    <Box as="td" className="py-2.5 pr-4 whitespace-nowrap">
                      <Box
                        as="span"
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${severityBadgeClass(ev.severity)}`}
                      >
                        {ev.severity}
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
EventsTable.displayName = "EventsTable";


// ─── Sender Verification ───────────────────────────────────────────────────────

function SenderVerificationCard(): ReactNode {
  const [emailInput, setEmailInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<SenderVerificationResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  async function handleCheck(e: FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    setChecking(true);
    setResult(null);
    setCheckError(null);
    try {
      const res = await apiFetch<{ data: SenderVerificationResult }>(
        "/v1/security/verify-sender",
        { method: "POST", body: JSON.stringify({ email: trimmed }) },
      );
      setResult(res.data);
    } catch (err) {
      setCheckError(errMsg(err));
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          Sender Verification
        </Text>
        <Text variant="body-sm" className="text-content-subtle">
          Check any email address for reputation and risk signals before engaging.
        </Text>
      </CardHeader>
      <CardContent>
        <Box
          as="form"
          className="flex gap-2"
          onSubmit={(e: FormEvent) => void handleCheck(e)}
          aria-label="Verify sender reputation"
        >
          <Input
            type="email"
            placeholder="someone@example.com"
            value={emailInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmailInput(e.target.value)}
            aria-label="Sender email address"
            className="flex-1"
            required
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={checking || !emailInput.trim()}
          >
            {checking ? "Checking…" : "Check Reputation"}
          </Button>
        </Box>

        {checkError && (
          <Box
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
            role="alert"
          >
            <Text variant="body-sm" className="text-red-800">
              {checkError}
            </Text>
          </Box>
        )}

        {result && (
          <Box className="mt-4 rounded-lg border border-border bg-surface-raised p-4 space-y-3">
            <Box className="flex items-center justify-between gap-3 flex-wrap">
              <Box>
                <Text variant="body-sm" className="font-semibold text-content">
                  {result.email}
                </Text>
                <Text variant="caption" className="text-content-subtle">
                  Reputation score: {result.reputationScore}/100
                  {result.knownServiceName ? ` · ${result.knownServiceName}` : ""}
                  {result.isFreeEmailProvider ? " · free email provider" : ""}
                </Text>
              </Box>
              <Box
                as="span"
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${riskBadgeClass(result.trustLevel)}`}
              >
                {result.trustLevel} trust
              </Box>
            </Box>

            {/* Real authentication results from live DNS lookups — the most
                useful part of this check, and previously not rendered at all. */}
            <Box className="flex flex-wrap gap-2" aria-label="Authentication results">
              {(
                [
                  { label: "SPF", pass: result.spfPass },
                  { label: "DKIM", pass: result.dkimPass },
                  { label: "DMARC", pass: result.dmarcPass },
                  { label: "MX", pass: result.hasMxRecords },
                ] as const
              ).map(({ label, pass }) => (
                <Box
                  key={label}
                  as="span"
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    pass ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                  }`}
                >
                  {label} {pass ? "pass" : "fail"}
                </Box>
              ))}
            </Box>

            {result.typosquatMatch && (
              <Box
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2"
                role="alert"
              >
                <Text variant="body-sm" className="text-red-800">
                  This domain closely resembles{" "}
                  <strong>{result.typosquatMatch.legitimateDomain}</strong> (
                  {result.typosquatMatch.brand}) — a common impersonation tactic.
                </Text>
              </Box>
            )}

            {result.indicators.length > 0 && (
              <Box as="ul" className="space-y-1 pl-1" aria-label="Verification details">
                {result.indicators.map((indicator, idx) => (
                  <Box key={idx} as="li" className="flex items-start gap-2">
                    <Box
                      as="span"
                      className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        indicator.type === "positive"
                          ? "bg-green-500"
                          : indicator.type === "negative"
                            ? "bg-red-500"
                            : "bg-content-subtle"
                      }`}
                    />
                    <Text variant="body-sm" className="text-content">
                      {indicator.message}
                    </Text>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
SenderVerificationCard.displayName = "SenderVerificationCard";

// ─── Tabs ──────────────────────────────────────────────────────────────────────

type TabId = "overview" | "threats" | "policies" | "audit-log" | "reputation";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "threats", label: "Threat Intelligence" },
  { id: "policies", label: "Policies" },
  { id: "audit-log", label: "Audit Log" },
  { id: "reputation", label: "Sender Reputation" },
];

function TabBar({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
}): ReactNode {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const currentIndex = TABS.findIndex((t) => t.id === active);
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight") nextIndex = (currentIndex + 1) % TABS.length;
    else if (e.key === "ArrowLeft") nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    e.preventDefault();
    const nextTab = TABS[nextIndex];
    if (!nextTab) return;
    onChange(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <Box
      role="tablist"
      aria-label="Security Center sections"
      className="flex gap-1 overflow-x-auto border-b border-border"
      onKeyDown={handleKeyDown}
    >
      {TABS.map((tab, i) => {
        const selected = tab.id === active;
        return (
          <Box
            key={tab.id}
            as="button"
            type="button"
            role="tab"
            id={`security-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`security-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            ref={(el: HTMLButtonElement | null) => {
              tabRefs.current[i] = el;
            }}
            onClick={() => onChange(tab.id)}
            className={[
              "whitespace-nowrap px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 rounded-t-md",
              selected
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-content-subtle hover:text-content hover:border-border",
            ].join(" ")}
          >
            {tab.label}
          </Box>
        );
      })}
    </Box>
  );
}
TabBar.displayName = "TabBar";

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SecurityPage(): ReactNode {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);


  const loadOverview = useCallback(async (): Promise<void> => {
    setLoadingOverview(true);
    setOverviewError(null);
    try {
      const res = await apiFetch<{ data: SecurityOverview }>("/v1/security");
      setOverview(res.data);
    } catch (err) {
      setOverviewError(errMsg(err));
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const loadEvents = useCallback(async (): Promise<void> => {
    setLoadingEvents(true);
    setEventsError(null);
    try {
      const res = await apiFetch<{ data: SecurityEvent[] }>("/v1/security/events");
      setEvents(res.data);
    } catch (err) {
      setEventsError(errMsg(err));
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
    void loadEvents();
  }, [loadOverview, loadEvents]);


  return (
    <PageLayout
      title="Security Center"
      description="Monitor threats, manage trust settings, and verify senders."
    >
      <Box className="space-y-6">
        <TabBar active={activeTab} onChange={setActiveTab} />

        {activeTab === "overview" && (
          <Box
            role="tabpanel"
            id="security-panel-overview"
            aria-labelledby="security-tab-overview"
            className="space-y-6"
          >
            {/* Overview / score */}
            {loadingOverview && (
              <Box className="h-36 animate-pulse rounded-xl bg-surface-raised border border-border" />
            )}
            {!loadingOverview && overviewError && (
              <ErrorBanner message={overviewError} onRetry={() => void loadOverview()} />
            )}
            {!loadingOverview && overview && <ScoreCard overview={overview} />}

            {/* Events */}
            <EventsTable
              events={events}
              loading={loadingEvents}
              error={eventsError}
              onRetry={() => void loadEvents()}
            />

            {/*
              The Trust Settings card was removed rather than repaired. Its four
              toggles had no backing store (PATCH /v1/security/settings never
              existed) and, more to the point, controlled nothing: attachment
              scanning already runs unconditionally on send, and the inbox
              strips all HTML so external images cannot load either way.
              Switches that change no behaviour are worse than no switches.
            */}

            {/* Sender verification */}
            <SenderVerificationCard />
          </Box>
        )}

        {activeTab === "threats" && (
          <Box
            role="tabpanel"
            id="security-panel-threats"
            aria-labelledby="security-tab-threats"
          >
            <ThreatIntelligencePanel />
          </Box>
        )}

        {activeTab === "policies" && (
          <Box
            role="tabpanel"
            id="security-panel-policies"
            aria-labelledby="security-tab-policies"
          >
            <PoliciesPanel />
          </Box>
        )}

        {activeTab === "audit-log" && (
          <Box
            role="tabpanel"
            id="security-panel-audit-log"
            aria-labelledby="security-tab-audit-log"
          >
            <AuditLogPanel />
          </Box>
        )}

        {activeTab === "reputation" && (
          <Box
            role="tabpanel"
            id="security-panel-reputation"
            aria-labelledby="security-tab-reputation"
          >
            <SenderReputationPanel />
          </Box>
        )}
      </Box>
    </PageLayout>
  );
}
