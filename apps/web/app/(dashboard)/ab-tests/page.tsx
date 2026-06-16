"use client";

import { useState, useEffect, useCallback } from "react";
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
import {
  abTestsApi,
  type ABTest,
  type ABTestVariant,
} from "../../../lib/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMetricLabel(metric: string): string {
  switch (metric) {
    case "open_rate":
      return "Open Rate";
    case "click_rate":
      return "Click Rate";
    case "reply_rate":
      return "Reply Rate";
    default:
      return metric;
  }
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

type TestStatus = ABTest["status"];

interface StatusBadgeColors {
  bg: string;
  text: string;
}

function statusColors(status: TestStatus): StatusBadgeColors {
  switch (status) {
    case "running":
      return { bg: "bg-blue-100", text: "text-blue-700" };
    case "completed":
      return { bg: "bg-status-success/10", text: "text-status-success" };
    case "cancelled":
      return { bg: "bg-red-100", text: "text-red-700" };
    default:
      return { bg: "bg-surface-secondary", text: "text-content-tertiary" };
  }
}

function StatusBadge({ status }: { status: TestStatus }): React.ReactNode {
  const { bg, text } = statusColors(status);
  const label =
    status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <Box className={`rounded-full px-2 py-0.5 ${bg}`}>
      <Text variant="caption" className={`font-medium ${text}`}>
        {label}
      </Text>
    </Box>
  );
}
StatusBadge.displayName = "StatusBadge";

// ─── Error / Loading UI ───────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }): React.ReactNode {
  return (
    <Box className="mb-4 rounded-md border border-red-200 bg-red-50 p-3" role="alert">
      <Text variant="body-sm" className="text-red-800">
        {message}
      </Text>
    </Box>
  );
}
ErrorBanner.displayName = "ErrorBanner";

function LoadingSkeleton(): React.ReactNode {
  return (
    <Box className="space-y-4" aria-busy="true" aria-label="Loading">
      {[1, 2, 3].map((i) => (
        <Box key={i} className="h-24 animate-pulse rounded-lg bg-surface-secondary" />
      ))}
    </Box>
  );
}
LoadingSkeleton.displayName = "LoadingSkeleton";

// ─── Percentage bar ───────────────────────────────────────────────────────────

function PercentageBar({
  value,
  max = 100,
  color = "bg-accent",
}: {
  value: number;
  max?: number;
  color?: string;
}): React.ReactNode {
  const widthPct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <Box className="h-2 w-full rounded-full bg-surface-secondary overflow-hidden">
      <Box
        className={`h-full rounded-full ${color} transition-all duration-300`}
        style={{ width: `${widthPct}%` }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      />
    </Box>
  );
}
PercentageBar.displayName = "PercentageBar";

// ─── Variant split visualization ──────────────────────────────────────────────

function VariantSplitBar({
  variants,
}: {
  variants: { id: string; percentage: number }[];
}): React.ReactNode {
  const COLORS = [
    "bg-blue-400",
    "bg-emerald-400",
    "bg-amber-400",
    "bg-rose-400",
    "bg-violet-400",
  ];

  return (
    <Box className="flex h-3 w-full overflow-hidden rounded-full" aria-label="Variant split">
      {variants.map((v, i) => (
        <Box
          key={v.id}
          className={`${COLORS[i % COLORS.length] ?? "bg-surface-secondary"} first:rounded-l-full last:rounded-r-full`}
          style={{ width: `${v.percentage}%` }}
          title={`Variant ${String.fromCharCode(65 + i)}: ${v.percentage}%`}
        />
      ))}
    </Box>
  );
}
VariantSplitBar.displayName = "VariantSplitBar";

// ─── Variant builder ──────────────────────────────────────────────────────────

interface DraftVariant {
  subject: string;
  percentage: number;
}

function VariantBuilder({
  variants,
  onChange,
}: {
  variants: DraftVariant[];
  onChange: (variants: DraftVariant[]) => void;
}): React.ReactNode {
  const total = variants.reduce((s, v) => s + v.percentage, 0);
  const isBalanced = Math.abs(total - 100) <= 0.01;

  const updateVariant = (index: number, patch: Partial<DraftVariant>): void => {
    onChange(variants.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  };

  const addVariant = (): void => {
    if (variants.length >= 4) return;
    const newPct = Math.floor(100 / (variants.length + 1));
    const updated: DraftVariant[] = [
      ...variants.map((v) => ({ ...v, percentage: newPct })),
      { subject: "", percentage: 100 - newPct * variants.length },
    ];
    onChange(updated);
  };

  const removeVariant = (index: number): void => {
    if (variants.length <= 2) return;
    const removed = variants.filter((_, i) => i !== index);
    // Redistribute removed variant's percentage to the first variant
    const removedPct = variants[index]?.percentage ?? 0;
    onChange(
      removed.map((v, i) =>
        i === 0 ? { ...v, percentage: v.percentage + removedPct } : v,
      ),
    );
  };

  const LABELS = ["A", "B", "C", "D"];

  return (
    <Box className="space-y-3">
      {variants.map((v, i) => (
        <Box
          key={i}
          className="rounded-lg border border-border bg-surface-secondary p-3 space-y-2"
        >
          <Box className="flex items-center justify-between gap-2">
            <Box className="flex items-center gap-2 min-w-0 flex-1">
              <Box className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                <Text variant="caption" className="font-bold text-accent">
                  {LABELS[i] ?? String(i + 1)}
                </Text>
              </Box>
              <Text variant="body-sm" className="font-medium text-content">
                Variant {LABELS[i] ?? String(i + 1)}
              </Text>
            </Box>
            {variants.length > 2 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeVariant(i)}
                className="text-red-500 hover:bg-red-50 flex-shrink-0"
                aria-label={`Remove variant ${LABELS[i] ?? String(i + 1)}`}
              >
                Remove
              </Button>
            )}
          </Box>
          <Input
            label={`Subject line (Variant ${LABELS[i] ?? String(i + 1)})`}
            variant="text"
            placeholder={
              i === 0
                ? "e.g. You won't believe this deal"
                : "e.g. Limited time offer inside"
            }
            value={v.subject}
            onChange={(e) => updateVariant(i, { subject: e.target.value })}
          />
          <Box>
            <Box className="flex items-center justify-between mb-1">
              <Text variant="caption" className="text-content-secondary font-medium">
                Split percentage
              </Text>
              <Text variant="caption" className="font-mono text-content">
                {v.percentage}%
              </Text>
            </Box>
            <input
              type="range"
              min={5}
              max={95}
              step={5}
              value={v.percentage}
              onChange={(e) => updateVariant(i, { percentage: Number(e.target.value) })}
              className="w-full accent-accent"
              aria-label={`Variant ${LABELS[i] ?? String(i + 1)} percentage`}
            />
          </Box>
        </Box>
      ))}

      <Box className="space-y-2">
        <VariantSplitBar variants={variants.map((v, i) => ({ id: String(i), percentage: v.percentage }))} />
        <Box className="flex items-center justify-between">
          <Text
            variant="caption"
            className={isBalanced ? "text-status-success" : "text-red-600"}
          >
            {isBalanced ? "Percentages sum to 100%" : `Total: ${total}% (must equal 100%)`}
          </Text>
          {variants.length < 4 && (
            <Button variant="ghost" size="sm" onClick={addVariant}>
              + Add variant
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
}
VariantBuilder.displayName = "VariantBuilder";

// ─── Create form ──────────────────────────────────────────────────────────────

const WINNER_METRICS: {
  value: "open_rate" | "click_rate" | "reply_rate";
  label: string;
  description: string;
}[] = [
  { value: "open_rate", label: "Open Rate", description: "Best subject line" },
  { value: "click_rate", label: "Click Rate", description: "Best engagement" },
  { value: "reply_rate", label: "Reply Rate", description: "Best response" },
];

function CreateTestForm({
  onCreated,
}: {
  onCreated: (test: ABTest) => void;
}): React.ReactNode {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [winnerMetric, setWinnerMetric] = useState<
    "open_rate" | "click_rate" | "reply_rate"
  >("open_rate");
  const [variants, setVariants] = useState<DraftVariant[]>([
    { subject: "", percentage: 50 },
    { subject: "", percentage: 50 },
  ]);
  const [saving, setSaving] = useState(false);
  const [startAfter, setStartAfter] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const total = variants.reduce((s, v) => s + v.percentage, 0);
  const isBalanced = Math.abs(total - 100) <= 0.01;

  const handleSubmit = async (): Promise<void> => {
    if (!name.trim()) {
      setFormError("Test name is required.");
      return;
    }
    if (!isBalanced) {
      setFormError("Variant percentages must sum to 100%.");
      return;
    }
    if (variants.some((v) => !v.subject.trim())) {
      setFormError("All variants require a subject line.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const res = await abTestsApi.create({
        name: name.trim(),
        winnerMetric,
        variants: variants.map((v) => ({
          subject: v.subject.trim(),
          percentage: v.percentage,
        })),
      });

      let test = res.data;

      if (startAfter) {
        await abTestsApi.start(test.id);
        test = { ...test, status: "running" };
      }

      onCreated(test);
      setName("");
      setVariants([
        { subject: "", percentage: 50 },
        { subject: "", percentage: 50 },
      ]);
      setExpanded(false);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to create test",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!expanded) {
    return (
      <Box>
        <Button variant="primary" size="sm" onClick={() => setExpanded(true)}>
          New A/B Test
        </Button>
      </Box>
    );
  }

  return (
    <Card className="border-accent/30">
      <CardHeader>
        <Text variant="heading-sm">Create A/B Test</Text>
        <Text variant="body-sm" muted>
          Send subject line variants to recipient segments, then declare a
          winner based on performance.
        </Text>
      </CardHeader>
      <CardContent>
        {formError && <ErrorBanner message={formError} />}
        <Box className="space-y-5">
          <Input
            label="Test name"
            variant="text"
            placeholder="e.g. Summer Sale Subject Lines"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Box>
            <Text variant="body-sm" className="mb-2 font-medium text-content">
              Winner metric
            </Text>
            <Box className="flex flex-wrap gap-2" role="radiogroup" aria-label="Winner metric">
              {WINNER_METRICS.map((m) => (
                <Button
                  key={m.value}
                  variant={winnerMetric === m.value ? "secondary" : "ghost"}
                  size="sm"
                  role="radio"
                  aria-checked={winnerMetric === m.value}
                  onClick={() => setWinnerMetric(m.value)}
                  title={m.description}
                >
                  {m.label}
                </Button>
              ))}
            </Box>
          </Box>

          <Box>
            <Text variant="body-sm" className="mb-2 font-medium text-content">
              Variants (2–4)
            </Text>
            <VariantBuilder variants={variants} onChange={setVariants} />
          </Box>

          <Box className="flex items-center gap-3 flex-wrap">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setStartAfter(false);
                void handleSubmit();
              }}
              disabled={saving || !isBalanced || !name.trim()}
            >
              {saving && !startAfter ? "Creating..." : "Save as Draft"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setStartAfter(true);
                void handleSubmit();
              }}
              disabled={saving || !isBalanced || !name.trim()}
            >
              {saving && startAfter ? "Starting..." : "Create & Start"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(false)}
              disabled={saving}
            >
              Cancel
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
CreateTestForm.displayName = "CreateTestForm";

// ─── Test detail panel ────────────────────────────────────────────────────────

function TestDetail({
  test,
  onBack,
  onUpdated,
  onDeleted,
}: {
  test: ABTest;
  onBack: () => void;
  onUpdated: (updated: ABTest) => void;
  onDeleted: (id: string) => void;
}): React.ReactNode {
  const [detail, setDetail] = useState<ABTest>(test);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedWinner, setSelectedWinner] = useState<string>("");
  const [completing, setCompleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const LABELS = ["A", "B", "C", "D"];
  const COLORS = ["bg-blue-400", "bg-emerald-400", "bg-amber-400", "bg-rose-400"];
  const TEXT_COLORS = ["text-blue-700", "text-emerald-700", "text-amber-700", "text-rose-700"];
  const BG_COLORS = ["bg-blue-50", "bg-emerald-50", "bg-amber-50", "bg-rose-50"];

  // Refresh full detail from API
  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await abTestsApi.get(detail.id);
      setDetail(res.data);
      onUpdated(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh test");
    } finally {
      setLoading(false);
    }
  }, [detail.id, onUpdated]);

  const handleStart = async (): Promise<void> => {
    setError(null);
    try {
      await abTestsApi.start(detail.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start test");
    }
  };

  const handleComplete = async (): Promise<void> => {
    setCompleting(true);
    setError(null);
    try {
      await abTestsApi.complete(
        detail.id,
        selectedWinner || undefined,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete test");
    } finally {
      setCompleting(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    setDeleting(true);
    setError(null);
    try {
      await abTestsApi.remove(detail.id);
      onDeleted(detail.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete test");
      setDeleting(false);
    }
  };

  const winnerVariantId = detail.results?.winner;

  return (
    <Box className="space-y-5">
      {/* Back button + title */}
      <Box className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back to list">
          ← Back
        </Button>
        <Box className="min-w-0 flex-1">
          <Box className="flex items-center gap-2 flex-wrap">
            <Text variant="heading-sm" className="font-semibold truncate">
              {detail.name}
            </Text>
            <StatusBadge status={detail.status} />
          </Box>
          <Text variant="caption" muted className="mt-0.5">
            Winner metric: {formatMetricLabel(detail.winnerMetric)} · Created{" "}
            {formatDate(detail.createdAt)}
          </Text>
        </Box>
      </Box>

      {error && <ErrorBanner message={error} />}
      {loading && (
        <Box className="text-center py-4">
          <Text variant="body-sm" muted>
            Loading…
          </Text>
        </Box>
      )}

      {/* Variants */}
      <Box className="space-y-3">
        {detail.variants.map((variant: ABTestVariant, i: number) => {
          const metrics = detail.results?.variants[variant.id];
          const isWinner = winnerVariantId === variant.id;
          const label = LABELS[i] ?? String(i + 1);
          const color = COLORS[i % COLORS.length] ?? "bg-surface-secondary";
          const textColor = TEXT_COLORS[i % TEXT_COLORS.length] ?? "text-content";
          const bgColor = BG_COLORS[i % BG_COLORS.length] ?? "bg-surface-secondary";

          return (
            <Card
              key={variant.id}
              className={`border-border ${isWinner ? "ring-2 ring-status-success ring-offset-2" : ""}`}
            >
              <CardContent>
                <Box className="space-y-3">
                  {/* Header row */}
                  <Box className="flex items-start justify-between gap-2">
                    <Box className="flex items-center gap-2 min-w-0 flex-1">
                      <Box
                        className={`flex-shrink-0 w-7 h-7 rounded-full ${bgColor} flex items-center justify-center`}
                      >
                        <Text
                          variant="caption"
                          className={`font-bold ${textColor}`}
                        >
                          {label}
                        </Text>
                      </Box>
                      <Box className="min-w-0">
                        <Box className="flex items-center gap-2 flex-wrap">
                          <Text variant="body-sm" className="font-semibold truncate">
                            {variant.subject ?? "(no subject variant)"}
                          </Text>
                          {isWinner && (
                            <Box className="rounded-full bg-status-success/10 px-2 py-0.5">
                              <Text
                                variant="caption"
                                className="text-status-success font-medium"
                              >
                                Winner
                              </Text>
                            </Box>
                          )}
                        </Box>
                        <Text variant="caption" muted>
                          {variant.percentage}% of recipients
                        </Text>
                      </Box>
                    </Box>
                  </Box>

                  {/* Metrics */}
                  {metrics ? (
                    <Box className="grid grid-cols-3 gap-3">
                      {[
                        {
                          label: "Open Rate",
                          value: metrics.openRate,
                          count: metrics.opened,
                        },
                        {
                          label: "Click Rate",
                          value: metrics.clickRate,
                          count: metrics.clicked,
                        },
                        {
                          label: "Sent",
                          value: null,
                          count: metrics.sent,
                        },
                      ].map((stat) => (
                        <Box key={stat.label} className="space-y-1">
                          <Text variant="caption" muted>
                            {stat.label}
                          </Text>
                          <Text variant="body-sm" className="font-semibold">
                            {stat.value !== null
                              ? pct(stat.value)
                              : stat.count.toString()}
                          </Text>
                          {stat.value !== null && (
                            <PercentageBar
                              value={stat.value * 100}
                              color={color}
                            />
                          )}
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    <Box className="rounded-md bg-surface-secondary p-3">
                      <Text variant="caption" muted>
                        {detail.status === "draft"
                          ? "Start the test to begin collecting data."
                          : "No data yet — check back after emails are sent."}
                      </Text>
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>
          );
        })}
      </Box>

      {/* Split visualization */}
      <Box className="space-y-1.5">
        <Text variant="caption" muted>
          Recipient split
        </Text>
        <VariantSplitBar
          variants={detail.variants.map((v) => ({
            id: v.id,
            percentage: v.percentage,
          }))}
        />
        <Box className="flex flex-wrap gap-3">
          {detail.variants.map((v, i) => (
            <Box key={v.id} className="flex items-center gap-1.5">
              <Box
                className={`w-2.5 h-2.5 rounded-full ${COLORS[i % COLORS.length] ?? "bg-surface-secondary"}`}
              />
              <Text variant="caption" muted>
                {LABELS[i] ?? String(i + 1)}: {v.percentage}%
              </Text>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Actions */}
      <Box className="flex flex-wrap items-center gap-3 pt-1">
        {detail.status === "draft" && (
          <Button variant="primary" size="sm" onClick={handleStart}>
            Start Test
          </Button>
        )}

        {detail.status === "running" && (
          <Box className="flex flex-wrap items-center gap-3">
            <Box>
              <Text variant="caption" muted className="mb-1 block">
                Pick winner (optional — auto-selected by metric if blank)
              </Text>
              <select
                className="rounded-md border border-border bg-surface p-2 text-sm text-content focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                value={selectedWinner}
                onChange={(e) => setSelectedWinner(e.target.value)}
                aria-label="Select winning variant"
              >
                <option value="">Auto (by {formatMetricLabel(detail.winnerMetric)})</option>
                {detail.variants.map((v, i) => (
                  <option key={v.id} value={v.id}>
                    Variant {LABELS[i] ?? String(i + 1)}{" "}
                    {v.subject ? `— "${v.subject}"` : ""}
                  </option>
                ))}
              </select>
            </Box>
            <Button
              variant="primary"
              size="sm"
              onClick={handleComplete}
              disabled={completing}
            >
              {completing ? "Completing..." : "Complete & Pick Winner"}
            </Button>
          </Box>
        )}

        {detail.status === "draft" && (
          <Box className="flex items-center gap-2 ml-auto">
            {deleteConfirm ? (
              <>
                <Text variant="caption" className="text-red-600">
                  Delete this draft?
                </Text>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-red-600 hover:bg-red-50"
                >
                  {deleting ? "Deleting..." : "Confirm"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteConfirm(false)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteConfirm(true)}
                className="text-red-500 hover:bg-red-50"
              >
                Delete
              </Button>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
TestDetail.displayName = "TestDetail";

// ─── Test row in list ─────────────────────────────────────────────────────────

function TestRow({
  test,
  onClick,
}: {
  test: ABTest;
  onClick: () => void;
}): React.ReactNode {
  return (
    <Card className="border-border cursor-pointer hover:border-accent/50 transition-colors" onClick={onClick}>
      <CardContent>
        <Box className="flex items-start justify-between gap-4">
          <Box className="min-w-0 flex-1 space-y-1.5">
            <Box className="flex items-center gap-2 flex-wrap">
              <Text variant="body-md" className="font-semibold truncate">
                {test.name}
              </Text>
              <StatusBadge status={test.status} />
              {test.results?.winner && (
                <Box className="rounded-full bg-status-success/10 px-2 py-0.5">
                  <Text variant="caption" className="text-status-success font-medium">
                    Winner declared
                  </Text>
                </Box>
              )}
            </Box>
            <Box className="flex items-center gap-4 flex-wrap">
              <Text variant="caption" muted>
                {test.variants.length} variants · {formatMetricLabel(test.winnerMetric)}
              </Text>
              {test.recipientCount !== undefined && test.recipientCount > 0 && (
                <Text variant="caption" muted>
                  {test.recipientCount} recipients
                </Text>
              )}
              <Text variant="caption" muted>
                Created {formatDate(test.createdAt)}
              </Text>
            </Box>
            <VariantSplitBar
              variants={test.variants.map((v) => ({ id: v.id, percentage: v.percentage }))}
            />
          </Box>
          <Text variant="caption" className="text-content-tertiary flex-shrink-0 pt-1">
            →
          </Text>
        </Box>
      </CardContent>
    </Card>
  );
}
TestRow.displayName = "TestRow";

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState(): React.ReactNode {
  return (
    <Card>
      <CardContent>
        <Box className="py-12 text-center space-y-3">
          <Box className="text-4xl" aria-hidden="true" role="img">
            🧪
          </Box>
          <Text variant="heading-sm" className="font-semibold">
            No A/B tests yet
          </Text>
          <Text variant="body-sm" muted className="max-w-sm mx-auto">
            A/B testing lets you send two or more subject line variants to
            segments of recipients, then automatically picks the winner by open
            rate, click rate, or reply rate.
          </Text>
          <Text variant="body-sm" muted>
            Click <Text as="span" className="font-medium text-content">New A/B Test</Text> above to get started.
          </Text>
        </Box>
      </CardContent>
    </Card>
  );
}
EmptyState.displayName = "EmptyState";

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ABTestsPage(): React.ReactNode {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const res = await abTestsApi.list({ limit: 50 });
      setTests(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load A/B tests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedTest = tests.find((t) => t.id === selectedTestId) ?? null;

  const handleCreated = (test: ABTest): void => {
    setTests((prev) => [test, ...prev]);
  };

  const handleUpdated = (updated: ABTest): void => {
    setTests((prev) =>
      prev.map((t) => (t.id === updated.id ? updated : t)),
    );
  };

  const handleDeleted = (id: string): void => {
    setTests((prev) => prev.filter((t) => t.id !== id));
    setSelectedTestId(null);
  };

  return (
    <PageLayout
      title="A/B Testing"
      description="Send subject line variants, track performance, and automatically declare a winner."
    >
      {selectedTest ? (
        <TestDetail
          test={selectedTest}
          onBack={() => setSelectedTestId(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      ) : (
        <Box className="space-y-5">
          {error && <ErrorBanner message={error} />}

          <CreateTestForm onCreated={handleCreated} />

          {loading ? (
            <LoadingSkeleton />
          ) : tests.length === 0 ? (
            <EmptyState />
          ) : (
            <Box className="space-y-3">
              {tests.map((test) => (
                <TestRow
                  key={test.id}
                  test={test}
                  onClick={() => setSelectedTestId(test.id)}
                />
              ))}
            </Box>
          )}
        </Box>
      )}
    </PageLayout>
  );
}
