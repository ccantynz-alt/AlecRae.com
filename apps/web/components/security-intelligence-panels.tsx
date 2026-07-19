"use client";

/**
 * Security Intelligence panels for the Security Center page.
 *
 * Wires the full /v1/security-intelligence route family:
 *   - ThreatIntelligencePanel  → dashboard, scan, scan/batch, threats,
 *                                threats/:emailId, threats/:id/action,
 *                                report-phishing
 *   - PoliciesPanel            → policies (list/create/delete)
 *   - AuditLogPanel            → audit-log
 *   - SenderReputationPanel    → sender-reputation/:email
 */

import {
  useState,
  useEffect,
  useCallback,
  type ChangeEvent,
  type FormEvent,
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
} from "@alecrae/ui";
import {
  securityIntelligenceApi,
  type AuditLogEntryData,
  type BatchScanResponse,
  type CreatePolicyInput,
  type SecurityAuditEventType,
  type SecurityDashboardData,
  type SecurityPolicyData,
  type SecurityPolicyType,
  type SenderReputationData,
  type ThreatActionInput,
  type ThreatDetectionData,
  type ThreatSeverity,
  type ThreatType,
} from "../lib/api-security-intelligence";

// ─── Shared helpers ────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

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

function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

function severityBadgeClass(severity: ThreatSeverity): string {
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

function userActionBadgeClass(action: ThreatDetectionData["userAction"]): string {
  switch (action) {
    case "quarantined":
      return "bg-orange-100 text-orange-800 border border-orange-200";
    case "reported":
      return "bg-red-100 text-red-800 border border-red-200";
    case "dismissed":
    default:
      return "bg-surface-raised text-content-subtle border border-border";
  }
}

const THREAT_TYPES: ThreatType[] = [
  "phishing",
  "malware",
  "spam",
  "impersonation",
  "business_email_compromise",
  "credential_harvesting",
];

const SEVERITIES: ThreatSeverity[] = ["critical", "high", "medium", "low"];

const POLICY_TYPES: { value: SecurityPolicyType; label: string; hint: string }[] = [
  { value: "block_sender", label: "Block sender", hint: "Email address to block" },
  { value: "block_domain", label: "Block domain", hint: "Domain to block (e.g. example.com)" },
  { value: "require_tls", label: "Require TLS", hint: "Domain that must use TLS" },
  {
    value: "quarantine_attachments",
    label: "Quarantine attachments",
    hint: "File extension or sender to quarantine",
  },
  { value: "flag_external", label: "Flag external", hint: "Internal domain (others flagged)" },
];

const AUDIT_EVENT_TYPES: SecurityAuditEventType[] = [
  "threat_detected",
  "policy_created",
  "policy_deleted",
  "sender_blocked",
  "email_quarantined",
  "settings_changed",
];

function PanelLoadingSkeleton({ rows = 3 }: { rows?: number }): ReactNode {
  return (
    <Box className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Box
          key={i}
          className="h-14 animate-pulse rounded-lg bg-surface-raised border border-border"
        />
      ))}
    </Box>
  );
}
PanelLoadingSkeleton.displayName = "PanelLoadingSkeleton";

function PanelErrorBanner({
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
PanelErrorBanner.displayName = "PanelErrorBanner";

function SuccessBanner({ message }: { message: string }): ReactNode {
  return (
    <Box
      className="rounded-lg border border-green-200 bg-green-50 px-4 py-3"
      role="status"
    >
      <Text variant="body-sm" className="text-green-800">
        {message}
      </Text>
    </Box>
  );
}
SuccessBanner.displayName = "SuccessBanner";

const SELECT_CLASS =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-content focus:outline-none focus:ring-2 focus:ring-brand-600";

// ─── Threat detail card (scan / lookup result) ─────────────────────────────────

const SIGNAL_LABELS: { key: keyof NonNullable<ThreatDetectionData["signals"]>; label: string }[] = [
  { key: "urlMismatch", label: "URL mismatch" },
  { key: "senderSpoofed", label: "Sender spoofed" },
  { key: "urgentLanguage", label: "Urgent language" },
  { key: "attachmentRisk", label: "Risky attachment" },
  { key: "newSender", label: "New sender" },
  { key: "replyToMismatch", label: "Reply-To mismatch" },
];

function ThreatDetailCard({ threat }: { threat: ThreatDetectionData }): ReactNode {
  const activeSignals = SIGNAL_LABELS.filter(
    ({ key }) => threat.signals?.[key] === true,
  );

  return (
    <Box className="rounded-lg border border-border bg-surface-raised p-4 space-y-3">
      <Box className="flex items-center justify-between gap-3 flex-wrap">
        <Box>
          <Text variant="body-sm" className="font-semibold text-content">
            Email {threat.emailId}
          </Text>
          <Text variant="caption" className="text-content-subtle">
            Scanned {formatTime(threat.createdAt)} · Confidence{" "}
            {Math.round(threat.confidence * 100)}%
          </Text>
        </Box>
        <Box className="flex items-center gap-2">
          <Box
            as="span"
            className="rounded-full px-2.5 py-0.5 text-xs font-medium capitalize bg-surface border border-border text-content"
          >
            {humanize(threat.threatType)}
          </Box>
          <Box
            as="span"
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${severityBadgeClass(threat.severity)}`}
          >
            {threat.severity}
          </Box>
          {threat.userAction && (
            <Box
              as="span"
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${userActionBadgeClass(threat.userAction)}`}
            >
              {threat.userAction}
            </Box>
          )}
        </Box>
      </Box>

      {activeSignals.length > 0 && (
        <Box className="flex flex-wrap gap-1.5" aria-label="Threat signals">
          {activeSignals.map(({ key, label }) => (
            <Box
              key={key}
              as="span"
              className="rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200 px-2 py-0.5 text-xs"
            >
              {label}
            </Box>
          ))}
          {typeof threat.signals?.domainAge === "number" && (
            <Box
              as="span"
              className="rounded-full bg-surface border border-border text-content-subtle px-2 py-0.5 text-xs"
            >
              Domain age: {threat.signals.domainAge} days
            </Box>
          )}
        </Box>
      )}

      {threat.aiExplanation && (
        <Text variant="body-sm" className="text-content">
          {threat.aiExplanation}
        </Text>
      )}
    </Box>
  );
}
ThreatDetailCard.displayName = "ThreatDetailCard";

// ─── Dashboard stats ────────────────────────────────────────────────────────────

function DashboardStatsCard(): ReactNode {
  const [stats, setStats] = useState<SecurityDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await securityIntelligenceApi.dashboard();
      setStats(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          Threat Dashboard
        </Text>
      </CardHeader>
      <CardContent>
        {loading && <PanelLoadingSkeleton rows={2} />}
        {!loading && error && (
          <PanelErrorBanner message={error} onRetry={() => void load()} />
        )}
        {!loading && !error && stats && (
          <Box className="space-y-4">
            <Box className="flex flex-wrap gap-4">
              {(
                [
                  { label: "Total Threats", value: stats.totalThreats },
                  { label: "Blocked Senders", value: stats.blockedSenders },
                  { label: "Active Policies", value: stats.activePolicies },
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

            {(stats.threatsByType.length > 0 || stats.threatsBySeverity.length > 0) && (
              <Box className="grid gap-4 sm:grid-cols-2">
                <Box>
                  <Text
                    variant="caption"
                    className="text-content-subtle uppercase tracking-wide mb-1.5"
                  >
                    By type
                  </Text>
                  {stats.threatsByType.length === 0 ? (
                    <Text variant="body-sm" className="text-content-subtle">
                      No threats yet.
                    </Text>
                  ) : (
                    <Box className="flex flex-wrap gap-1.5">
                      {stats.threatsByType.map(({ type, count: n }) => (
                        <Box
                          key={type}
                          as="span"
                          className="rounded-full bg-surface-raised border border-border px-2.5 py-0.5 text-xs text-content capitalize"
                        >
                          {humanize(type)}: {n}
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
                <Box>
                  <Text
                    variant="caption"
                    className="text-content-subtle uppercase tracking-wide mb-1.5"
                  >
                    By severity
                  </Text>
                  {stats.threatsBySeverity.length === 0 ? (
                    <Text variant="body-sm" className="text-content-subtle">
                      No threats yet.
                    </Text>
                  ) : (
                    <Box className="flex flex-wrap gap-1.5">
                      {stats.threatsBySeverity.map(({ severity, count: n }) => (
                        <Box
                          key={severity}
                          as="span"
                          className={`rounded-full px-2.5 py-0.5 text-xs capitalize ${severityBadgeClass(severity)}`}
                        >
                          {severity}: {n}
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
DashboardStatsCard.displayName = "DashboardStatsCard";

// ─── Scan / lookup card ─────────────────────────────────────────────────────────

function ThreatScanCard(): ReactNode {
  const [emailId, setEmailId] = useState("");
  const [busy, setBusy] = useState<"scan" | "lookup" | null>(null);
  const [result, setResult] = useState<ThreatDetectionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(mode: "scan" | "lookup"): Promise<void> {
    const trimmed = emailId.trim();
    if (!trimmed || busy) return;
    setBusy(mode);
    setResult(null);
    setError(null);
    try {
      const res =
        mode === "scan"
          ? await securityIntelligenceApi.scan(trimmed)
          : await securityIntelligenceApi.getThreatForEmail(trimmed);
      setResult(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          Scan an Email
        </Text>
        <Text variant="body-sm" className="text-content-subtle">
          Run AI threat analysis on a single email, or look up an existing scan result.
        </Text>
      </CardHeader>
      <CardContent>
        <Box
          as="form"
          className="flex flex-col sm:flex-row gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void run("scan");
          }}
          aria-label="Scan email for threats"
        >
          <Input
            type="text"
            placeholder="Email ID"
            value={emailId}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmailId(e.target.value)}
            aria-label="Email ID to scan"
            className="flex-1"
            required
          />
          <Box className="flex gap-2">
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={busy !== null || !emailId.trim()}
            >
              {busy === "scan" ? "Scanning…" : "Scan"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="md"
              disabled={busy !== null || !emailId.trim()}
              onClick={() => void run("lookup")}
            >
              {busy === "lookup" ? "Looking up…" : "Look up existing"}
            </Button>
          </Box>
        </Box>

        {error && (
          <Box className="mt-3">
            <PanelErrorBanner message={error} />
          </Box>
        )}
        {result && (
          <Box className="mt-4">
            <ThreatDetailCard threat={result} />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
ThreatScanCard.displayName = "ThreatScanCard";

// ─── Batch scan card ────────────────────────────────────────────────────────────

function BatchScanCard(): ReactNode {
  const [rawIds, setRawIds] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<BatchScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ids = rawIds
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (ids.length === 0 || scanning) return;
    setScanning(true);
    setResult(null);
    setError(null);
    try {
      const res = await securityIntelligenceApi.scanBatch(ids.slice(0, 50));
      setResult(res);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setScanning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          Batch Scan
        </Text>
        <Text variant="body-sm" className="text-content-subtle">
          Scan up to 50 emails at once. Enter one email ID per line (or comma-separated).
        </Text>
      </CardHeader>
      <CardContent>
        <Box as="form" className="space-y-3" onSubmit={(e: FormEvent) => void handleSubmit(e)} aria-label="Batch scan emails">
          <Box
            as="textarea"
            rows={4}
            placeholder={"email-id-1\nemail-id-2\nemail-id-3"}
            value={rawIds}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setRawIds(e.target.value)}
            aria-label="Email IDs to scan, one per line"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-content font-mono focus:outline-none focus:ring-2 focus:ring-brand-600 resize-y"
          />
          <Box className="flex items-center justify-between gap-3 flex-wrap">
            <Text variant="caption" className="text-content-subtle">
              {ids.length === 0
                ? "No email IDs entered."
                : `${Math.min(ids.length, 50)} email${ids.length === 1 ? "" : "s"} ready${ids.length > 50 ? " (first 50 will be scanned)" : ""}.`}
            </Text>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={scanning || ids.length === 0}
            >
              {scanning ? "Scanning…" : "Scan Batch"}
            </Button>
          </Box>
        </Box>

        {error && (
          <Box className="mt-3">
            <PanelErrorBanner message={error} />
          </Box>
        )}
        {result && (
          <Box className="mt-3">
            <SuccessBanner
              message={`Batch checked: ${result.alreadyScanned} already had a scan on file, ${result.unavailable} have no analysis available yet (${result.total} total). Threat analysis isn't implemented yet — nothing was fabricated for the ${result.unavailable} unscanned email${result.unavailable === 1 ? "" : "s"}.`}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
BatchScanCard.displayName = "BatchScanCard";

// ─── Threats list ───────────────────────────────────────────────────────────────

function ThreatsListCard(): ReactNode {
  const [threats, setThreats] = useState<ThreatDetectionData[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [severity, setSeverity] = useState<ThreatSeverity | "">("");
  const [type, setType] = useState<ThreatType | "">("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(
    async (nextCursor?: string): Promise<void> => {
      if (nextCursor) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await securityIntelligenceApi.listThreats({
          limit: PAGE_SIZE,
          ...(nextCursor ? { cursor: nextCursor } : {}),
          ...(severity ? { severity } : {}),
          ...(type ? { type } : {}),
        });
        setThreats((prev) => (nextCursor ? [...prev, ...res.data] : res.data));
        setCursor(res.cursor);
        setHasMore(res.hasMore);
      } catch (err) {
        setError(errMsg(err));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [severity, type],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAction(id: string, action: ThreatActionInput): Promise<void> {
    if (actingId) return;
    setActingId(id);
    setActionError(null);
    try {
      const res = await securityIntelligenceApi.threatAction(id, action);
      setThreats((prev) =>
        prev.map((t) => (t.id === id ? { ...t, userAction: res.data.userAction } : t)),
      );
    } catch (err) {
      setActionError(errMsg(err));
    } finally {
      setActingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between gap-3 flex-wrap">
          <Text variant="heading-sm" className="font-semibold">
            Detected Threats
          </Text>
          <Box className="flex gap-2">
            <Box
              as="select"
              value={severity}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setSeverity(e.target.value as ThreatSeverity | "")
              }
              aria-label="Filter by severity"
              className={SELECT_CLASS}
            >
              <option value="">All severities</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </Box>
            <Box
              as="select"
              value={type}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setType(e.target.value as ThreatType | "")
              }
              aria-label="Filter by threat type"
              className={SELECT_CLASS}
            >
              <option value="">All types</option>
              {THREAT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {humanize(t).replace(/^./, (c) => c.toUpperCase())}
                </option>
              ))}
            </Box>
          </Box>
        </Box>
      </CardHeader>
      <CardContent>
        {loading && <PanelLoadingSkeleton />}
        {!loading && error && (
          <PanelErrorBanner message={error} onRetry={() => void load()} />
        )}
        {!loading && !error && threats.length === 0 && (
          <Box className="py-8 text-center">
            <Text variant="body-sm" className="text-content-subtle">
              No threats detected{severity || type ? " for these filters" : " yet"}.
            </Text>
          </Box>
        )}
        {!loading && !error && threats.length > 0 && (
          <Box className="space-y-3">
            {actionError && <PanelErrorBanner message={actionError} />}
            <Box className="overflow-x-auto">
              <Box
                as="table"
                className="w-full text-sm border-collapse"
                aria-label="Detected threats"
              >
                <Box as="thead">
                  <Box as="tr" className="border-b border-border">
                    {["Time", "Email", "Type", "Severity", "Confidence", "Status", "Actions"].map(
                      (h) => (
                        <Box
                          key={h}
                          as="th"
                          className="py-2 pr-4 text-left text-content-subtle font-medium text-xs uppercase tracking-wide"
                        >
                          {h}
                        </Box>
                      ),
                    )}
                  </Box>
                </Box>
                <Box as="tbody">
                  {threats.map((t) => (
                    <Box
                      key={t.id}
                      as="tr"
                      className="border-b border-border last:border-0 hover:bg-surface-raised transition-colors"
                    >
                      <Box as="td" className="py-2.5 pr-4 whitespace-nowrap">
                        <Text variant="body-sm" className="text-content-subtle">
                          {formatTime(t.createdAt)}
                        </Text>
                      </Box>
                      <Box as="td" className="py-2.5 pr-4">
                        <Text
                          variant="body-sm"
                          className="text-content font-mono text-xs break-all"
                        >
                          {t.emailId}
                        </Text>
                      </Box>
                      <Box as="td" className="py-2.5 pr-4 whitespace-nowrap">
                        <Text variant="body-sm" className="text-content capitalize">
                          {humanize(t.threatType)}
                        </Text>
                      </Box>
                      <Box as="td" className="py-2.5 pr-4 whitespace-nowrap">
                        <Box
                          as="span"
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${severityBadgeClass(t.severity)}`}
                        >
                          {t.severity}
                        </Box>
                      </Box>
                      <Box as="td" className="py-2.5 pr-4 whitespace-nowrap">
                        <Text variant="body-sm" className="text-content-subtle">
                          {Math.round(t.confidence * 100)}%
                        </Text>
                      </Box>
                      <Box as="td" className="py-2.5 pr-4 whitespace-nowrap">
                        {t.userAction ? (
                          <Box
                            as="span"
                            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${userActionBadgeClass(t.userAction)}`}
                          >
                            {t.userAction}
                          </Box>
                        ) : (
                          <Text variant="caption" className="text-content-subtle">
                            —
                          </Text>
                        )}
                      </Box>
                      <Box as="td" className="py-2.5 whitespace-nowrap">
                        <Box className="flex gap-1">
                          {(
                            [
                              { action: "report", label: "Report" },
                              { action: "dismiss", label: "Dismiss" },
                              { action: "quarantine", label: "Quarantine" },
                            ] as const
                          ).map(({ action, label }) => (
                            <Button
                              key={action}
                              variant="ghost"
                              size="sm"
                              disabled={actingId !== null}
                              onClick={() => void handleAction(t.id, action)}
                              aria-label={`${label} threat on email ${t.emailId}`}
                            >
                              {actingId === t.id ? "…" : label}
                            </Button>
                          ))}
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
            {hasMore && cursor && (
              <Box className="flex justify-center pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => void load(cursor)}
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              </Box>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
ThreatsListCard.displayName = "ThreatsListCard";

// ─── Report phishing card ───────────────────────────────────────────────────────

function ReportPhishingCard(): ReactNode {
  const [emailId, setEmailId] = useState("");
  const [reason, setReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = emailId.trim();
    if (!trimmed || reporting) return;
    setReporting(true);
    setSuccess(null);
    setError(null);
    try {
      const res = await securityIntelligenceApi.reportPhishing(
        trimmed,
        reason.trim() || undefined,
      );
      const updated = "status" in res.data && res.data.status === "updated_to_reported";
      setSuccess(
        updated
          ? `Existing threat detection for ${trimmed} marked as reported.`
          : `Email ${trimmed} reported as phishing. Thank you for keeping AlecRae safe.`,
      );
      setEmailId("");
      setReason("");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setReporting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          Report Phishing
        </Text>
        <Text variant="body-sm" className="text-content-subtle">
          Report an email as phishing. It will be flagged as a high-severity threat.
        </Text>
      </CardHeader>
      <CardContent>
        <Box
          as="form"
          className="flex flex-col sm:flex-row gap-2"
          onSubmit={(e: FormEvent) => void handleSubmit(e)}
          aria-label="Report phishing email"
        >
          <Input
            type="text"
            placeholder="Email ID"
            value={emailId}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmailId(e.target.value)}
            aria-label="Email ID to report"
            className="flex-1"
            required
          />
          <Input
            type="text"
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setReason(e.target.value)}
            aria-label="Reason for report (optional)"
            className="flex-1"
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={reporting || !emailId.trim()}
          >
            {reporting ? "Reporting…" : "Report"}
          </Button>
        </Box>

        {error && (
          <Box className="mt-3">
            <PanelErrorBanner message={error} />
          </Box>
        )}
        {success && (
          <Box className="mt-3">
            <SuccessBanner message={success} />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
ReportPhishingCard.displayName = "ReportPhishingCard";

// ─── Threat Intelligence panel (composition) ────────────────────────────────────

export function ThreatIntelligencePanel(): ReactNode {
  return (
    <Box className="space-y-6">
      <DashboardStatsCard />
      <ThreatScanCard />
      <BatchScanCard />
      <ThreatsListCard />
      <ReportPhishingCard />
    </Box>
  );
}
ThreatIntelligencePanel.displayName = "ThreatIntelligencePanel";

// ─── Policies panel ─────────────────────────────────────────────────────────────

export function PoliciesPanel(): ReactNode {
  const [policies, setPolicies] = useState<SecurityPolicyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<SecurityPolicyType>("block_sender");
  const [value, setValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await securityIntelligenceApi.listPolicies();
      setPolicies(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    const input: CreatePolicyInput = {
      name: name.trim(),
      type,
      value: value.trim(),
    };
    if (!input.name || !input.value || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await securityIntelligenceApi.createPolicy(input);
      setPolicies((prev) => [res.data, ...prev]);
      setName("");
      setValue("");
    } catch (err) {
      setCreateError(errMsg(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    if (deletingId) return;
    setDeletingId(id);
    setDeleteError(null);
    try {
      await securityIntelligenceApi.deletePolicy(id);
      setPolicies((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setDeleteError(errMsg(err));
    } finally {
      setDeletingId(null);
    }
  }

  const selectedType = POLICY_TYPES.find((p) => p.value === type);

  return (
    <Box className="space-y-6">
      <Card>
        <CardHeader>
          <Text variant="heading-sm" className="font-semibold">
            Create Security Policy
          </Text>
          <Text variant="body-sm" className="text-content-subtle">
            Policies automatically block senders, block domains, require TLS, quarantine
            attachments, or flag external mail.
          </Text>
        </CardHeader>
        <CardContent>
          <Box
            as="form"
            className="flex flex-col sm:flex-row gap-2"
            onSubmit={(e: FormEvent) => void handleCreate(e)}
            aria-label="Create security policy"
          >
            <Input
              type="text"
              placeholder="Policy name"
              value={name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              aria-label="Policy name"
              className="flex-1"
              required
            />
            <Box
              as="select"
              value={type}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setType(e.target.value as SecurityPolicyType)
              }
              aria-label="Policy type"
              className={SELECT_CLASS}
            >
              {POLICY_TYPES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Box>
            <Input
              type="text"
              placeholder={selectedType?.hint ?? "Value"}
              value={value}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
              aria-label="Policy value"
              className="flex-1"
              required
            />
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={creating || !name.trim() || !value.trim()}
            >
              {creating ? "Creating…" : "Create Policy"}
            </Button>
          </Box>
          {createError && (
            <Box className="mt-3">
              <PanelErrorBanner message={createError} />
            </Box>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Text variant="heading-sm" className="font-semibold">
            Active Policies
          </Text>
        </CardHeader>
        <CardContent>
          {loading && <PanelLoadingSkeleton />}
          {!loading && error && (
            <PanelErrorBanner message={error} onRetry={() => void load()} />
          )}
          {!loading && !error && policies.length === 0 && (
            <Box className="py-8 text-center">
              <Text variant="body-sm" className="text-content-subtle">
                No security policies yet. Create one above to start protecting your inbox.
              </Text>
            </Box>
          )}
          {!loading && !error && policies.length > 0 && (
            <Box className="space-y-3">
              {deleteError && <PanelErrorBanner message={deleteError} />}
              <Box className="divide-y divide-border">
                {policies.map((p) => (
                  <Box
                    key={p.id}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <Box className="flex-1 min-w-0">
                      <Box className="flex items-center gap-2 flex-wrap">
                        <Text variant="body-sm" className="font-medium text-content">
                          {p.name}
                        </Text>
                        <Box
                          as="span"
                          className="rounded-full bg-surface-raised border border-border px-2 py-0.5 text-xs text-content-subtle capitalize"
                        >
                          {humanize(p.type)}
                        </Box>
                        {p.isActive ? (
                          <Box
                            as="span"
                            className="rounded-full bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 text-xs"
                          >
                            Active
                          </Box>
                        ) : (
                          <Box
                            as="span"
                            className="rounded-full bg-surface-raised text-content-subtle border border-border px-2 py-0.5 text-xs"
                          >
                            Inactive
                          </Box>
                        )}
                      </Box>
                      <Text variant="caption" className="text-content-subtle break-all">
                        {p.value} · Created {formatTime(p.createdAt)}
                      </Text>
                    </Box>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deletingId !== null}
                      onClick={() => void handleDelete(p.id)}
                      aria-label={`Delete policy ${p.name}`}
                    >
                      {deletingId === p.id ? "Deleting…" : "Delete"}
                    </Button>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
PoliciesPanel.displayName = "PoliciesPanel";

// ─── Audit log panel ────────────────────────────────────────────────────────────

function summarizeDetails(details: Record<string, unknown> | null): string {
  if (!details) return "—";
  const parts: string[] = [];
  for (const [key, val] of Object.entries(details)) {
    if (val === null || val === undefined) continue;
    if (typeof val === "object") continue;
    parts.push(`${humanize(key)}: ${String(val)}`);
    if (parts.length >= 4) break;
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function AuditLogPanel(): ReactNode {
  const [entries, setEntries] = useState<AuditLogEntryData[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventType, setEventType] = useState<SecurityAuditEventType | "">("");

  const load = useCallback(
    async (nextCursor?: string): Promise<void> => {
      if (nextCursor) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await securityIntelligenceApi.auditLog({
          limit: PAGE_SIZE,
          ...(nextCursor ? { cursor: nextCursor } : {}),
          ...(eventType ? { eventType } : {}),
        });
        setEntries((prev) => (nextCursor ? [...prev, ...res.data] : res.data));
        setCursor(res.cursor);
        setHasMore(res.hasMore);
      } catch (err) {
        setError(errMsg(err));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [eventType],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between gap-3 flex-wrap">
          <Box>
            <Text variant="heading-sm" className="font-semibold">
              Security Audit Log
            </Text>
            <Text variant="body-sm" className="text-content-subtle">
              Every security event on your account — detections, policy changes, quarantines.
            </Text>
          </Box>
          <Box
            as="select"
            value={eventType}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setEventType(e.target.value as SecurityAuditEventType | "")
            }
            aria-label="Filter by event type"
            className={SELECT_CLASS}
          >
            <option value="">All events</option>
            {AUDIT_EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t).replace(/^./, (c) => c.toUpperCase())}
              </option>
            ))}
          </Box>
        </Box>
      </CardHeader>
      <CardContent>
        {loading && <PanelLoadingSkeleton />}
        {!loading && error && (
          <PanelErrorBanner message={error} onRetry={() => void load()} />
        )}
        {!loading && !error && entries.length === 0 && (
          <Box className="py-8 text-center">
            <Text variant="body-sm" className="text-content-subtle">
              No audit log entries{eventType ? " for this event type" : " yet"}.
            </Text>
          </Box>
        )}
        {!loading && !error && entries.length > 0 && (
          <Box className="space-y-3">
            <Box className="overflow-x-auto">
              <Box
                as="table"
                className="w-full text-sm border-collapse"
                aria-label="Security audit log"
              >
                <Box as="thead">
                  <Box as="tr" className="border-b border-border">
                    {["Time", "Event", "Details"].map((h) => (
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
                  {entries.map((entry) => (
                    <Box
                      key={entry.id}
                      as="tr"
                      className="border-b border-border last:border-0 hover:bg-surface-raised transition-colors"
                    >
                      <Box as="td" className="py-2.5 pr-4 whitespace-nowrap align-top">
                        <Text variant="body-sm" className="text-content-subtle">
                          {formatTime(entry.createdAt)}
                        </Text>
                      </Box>
                      <Box as="td" className="py-2.5 pr-4 whitespace-nowrap align-top">
                        <Text variant="body-sm" className="font-medium text-content capitalize">
                          {humanize(entry.eventType)}
                        </Text>
                      </Box>
                      <Box as="td" className="py-2.5 pr-4 align-top">
                        <Text variant="body-sm" className="text-content-subtle">
                          {summarizeDetails(entry.details)}
                        </Text>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
            {hasMore && cursor && (
              <Box className="flex justify-center pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => void load(cursor)}
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              </Box>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
AuditLogPanel.displayName = "AuditLogPanel";

// ─── Sender reputation panel ────────────────────────────────────────────────────

function checkBadgeClass(pass: boolean): string {
  return pass
    ? "bg-green-100 text-green-700 border border-green-200"
    : "bg-red-100 text-red-800 border border-red-200";
}

export function SenderReputationPanel(): ReactNode {
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<SenderReputationData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || checking) return;
    setChecking(true);
    setResult(null);
    setError(null);
    try {
      const res = await securityIntelligenceApi.senderReputation(trimmed);
      setResult(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          Sender Reputation Intelligence
        </Text>
        <Text variant="body-sm" className="text-content-subtle">
          Deep reputation check: SPF/DKIM/DMARC, domain age, threat history, and active blocks.
        </Text>
      </CardHeader>
      <CardContent>
        <Box
          as="form"
          className="flex gap-2"
          onSubmit={(e: FormEvent) => void handleSubmit(e)}
          aria-label="Check sender reputation intelligence"
        >
          <Input
            type="email"
            placeholder="someone@example.com"
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            aria-label="Sender email address to check"
            className="flex-1"
            required
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={checking || !email.trim()}
          >
            {checking ? "Checking…" : "Check"}
          </Button>
        </Box>

        {error && (
          <Box className="mt-3">
            <PanelErrorBanner message={error} />
          </Box>
        )}

        {result && (
          <Box className="mt-4 rounded-lg border border-border bg-surface-raised p-4 space-y-4">
            <Box className="flex items-center justify-between gap-3 flex-wrap">
              <Box>
                <Text variant="body-sm" className="font-semibold text-content">
                  {result.email}
                </Text>
                <Text variant="caption" className="text-content-subtle">
                  Domain: {result.domain}
                  {result.reputationScore !== null ? ` · Reputation score: ${result.reputationScore}/100` : ""} ·{" "}
                  {result.threatHistory} prior threat detection
                  {result.threatHistory === 1 ? "" : "s"}
                </Text>
              </Box>
              {result.isBlocked ? (
                <Box
                  as="span"
                  className="rounded-full bg-red-100 text-red-800 border border-red-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                >
                  Blocked by policy
                </Box>
              ) : (
                <Box
                  as="span"
                  className="rounded-full bg-green-100 text-green-700 border border-green-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                >
                  Not blocked
                </Box>
              )}
            </Box>

            {result.checks !== null ? (
              <Box className="flex flex-wrap gap-1.5" aria-label="Authentication checks">
                {(
                  [
                    { label: "SPF", pass: result.checks.spf === "pass" },
                    { label: "DKIM", pass: result.checks.dkim === "pass" },
                    { label: "DMARC", pass: result.checks.dmarc === "pass" },
                  ] as const
                ).map(({ label, pass }) => (
                  <Box
                    key={label}
                    as="span"
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${checkBadgeClass(pass)}`}
                  >
                    {label}: {pass ? "pass" : "fail"}
                  </Box>
                ))}
                <Box
                  as="span"
                  className="rounded-full bg-surface border border-border text-content-subtle px-2.5 py-0.5 text-xs"
                >
                  Domain age: {result.checks.domainAge}
                </Box>
                <Box
                  as="span"
                  className="rounded-full bg-surface border border-border text-content-subtle px-2.5 py-0.5 text-xs"
                >
                  {result.checks.knownProvider ? "Known provider" : "Unknown provider"}
                </Box>
              </Box>
            ) : (
              <Box
                as="span"
                className="inline-block rounded-full bg-surface border border-border text-content-subtle px-2.5 py-0.5 text-xs"
              >
                SPF/DKIM/DMARC verification not yet available
              </Box>
            )}

            <Text variant="body-sm" className="text-content">
              {result.summary}
            </Text>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
SenderReputationPanel.displayName = "SenderReputationPanel";
