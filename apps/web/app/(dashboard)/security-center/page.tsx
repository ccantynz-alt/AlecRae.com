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

interface TrustSettings {
  linkScanning: boolean;
  attachmentScanning: boolean;
  blockExternalImages: boolean;
  senderVerification: boolean;
}

interface SecurityOverview {
  score: number;
  phishingBlocked: number;
  suspiciousSenders: number;
  threatsDetected: number;
  trustSettings: TrustSettings;
}

interface SecurityEvent {
  id: string;
  type: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  createdAt: string;
}

interface SenderVerificationResult {
  email: string;
  score: number;
  risk: "low" | "medium" | "high";
  details: string[];
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

function riskBadgeClass(risk: SenderVerificationResult["risk"]): string {
  switch (risk) {
    case "high":
      return "bg-red-100 text-red-800 border border-red-200";
    case "medium":
      return "bg-yellow-100 text-yellow-800 border border-yellow-200";
    case "low":
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
  const grade = gradeFromScore(overview.score);
  const color = scoreColorClass(overview.score);

  return (
    <Card>
      <CardContent>
        <Box className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Big score + grade */}
          <Box className="flex items-center gap-5">
            <Box className="flex flex-col items-center justify-center w-24 h-24 rounded-2xl bg-surface-raised border border-border">
              <Text variant="heading-lg" className={`font-bold leading-none ${color}`}>
                {overview.score}
              </Text>
              <Text variant="caption" className="text-content-subtle mt-0.5">
                / 100
              </Text>
            </Box>
            <Box>
              <Text variant="caption" className="text-content-subtle uppercase tracking-wide mb-0.5">
                Security Grade
              </Text>
              <Text variant="heading-lg" className={`font-bold leading-none ${color}`}>
                {grade}
              </Text>
            </Box>
          </Box>

          {/* Stat pills */}
          <Box className="flex flex-wrap gap-4 flex-1">
            {(
              [
                { label: "Phishing Blocked", value: overview.phishingBlocked },
                { label: "Suspicious Senders", value: overview.suspiciousSenders },
                { label: "Threats Detected", value: overview.threatsDetected },
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

// ─── Trust Settings ────────────────────────────────────────────────────────────

const TRUST_TOGGLES: {
  key: keyof TrustSettings;
  label: string;
  description: string;
}[] = [
  {
    key: "linkScanning",
    label: "Link scanning",
    description: "Scan all URLs in emails for phishing and malware.",
  },
  {
    key: "attachmentScanning",
    label: "Attachment scanning",
    description: "Check attachments for viruses and malicious content.",
  },
  {
    key: "blockExternalImages",
    label: "Block external images",
    description: "Prevent remote images from loading (stops tracking pixels).",
  },
  {
    key: "senderVerification",
    label: "Sender verification",
    description: "Verify SPF/DKIM/DMARC and flag suspicious senders.",
  },
];

function TrustSettingsCard({
  settings,
  onChange,
  saving,
}: {
  settings: TrustSettings;
  onChange: (key: keyof TrustSettings, value: boolean) => void;
  saving: boolean;
}): ReactNode {
  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          Trust Settings
        </Text>
      </CardHeader>
      <CardContent>
        <Box className="divide-y divide-border">
          {TRUST_TOGGLES.map(({ key, label, description }) => (
            <Box
              key={key}
              className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
            >
              <Box className="flex-1 min-w-0">
                <Text variant="body-sm" className="font-medium text-content">
                  {label}
                </Text>
                <Text variant="caption" className="text-content-subtle">
                  {description}
                </Text>
              </Box>
              <Box
                as="button"
                role="switch"
                aria-checked={settings[key]}
                aria-label={label}
                disabled={saving}
                onClick={() => onChange(key, !settings[key])}
                className={[
                  "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2",
                  settings[key] ? "bg-brand-600" : "bg-surface-raised border border-border",
                  saving ? "opacity-50 cursor-not-allowed" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <Box
                  as="span"
                  aria-hidden="true"
                  className={[
                    "inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200",
                    settings[key] ? "translate-x-5" : "translate-x-0",
                  ].join(" ")}
                />
              </Box>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}
TrustSettingsCard.displayName = "TrustSettingsCard";

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
      const data = await apiFetch<SenderVerificationResult>("/v1/security/verify-sender", {
        method: "POST",
        body: JSON.stringify({ email: trimmed }),
      });
      setResult(data);
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
                  Reputation score: {result.score}/100
                </Text>
              </Box>
              <Box
                as="span"
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${riskBadgeClass(result.risk)}`}
              >
                {result.risk} risk
              </Box>
            </Box>

            {result.details.length > 0 && (
              <Box as="ul" className="space-y-1 pl-1" aria-label="Verification details">
                {result.details.map((detail, idx) => (
                  <Box key={idx} as="li" className="flex items-start gap-2">
                    <Box
                      as="span"
                      className="mt-1.5 w-1.5 h-1.5 rounded-full bg-content-subtle flex-shrink-0"
                    />
                    <Text variant="body-sm" className="text-content">
                      {detail}
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

  const [savingSettings, setSavingSettings] = useState(false);

  const loadOverview = useCallback(async (): Promise<void> => {
    setLoadingOverview(true);
    setOverviewError(null);
    try {
      const data = await apiFetch<SecurityOverview>("/v1/security");
      setOverview(data);
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
      const data = await apiFetch<SecurityEvent[]>("/v1/security/events");
      setEvents(data);
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

  async function handleToggle(key: keyof TrustSettings, value: boolean): Promise<void> {
    if (!overview) return;
    const prev = overview;
    // Optimistic update
    setOverview({ ...overview, trustSettings: { ...overview.trustSettings, [key]: value } });
    setSavingSettings(true);
    try {
      await apiFetch<unknown>("/v1/security/settings", {
        method: "PATCH",
        body: JSON.stringify({ [key]: value }),
      });
    } catch {
      // Roll back on failure
      setOverview(prev);
    } finally {
      setSavingSettings(false);
    }
  }

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

            {/* Trust settings — only when overview loaded */}
            {!loadingOverview && overview && (
              <TrustSettingsCard
                settings={overview.trustSettings}
                onChange={(key, value) => void handleToggle(key, value)}
                saving={savingSettings}
              />
            )}

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
