"use client";

/**
 * AlecRae — Attachment Intelligence
 *
 * AI-powered attachment analysis: virus scanning, PII detection, threat
 * assessment, text extraction (OCR), and smart file-organization suggestions.
 *
 * API (mounted at /v1/attachments/intelligence — see apps/api/src/server.ts):
 *   GET  /analysis                 → analyzed attachment library (cursor)
 *   GET  /analysis/:id             → one analysis with full detail
 *   GET  /threats                  → non-safe attachments (cursor)
 *   GET  /stats                    → account-wide statistics
 *   GET  /pii-report               → PII detection report
 *   GET  /organize                 → AI organization suggestions (cursor)
 *   POST /organize/:id/action      → accept / dismiss a suggestion
 *   POST /scan                     → virus-scan one attachment
 *   POST /extract-text             → extract text (OCR — backend stub today)
 *
 * Plan gate: pro+ (attachment_intelligence).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  PageLayout,
  Text,
} from "@alecrae/ui";
import { PlanGate } from "../../../components/plan-gate";
import {
  attachmentIntelligenceApi,
  type AttachmentAnalysis,
  type AttachmentStats,
  type FileImportance,
  type OrganizationSuggestion,
  type PiiReport,
  type ThreatLevel,
  type VirusScanStatus,
} from "../../../lib/api-attachment-intelligence";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Human label for a PII type token (e.g. "credit_card" → "Credit card"). */
function piiLabel(token: string): string {
  const map: Record<string, string> = {
    ssn: "SSN",
    email: "Email",
    phone: "Phone",
    credit_card: "Credit card",
  };
  return map[token] ?? token.replace(/_/g, " ");
}

/**
 * The backend OCR/text-extraction endpoint is a documented stub (issue #29):
 * for un-extracted files it returns placeholder text prefixed with "[Extracted
 * text from …]". Detect that so the UI can degrade gracefully instead of
 * presenting placeholder prose as real content.
 */
function isPlaceholderExtraction(text: string): boolean {
  return (
    text.startsWith("[Extracted text from ") &&
    text.includes("placeholder")
  );
}

// ─── Tone pills ────────────────────────────────────────────────────────────────

type PillTone = "green" | "red" | "amber" | "gray" | "brand" | "blue" | "purple";

const PILL_TONES: Record<PillTone, string> = {
  green: "bg-green-100 text-green-700",
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  gray: "bg-gray-100 text-gray-600",
  brand: "bg-brand-100 text-brand-700",
  blue: "bg-blue-100 text-blue-700",
  purple: "bg-purple-100 text-purple-700",
};

function Pill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: PillTone;
}): ReactNode {
  return (
    <Box
      as="span"
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${PILL_TONES[tone]}`}
    >
      {children}
    </Box>
  );
}
Pill.displayName = "Pill";

function threatTone(level: ThreatLevel): PillTone {
  if (level === "dangerous") return "red";
  if (level === "suspicious") return "amber";
  return "green";
}

function scanTone(status: VirusScanStatus): PillTone {
  if (status === "infected") return "red";
  if (status === "error") return "amber";
  if (status === "clean") return "green";
  return "gray";
}

function scanLabel(status: VirusScanStatus): string {
  if (status === "infected") return "Infected";
  if (status === "error") return "Scan error";
  if (status === "clean") return "Clean";
  return "Not scanned";
}

function importanceTone(importance: FileImportance): PillTone {
  if (importance === "critical") return "red";
  if (importance === "important") return "amber";
  if (importance === "low") return "gray";
  return "blue";
}

// ─── Shared sub-components ─────────────────────────────────────────────────────

function LoadingSkeleton({ rows = 4 }: { rows?: number }): ReactNode {
  return (
    <Box className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Box
          key={i}
          className="h-20 animate-pulse rounded-lg border border-border bg-surface-raised"
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
      className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
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

function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}): ReactNode {
  return (
    <Box className="py-12 text-center">
      <Text variant="body-sm" className="font-medium text-content-subtle">
        {title}
      </Text>
      {hint && (
        <Text variant="caption" className="mt-1 block text-content-subtle">
          {hint}
        </Text>
      )}
    </Box>
  );
}
EmptyState.displayName = "EmptyState";

// ─── Stats overview ────────────────────────────────────────────────────────────

function StatsOverview({
  stats,
  loading,
  error,
  onRetry,
}: {
  stats: AttachmentStats | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}): ReactNode {
  if (loading) {
    return (
      <Box className="h-24 animate-pulse rounded-xl border border-border bg-surface-raised" />
    );
  }
  if (error) return <ErrorBanner message={error} onRetry={onRetry} />;
  if (!stats) return null;

  const cells: { label: string; value: string; alert?: boolean }[] = [
    { label: "Files analyzed", value: stats.totalFiles.toLocaleString() },
    { label: "Storage", value: formatBytes(stats.storageUsed) },
    {
      label: "Threats flagged",
      value: stats.threatsBlocked.toLocaleString(),
      alert: stats.threatsBlocked > 0,
    },
    {
      label: "Infected",
      value: stats.infectedFiles.toLocaleString(),
      alert: stats.infectedFiles > 0,
    },
    {
      label: "Files with PII",
      value: stats.filesWithPII.toLocaleString(),
      alert: stats.filesWithPII > 0,
    },
  ];

  return (
    <Box
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      aria-label="Attachment overview"
    >
      {cells.map(({ label, value, alert }) => (
        <Box
          key={label}
          className={`flex flex-col rounded-lg border px-4 py-3 ${
            alert
              ? "border-red-200 bg-red-50"
              : "border-border bg-surface-raised"
          }`}
        >
          <Text
            variant="heading-md"
            className={`font-bold ${alert ? "text-red-700" : "text-content"}`}
          >
            {value}
          </Text>
          <Text variant="caption" className="mt-0.5 text-content-subtle">
            {label}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
StatsOverview.displayName = "StatsOverview";

// ─── Attachment row ────────────────────────────────────────────────────────────

function AttachmentRow({
  item,
  selected,
  onSelect,
}: {
  item: AttachmentAnalysis;
  selected: boolean;
  onSelect: (item: AttachmentAnalysis) => void;
}): ReactNode {
  const piiTypes = item.piiTypes ?? [];
  return (
    <Box
      as="li"
      className={`rounded-lg border transition-colors ${
        selected
          ? "border-brand-500 bg-brand-50"
          : "border-border bg-surface-raised hover:border-brand-300"
      }`}
    >
      <Box
        as="button"
        type="button"
        onClick={() => onSelect(item)}
        aria-pressed={selected}
        aria-label={`View analysis for ${item.fileName}`}
        className="flex w-full flex-col gap-2 rounded-lg px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Box className="flex items-start justify-between gap-3">
          <Box className="min-w-0 flex-1">
            <Text
              variant="body-sm"
              className="truncate font-medium text-content"
              title={item.fileName}
            >
              {item.fileName}
            </Text>
            <Text variant="caption" className="text-content-subtle">
              {item.fileType} · {formatBytes(item.fileSize)} ·{" "}
              {formatDate(item.createdAt)}
            </Text>
          </Box>
        </Box>
        <Box className="flex flex-wrap items-center gap-2">
          <Pill tone={threatTone(item.threatLevel)}>{item.threatLevel}</Pill>
          <Pill tone={scanTone(item.virusScanStatus)}>
            {scanLabel(item.virusScanStatus)}
          </Pill>
          {item.containsPII && (
            <Pill tone="purple">
              PII{piiTypes.length > 0 ? ` · ${piiTypes.length}` : ""}
            </Pill>
          )}
        </Box>
      </Box>
    </Box>
  );
}
AttachmentRow.displayName = "AttachmentRow";

// ─── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({
  item,
  onClose,
  onUpdated,
}: {
  item: AttachmentAnalysis;
  onClose: () => void;
  onUpdated: (item: AttachmentAnalysis) => void;
}): ReactNode {
  const [detail, setDetail] = useState<AttachmentAnalysis>(item);
  const [scanning, setScanning] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(
    item.extractedText,
  );
  const [extractionIsStub, setExtractionIsStub] = useState<boolean>(
    item.extractedText ? isPlaceholderExtraction(item.extractedText) : false,
  );
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Reset local state whenever a different attachment is selected.
  useEffect(() => {
    setDetail(item);
    setExtractedText(item.extractedText);
    setExtractionIsStub(
      item.extractedText ? isPlaceholderExtraction(item.extractedText) : false,
    );
    setError(null);
    closeRef.current?.focus();
  }, [item]);

  async function handleScan(): Promise<void> {
    setScanning(true);
    setError(null);
    try {
      const res = await attachmentIntelligenceApi.scan(detail.id);
      setDetail(res.data);
      onUpdated(res.data);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setScanning(false);
    }
  }

  async function handleExtract(): Promise<void> {
    setExtracting(true);
    setError(null);
    try {
      const res = await attachmentIntelligenceApi.extractText(detail.id);
      setExtractedText(res.data.extractedText);
      setExtractionIsStub(isPlaceholderExtraction(res.data.extractedText));
      setDetail((prev) => ({ ...prev, extractedText: res.data.extractedText }));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setExtracting(false);
    }
  }

  const piiTypes = detail.piiTypes ?? [];

  return (
    <Card className="sticky top-4">
      <CardContent>
        <Box className="space-y-4">
          {/* Header */}
          <Box className="flex items-start justify-between gap-3">
            <Box className="min-w-0 flex-1">
              <Text
                variant="heading-sm"
                className="truncate font-semibold text-content"
                title={detail.fileName}
              >
                {detail.fileName}
              </Text>
              <Text variant="caption" className="text-content-subtle">
                {detail.mimeType} · {formatBytes(detail.fileSize)}
              </Text>
            </Box>
            <Button
              ref={closeRef}
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close detail panel"
            >
              Close
            </Button>
          </Box>

          {error && <ErrorBanner message={error} />}

          {/* Status pills */}
          <Box className="flex flex-wrap items-center gap-2">
            <Pill tone={threatTone(detail.threatLevel)}>
              Threat: {detail.threatLevel}
            </Pill>
            <Pill tone={scanTone(detail.virusScanStatus)}>
              {scanLabel(detail.virusScanStatus)}
            </Pill>
            <Pill tone={detail.isSafe ? "green" : "red"}>
              {detail.isSafe ? "Safe" : "Not safe"}
            </Pill>
          </Box>

          {/* AI summary */}
          <Box>
            <Text
              variant="caption"
              className="mb-1 block font-semibold uppercase tracking-wide text-content-subtle"
            >
              AI analysis
            </Text>
            <Text variant="body-sm" className="text-content">
              {detail.aiSummary ?? "No AI summary available for this file."}
            </Text>
          </Box>

          {/* Virus scan */}
          <Box className="rounded-lg border border-border p-3">
            <Box className="flex items-center justify-between gap-3">
              <Box className="min-w-0">
                <Text variant="body-sm" className="font-medium text-content">
                  Virus scan
                </Text>
                <Text variant="caption" className="text-content-subtle">
                  {detail.virusScanResult ??
                    (detail.virusScanStatus === "pending"
                      ? "Not scanned yet."
                      : "No details.")}
                </Text>
              </Box>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleScan()}
                disabled={scanning}
                aria-label={`Run virus scan for ${detail.fileName}`}
              >
                {scanning ? "Scanning…" : "Rescan"}
              </Button>
            </Box>
          </Box>

          {/* PII findings */}
          <Box>
            <Text
              variant="caption"
              className="mb-1.5 block font-semibold uppercase tracking-wide text-content-subtle"
            >
              PII findings
            </Text>
            {detail.containsPII && piiTypes.length > 0 ? (
              <Box className="flex flex-wrap items-center gap-2">
                {piiTypes.map((t) => (
                  <Pill key={t} tone="purple">
                    {piiLabel(t)}
                  </Pill>
                ))}
              </Box>
            ) : (
              <Text variant="body-sm" className="text-content-subtle">
                No personally identifiable information detected.
              </Text>
            )}
          </Box>

          {/* Extracted text (OCR) */}
          <Box>
            <Box className="mb-1.5 flex items-center justify-between gap-3">
              <Text
                variant="caption"
                className="font-semibold uppercase tracking-wide text-content-subtle"
              >
                Extracted text
              </Text>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleExtract()}
                disabled={extracting}
                aria-label={`Extract text from ${detail.fileName}`}
              >
                {extracting
                  ? "Extracting…"
                  : extractedText
                    ? "Re-extract"
                    : "Extract text"}
              </Button>
            </Box>

            {extractionIsStub && (
              <Box
                className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
                role="note"
              >
                <Text variant="caption" className="text-amber-800">
                  Text extraction is preview-only right now — full OCR / document
                  parsing is coming soon. The content below is placeholder text.
                </Text>
              </Box>
            )}

            {extractedText ? (
              <Box
                as="pre"
                className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface px-3 py-2 text-xs text-content"
                tabIndex={0}
                aria-label="Extracted text content"
              >
                {extractedText}
              </Box>
            ) : (
              <Text variant="body-sm" className="text-content-subtle">
                No text extracted yet. Use “Extract text” to run OCR.
              </Text>
            )}
          </Box>

          <Text variant="caption" className="block text-content-subtle">
            Analyzed {formatDate(detail.createdAt)}
          </Text>
        </Box>
      </CardContent>
    </Card>
  );
}
DetailPanel.displayName = "DetailPanel";

// ─── Attachment list section (library + threats share this) ────────────────────

function AttachmentListSection({
  mode,
  selectedId,
  onSelect,
  refreshKey,
}: {
  mode: "library" | "threats";
  selectedId: string | null;
  onSelect: (item: AttachmentAnalysis) => void;
  refreshKey: number;
}): ReactNode {
  const [items, setItems] = useState<AttachmentAnalysis[]>([]);
  const [threatFilter, setThreatFilter] = useState<ThreatLevel | "all">("all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result =
        mode === "threats"
          ? await attachmentIntelligenceApi.listThreats({
              ...(threatFilter !== "all" ? { severity: threatFilter } : {}),
              limit: 30,
            })
          : await attachmentIntelligenceApi.listAnalysis({
              ...(threatFilter !== "all" ? { threatLevel: threatFilter } : {}),
              limit: 30,
            });
      setItems(result.data);
      setCursor(result.cursor);
      setHasMore(result.hasMore);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [mode, threatFilter]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function loadMore(): Promise<void> {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const result =
        mode === "threats"
          ? await attachmentIntelligenceApi.listThreats({
              ...(threatFilter !== "all" ? { severity: threatFilter } : {}),
              limit: 30,
              cursor,
            })
          : await attachmentIntelligenceApi.listAnalysis({
              ...(threatFilter !== "all" ? { threatLevel: threatFilter } : {}),
              limit: 30,
              cursor,
            });
      setItems((prev) => [...prev, ...result.data]);
      setCursor(result.cursor);
      setHasMore(result.hasMore);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Box className="space-y-4">
      {/* Filter */}
      <Box className="flex items-center gap-3">
        <Text
          as="label"
          variant="body-sm"
          className="text-content-subtle"
          htmlFor={`threat-filter-${mode}`}
        >
          Threat level
        </Text>
        <Box
          as="select"
          id={`threat-filter-${mode}`}
          value={threatFilter}
          onChange={(e) =>
            setThreatFilter(
              (e.target as HTMLSelectElement).value as ThreatLevel | "all",
            )
          }
          aria-label="Filter attachments by threat level"
          className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-content"
        >
          <option value="all">All</option>
          <option value="safe">Safe</option>
          <option value="suspicious">Suspicious</option>
          <option value="dangerous">Dangerous</option>
        </Box>
      </Box>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {loading && <LoadingSkeleton rows={5} />}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          title={
            mode === "threats"
              ? "No threats detected."
              : "No analyzed attachments yet."
          }
          hint={
            mode === "threats"
              ? "Suspicious and dangerous files will appear here as attachments are analyzed."
              : "Attachments are analyzed automatically as email syncs."
          }
        />
      )}
      {!loading && items.length > 0 && (
        <Box
          as="ul"
          className="space-y-2.5"
          aria-label={mode === "threats" ? "Threats" : "Analyzed attachments"}
        >
          {items.map((item) => (
            <AttachmentRow
              key={item.id}
              item={item}
              selected={selectedId === item.id}
              onSelect={onSelect}
            />
          ))}
        </Box>
      )}
      {hasMore && !loading && (
        <Box className="text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </Box>
      )}
    </Box>
  );
}
AttachmentListSection.displayName = "AttachmentListSection";

// ─── PII report section ────────────────────────────────────────────────────────

function PiiReportSection({ refreshKey }: { refreshKey: number }): ReactNode {
  const [report, setReport] = useState<PiiReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await attachmentIntelligenceApi.piiReport();
      setReport(res.data);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading) return <LoadingSkeleton rows={4} />;
  if (error) return <ErrorBanner message={error} onRetry={() => void load()} />;
  if (!report) return null;

  const typeEntries = Object.entries(report.piiTypeCounts);

  if (report.totalFilesWithPII === 0) {
    return (
      <EmptyState
        title="No PII detected across your attachments."
        hint="Files containing SSNs, credit cards, emails, or phone numbers would be flagged here."
      />
    );
  }

  return (
    <Box className="space-y-4">
      {typeEntries.length > 0 && (
        <Box className="flex flex-wrap items-center gap-2">
          {typeEntries.map(([type, count]) => (
            <Pill key={type} tone="purple">
              {piiLabel(type)}: {count}
            </Pill>
          ))}
        </Box>
      )}
      <Box as="ul" className="space-y-2.5" aria-label="Files containing PII">
        {report.files.map((file) => {
          const types = file.piiTypes ?? [];
          return (
            <Box
              as="li"
              key={file.id}
              className="rounded-lg border border-border bg-surface-raised px-4 py-3"
            >
              <Text
                variant="body-sm"
                className="truncate font-medium text-content"
                title={file.fileName}
              >
                {file.fileName}
              </Text>
              <Box className="mt-1 flex flex-wrap items-center gap-2">
                <Text variant="caption" className="text-content-subtle">
                  {file.fileType} · {formatDate(file.createdAt)}
                </Text>
                {types.map((t) => (
                  <Pill key={t} tone="purple">
                    {piiLabel(t)}
                  </Pill>
                ))}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
PiiReportSection.displayName = "PiiReportSection";

// ─── Organization suggestions section ──────────────────────────────────────────

function OrganizeSection({ refreshKey }: { refreshKey: number }): ReactNode {
  const [items, setItems] = useState<OrganizationSuggestion[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await attachmentIntelligenceApi.listOrganization({
        limit: 30,
      });
      setItems(result.data);
      setCursor(result.cursor);
      setHasMore(result.hasMore);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function loadMore(): Promise<void> {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const result = await attachmentIntelligenceApi.listOrganization({
        limit: 30,
        cursor,
      });
      setItems((prev) => [...prev, ...result.data]);
      setCursor(result.cursor);
      setHasMore(result.hasMore);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleAction(
    id: string,
    action: "accepted" | "dismissed",
  ): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      await attachmentIntelligenceApi.actionOrganization(id, action);
      // Suggestion is actioned server-side; remove it from the open list.
      setItems((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingSkeleton rows={4} />;

  return (
    <Box className="space-y-4">
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {!error && items.length === 0 && (
        <EmptyState
          title="No organization suggestions right now."
          hint="AI suggests folders and tags for your attachments as they're analyzed."
        />
      )}
      {items.length > 0 && (
        <Box as="ul" className="space-y-3" aria-label="Organization suggestions">
          {items.map((s) => {
            const tags = s.suggestedTags ?? [];
            const related = s.relatedEmails ?? [];
            const busy = busyId === s.id;
            return (
              <Box
                as="li"
                key={s.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3 sm:flex-row sm:items-center"
              >
                <Box className="min-w-0 flex-1">
                  <Box className="flex flex-wrap items-center gap-2">
                    <Text
                      variant="body-sm"
                      className="truncate font-medium text-content"
                      title={s.fileName}
                    >
                      {s.fileName}
                    </Text>
                    <Pill tone={importanceTone(s.importance)}>
                      {s.importance}
                    </Pill>
                  </Box>
                  <Box className="mt-1 flex flex-wrap items-center gap-2">
                    <Text variant="caption" className="text-content-subtle">
                      Move to{" "}
                      <span className="font-medium text-content">
                        {s.suggestedFolder}
                      </span>
                    </Text>
                    {tags.map((t) => (
                      <Pill key={t} tone="blue">
                        {t}
                      </Pill>
                    ))}
                    {related.length > 0 && (
                      <Text variant="caption" className="text-content-subtle">
                        {related.length} related email
                        {related.length === 1 ? "" : "s"}
                      </Text>
                    )}
                  </Box>
                </Box>
                <Box className="flex flex-shrink-0 items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void handleAction(s.id, "accepted")}
                    disabled={busy}
                    aria-label={`Accept suggestion for ${s.fileName}`}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleAction(s.id, "dismissed")}
                    disabled={busy}
                    aria-label={`Dismiss suggestion for ${s.fileName}`}
                    className="text-content-subtle"
                  >
                    Dismiss
                  </Button>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
      {hasMore && !loading && (
        <Box className="text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </Box>
      )}
    </Box>
  );
}
OrganizeSection.displayName = "OrganizeSection";

// ─── Tabs ──────────────────────────────────────────────────────────────────────

type TabId = "library" | "threats" | "pii" | "organize";

const TABS: { id: TabId; label: string }[] = [
  { id: "library", label: "Library" },
  { id: "threats", label: "Threats" },
  { id: "pii", label: "PII report" },
  { id: "organize", label: "Organize" },
];

function TabBar({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
}): ReactNode {
  const refs = useRef<(HTMLElement | null)[]>([]);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const currentIndex = TABS.findIndex((t) => t.id === active);
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight") nextIndex = (currentIndex + 1) % TABS.length;
    else if (e.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    e.preventDefault();
    const next = TABS[nextIndex];
    if (!next) return;
    onChange(next.id);
    refs.current[nextIndex]?.focus();
  }

  return (
    <Box
      role="tablist"
      aria-label="Attachment views"
      className="flex items-center gap-1 border-b border-border"
      onKeyDown={handleKeyDown}
    >
      {TABS.map((tab, i) => {
        const selected = tab.id === active;
        return (
          <Box
            as="button"
            key={tab.id}
            ref={(el: Element | null) => {
              refs.current[i] = el instanceof HTMLElement ? el : null;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`-mb-px rounded-t border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              selected
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-content-subtle hover:text-content"
            }`}
          >
            {tab.label}
          </Box>
        );
      })}
    </Box>
  );
}
TabBar.displayName = "TabBar";

// ─── Inner page (inside plan gate) ─────────────────────────────────────────────

function AttachmentsContent(): ReactNode {
  const [stats, setStats] = useState<AttachmentStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("library");
  const [selected, setSelected] = useState<AttachmentAnalysis | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadStats = useCallback(async (): Promise<void> => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await attachmentIntelligenceApi.stats();
      setStats(res.data);
    } catch (e) {
      setStatsError(errMsg(e));
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats, refreshKey]);

  // When an attachment is updated (e.g. rescanned), reflect it in the selection
  // and refresh the surrounding lists + stats.
  function handleUpdated(updated: AttachmentAnalysis): void {
    setSelected(updated);
    setRefreshKey((k) => k + 1);
  }

  function handleSelect(item: AttachmentAnalysis): void {
    setSelected(item);
  }

  const showDetailColumn = tab === "library" || tab === "threats";

  return (
    <Box className="space-y-6">
      <StatsOverview
        stats={stats}
        loading={statsLoading}
        error={statsError}
        onRetry={() => void loadStats()}
      />

      <Card>
        <CardContent>
          <Box className="space-y-4">
            <TabBar
              active={tab}
              onChange={(next) => {
                setTab(next);
                if (next !== "library" && next !== "threats") setSelected(null);
              }}
            />
            <Box
              role="tabpanel"
              id={`panel-${tab}`}
              aria-labelledby={`tab-${tab}`}
            >
              {showDetailColumn ? (
                <Box className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(0,22rem)]">
                  <AttachmentListSection
                    mode={tab === "threats" ? "threats" : "library"}
                    selectedId={selected?.id ?? null}
                    onSelect={handleSelect}
                    refreshKey={refreshKey}
                  />
                  <Box>
                    {selected ? (
                      <DetailPanel
                        item={selected}
                        onClose={() => setSelected(null)}
                        onUpdated={handleUpdated}
                      />
                    ) : (
                      <Box className="rounded-xl border border-dashed border-border p-6 text-center">
                        <Text
                          variant="body-sm"
                          className="text-content-subtle"
                        >
                          Select an attachment to see its AI analysis, virus
                          scan, PII findings, and extracted text.
                        </Text>
                      </Box>
                    )}
                  </Box>
                </Box>
              ) : tab === "pii" ? (
                <PiiReportSection refreshKey={refreshKey} />
              ) : (
                <OrganizeSection refreshKey={refreshKey} />
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
AttachmentsContent.displayName = "AttachmentsContent";

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AttachmentsPage(): ReactNode {
  return (
    <PageLayout
      title="Attachment Intelligence"
      description="Every attachment analyzed by AI — virus scanned, PII flagged, and smartly organized."
    >
      <PlanGate feature="attachment_intelligence" required="pro">
        <AttachmentsContent />
      </PlanGate>
    </PageLayout>
  );
}
