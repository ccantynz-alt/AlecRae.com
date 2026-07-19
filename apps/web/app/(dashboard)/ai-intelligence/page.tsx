"use client";

/**
 * AlecRae — AI Intelligence Hub
 *
 * Workbench over the /v1/ai-intelligence API: per-email priority scoring,
 * sentiment analysis, smart replies, and action prediction; plus relationship
 * insights and an AI writing coach for drafts.
 *
 * API (all under /v1/ai-intelligence — mount verified in server.ts):
 *   POST /priority/score, GET /priority/:emailId
 *   GET  /relationships, GET /relationships/:contactEmail
 *   POST /smart-replies/generate, GET /smart-replies/:emailId, POST /smart-replies/:id/select
 *   POST /sentiment/analyze, GET /sentiment/:emailId
 *   POST /writing-coach/analyze                    (backend placeholder scores)
 *   POST /predictive-actions/predict               (backend placeholder)
 *   GET  /predictive-actions/:emailId, POST /predictive-actions/:id/feedback
 *
 * Plan gate: pro+ (context_intelligence)
 */

import {
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type FormEvent,
  type ChangeEvent,
} from "react";
import {
  Box,
  Text,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  PageLayout,
} from "@alecrae/ui";
import { PlanGate } from "../../../components/plan-gate";
import {
  aiIntelligenceApi,
  type ContentSignals,
  type EmailPriorityScore,
  type EmailSentiment,
  type EmailSentimentValue,
  type PredictiveAction,
  type RelationshipInsight,
  type SmartReplySet,
  type UrgencyLevel,
  type WritingCoachResult,
} from "../../../lib/api-ai-intelligence";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function confidencePct(confidence: number): string {
  return `${Math.round(clamp(confidence, 0, 1) * 100)}%`;
}

function humanizeAction(action: string): string {
  return action.replace(/_/g, " ");
}

const URGENCY_BADGE_CLASSES: Record<UrgencyLevel, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-blue-100 text-blue-700",
  none: "bg-gray-100 text-gray-600",
};

const SENTIMENT_BADGE_CLASSES: Record<EmailSentimentValue, string> = {
  positive: "bg-green-100 text-green-700",
  grateful: "bg-emerald-100 text-emerald-700",
  neutral: "bg-gray-100 text-gray-600",
  confused: "bg-yellow-100 text-yellow-700",
  urgent: "bg-orange-100 text-orange-700",
  negative: "bg-red-100 text-red-700",
  angry: "bg-red-100 text-red-700",
};

const SIGNAL_LABELS: {
  key: keyof Omit<ContentSignals, "threadLength">;
  label: string;
}[] = [
  { key: "hasDeadline", label: "Deadline" },
  { key: "hasQuestion", label: "Question" },
  { key: "hasMoneyConcern", label: "Money" },
  { key: "hasActionRequired", label: "Action required" },
  { key: "mentionsAttachment", label: "Attachment" },
  { key: "isReplyChain", label: "Reply chain" },
];

const FEEDBACK_ACTIONS: string[] = [
  "reply",
  "archive",
  "delete",
  "forward",
  "snooze",
  "read_later",
];

// ─── Shared sub-components ─────────────────────────────────────────────────────

function LoadingSkeleton({ rows = 2 }: { rows?: number }): ReactNode {
  return (
    <Box className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Box
          key={i}
          className="h-12 animate-pulse rounded-lg bg-surface-raised border border-border"
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

function EmptyHint({ children }: { children: ReactNode }): ReactNode {
  return (
    <Box className="py-6 text-center">
      <Text variant="body-sm" className="text-content-subtle">
        {children}
      </Text>
    </Box>
  );
}
EmptyHint.displayName = "EmptyHint";

function Chip({
  children,
  className = "bg-brand-100 text-brand-700",
}: {
  children: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <Box
      as="span"
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </Box>
  );
}
Chip.displayName = "Chip";

function ScoreBar({
  label,
  value,
  max = 100,
}: {
  label: string;
  value: number;
  max?: number;
}): ReactNode {
  const pct = clamp(max > 0 ? Math.round((value / max) * 100) : 0, 0, 100);
  const barColor =
    pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-brand-600";
  return (
    <Box className="space-y-1.5">
      <Box className="flex items-center justify-between gap-2">
        <Text variant="body-sm" className="font-medium text-content">
          {label}
        </Text>
        <Text variant="caption" className="text-content-subtle whitespace-nowrap">
          {Math.round(value)} / {max}
        </Text>
      </Box>
      <Box
        className="h-2 w-full rounded-full bg-surface-raised border border-border overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${Math.round(value)} out of ${max}`}
      >
        <Box
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </Box>
    </Box>
  );
}
ScoreBar.displayName = "ScoreBar";

// ─── Priority panel ────────────────────────────────────────────────────────────

function PriorityPanel({ emailId }: { emailId: string }): ReactNode {
  const [result, setResult] = useState<EmailPriorityScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadExisting = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await aiIntelligenceApi.getPriority(emailId);
      setResult(res?.data ?? null);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [emailId]);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  async function run(): Promise<void> {
    setRunning(true);
    setError(null);
    try {
      const res = await aiIntelligenceApi.scorePriority(emailId);
      setResult(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between gap-3">
          <Text variant="heading-sm" className="font-semibold">
            Priority Score
          </Text>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void run()}
            disabled={running || loading}
            aria-label="Score this email's priority"
          >
            {running ? "Scoring…" : result ? "Re-check" : "Score priority"}
          </Button>
        </Box>
      </CardHeader>
      <CardContent>
        {loading && <LoadingSkeleton rows={2} />}
        {!loading && error && (
          <ErrorBanner message={error} onRetry={() => void loadExisting()} />
        )}
        {!loading && !error && !result && (
          <EmptyHint>Not scored yet — run the priority scorer.</EmptyHint>
        )}
        {!loading && !error && result && (
          <Box className="space-y-4">
            <Box className="flex items-center gap-3 flex-wrap">
              <Text variant="heading-lg" className="font-bold leading-none">
                {Math.round(result.score)}
              </Text>
              <Text variant="caption" className="text-content-subtle">
                / 100
              </Text>
              <Chip className={URGENCY_BADGE_CLASSES[result.urgencyLevel]}>
                {result.urgencyLevel}
              </Chip>
              <Text variant="caption" className="text-content-subtle">
                confidence {confidencePct(result.confidence)}
              </Text>
            </Box>
            <ScoreBar label="Priority" value={result.score} />
            <Text variant="body-sm" className="text-content">
              {result.reasoning}
            </Text>
            <Box className="flex flex-wrap gap-1.5">
              {SIGNAL_LABELS.filter(({ key }) => result.contentSignals[key]).map(
                ({ key, label }) => (
                  <Chip key={key} className="bg-surface-raised border border-border text-content-subtle">
                    {label}
                  </Chip>
                ),
              )}
              {result.predictedAction && (
                <Chip>suggested: {humanizeAction(result.predictedAction)}</Chip>
              )}
            </Box>
            <Text variant="caption" className="text-content-subtle">
              Scored {formatDateTime(result.scoredAt)}
            </Text>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
PriorityPanel.displayName = "PriorityPanel";

// ─── Sentiment panel ───────────────────────────────────────────────────────────

function SentimentPanel({ emailId }: { emailId: string }): ReactNode {
  const [result, setResult] = useState<EmailSentiment | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadExisting = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await aiIntelligenceApi.getSentiment(emailId);
      setResult(res?.data ?? null);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [emailId]);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  async function run(): Promise<void> {
    setRunning(true);
    setError(null);
    try {
      const res = await aiIntelligenceApi.analyzeSentiment(emailId);
      setResult(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between gap-3">
          <Text variant="heading-sm" className="font-semibold">
            Sentiment
          </Text>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void run()}
            disabled={running || loading}
            aria-label="Analyze this email's sentiment"
          >
            {running ? "Analyzing…" : result ? "Re-check" : "Analyze sentiment"}
          </Button>
        </Box>
      </CardHeader>
      <CardContent>
        {loading && <LoadingSkeleton rows={2} />}
        {!loading && error && (
          <ErrorBanner message={error} onRetry={() => void loadExisting()} />
        )}
        {!loading && !error && !result && (
          <EmptyHint>Not analyzed yet — run sentiment analysis.</EmptyHint>
        )}
        {!loading && !error && result && (
          <Box className="space-y-3">
            <Box className="flex items-center gap-3 flex-wrap">
              <Chip className={SENTIMENT_BADGE_CLASSES[result.sentiment]}>
                {result.sentiment}
              </Chip>
              <Text variant="caption" className="text-content-subtle">
                confidence {confidencePct(result.confidence)}
              </Text>
            </Box>
            {result.keywords.length > 0 && (
              <Box className="flex flex-wrap gap-1.5" aria-label="Sentiment keywords">
                {result.keywords.map((kw) => (
                  <Chip
                    key={kw}
                    className="bg-surface-raised border border-border text-content-subtle"
                  >
                    {kw}
                  </Chip>
                ))}
              </Box>
            )}
            <Text variant="caption" className="text-content-subtle">
              Analyzed {formatDateTime(result.analyzedAt)}
            </Text>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
SentimentPanel.displayName = "SentimentPanel";

// ─── Smart replies panel ───────────────────────────────────────────────────────

function SmartRepliesPanel({ emailId }: { emailId: string }): ReactNode {
  const [result, setResult] = useState<SmartReplySet | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selecting, setSelecting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadExisting = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await aiIntelligenceApi.getSmartReplies(emailId);
      setResult(res?.data ?? null);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [emailId]);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  async function generate(): Promise<void> {
    setRunning(true);
    setError(null);
    try {
      const res = await aiIntelligenceApi.generateSmartReplies(emailId);
      setResult(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setRunning(false);
    }
  }

  async function selectReply(index: number, text: string): Promise<void> {
    if (!result) return;
    setSelecting(index);
    setError(null);
    try {
      await aiIntelligenceApi.selectSmartReply(result.id, text);
      setResult({ ...result, selectedReply: text, wasUsed: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSelecting(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between gap-3">
          <Text variant="heading-sm" className="font-semibold">
            Smart Replies
          </Text>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void generate()}
            disabled={running || loading}
            aria-label="Generate smart replies for this email"
          >
            {running ? "Generating…" : result ? "Regenerate" : "Generate replies"}
          </Button>
        </Box>
      </CardHeader>
      <CardContent>
        {loading && <LoadingSkeleton rows={3} />}
        {!loading && error && (
          <ErrorBanner message={error} onRetry={() => void loadExisting()} />
        )}
        {!loading && !error && (!result || result.replies.length === 0) && (
          <EmptyHint>No replies yet — generate AI reply suggestions.</EmptyHint>
        )}
        {!loading && !error && result && result.replies.length > 0 && (
          <Box className="space-y-3" aria-label="Suggested replies">
            {result.replies.map((reply, i) => {
              const isSelected = result.selectedReply === reply.text;
              return (
                <Box
                  key={`${i}-${reply.tone}`}
                  className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 ${
                    isSelected
                      ? "border-brand-600 bg-brand-100/40"
                      : "border-border bg-surface-raised"
                  }`}
                >
                  <Box className="flex-1 min-w-0 space-y-1.5">
                    <Text variant="body-sm" className="text-content whitespace-pre-wrap">
                      {reply.text}
                    </Text>
                    <Box className="flex flex-wrap gap-1.5">
                      <Chip className="bg-surface border border-border text-content-subtle">
                        {reply.tone}
                      </Chip>
                      <Chip className="bg-surface border border-border text-content-subtle">
                        {confidencePct(reply.confidence)}
                      </Chip>
                      {isSelected && <Chip>Selected</Chip>}
                    </Box>
                  </Box>
                  {!isSelected && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void selectReply(i, reply.text)}
                      disabled={selecting !== null}
                      aria-label={`Use reply option ${i + 1}`}
                      className="flex-shrink-0"
                    >
                      {selecting === i ? "Selecting…" : "Use this"}
                    </Button>
                  )}
                </Box>
              );
            })}
            <Text variant="caption" className="text-content-subtle">
              Generated {formatDateTime(result.generatedAt)}
            </Text>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
SmartRepliesPanel.displayName = "SmartRepliesPanel";

// ─── Predictive action panel ───────────────────────────────────────────────────

function PredictivePanel({ emailId }: { emailId: string }): ReactNode {
  const [result, setResult] = useState<PredictiveAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [feedbackAction, setFeedbackAction] = useState<string>("reply");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadExisting = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await aiIntelligenceApi.getPrediction(emailId);
      setResult(res?.data ?? null);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [emailId]);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  async function predict(): Promise<void> {
    setRunning(true);
    setError(null);
    try {
      const res = await aiIntelligenceApi.predictAction(emailId);
      setResult(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setRunning(false);
    }
  }

  async function submitFeedback(): Promise<void> {
    if (!result) return;
    setSubmittingFeedback(true);
    setError(null);
    try {
      const res = await aiIntelligenceApi.submitActionFeedback(
        result.id,
        feedbackAction,
      );
      setResult({
        ...result,
        userAction: res.data.userAction,
        wasAccurate: res.data.wasAccurate,
      });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSubmittingFeedback(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between gap-3">
          <Box>
            <Text variant="heading-sm" className="font-semibold">
              Predicted Action
            </Text>
            <Text variant="caption" className="text-content-subtle">
              AI-predicted next action for this email, with a confidence score.
            </Text>
          </Box>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void predict()}
            disabled={running || loading}
            aria-label="Predict the next action for this email"
          >
            {running ? "Predicting…" : result ? "Re-predict" : "Predict action"}
          </Button>
        </Box>
      </CardHeader>
      <CardContent>
        {loading && <LoadingSkeleton rows={2} />}
        {!loading && error && (
          <ErrorBanner message={error} onRetry={() => void loadExisting()} />
        )}
        {!loading && !error && !result && (
          <EmptyHint>No prediction yet — run the action predictor.</EmptyHint>
        )}
        {!loading && !error && result && (
          <Box className="space-y-4">
            <Box className="flex items-center gap-3 flex-wrap">
              <Chip>{humanizeAction(result.predictedAction)}</Chip>
              <Text variant="caption" className="text-content-subtle">
                confidence {confidencePct(result.confidence)}
              </Text>
            </Box>
            <Text variant="body-sm" className="text-content">
              {result.reasoning}
            </Text>
            {result.userAction === null ? (
              <Box className="flex flex-wrap items-end gap-2">
                <Box className="flex flex-col gap-1.5">
                  <Text
                    as="label"
                    variant="label"
                    htmlFor="predictive-feedback-action"
                  >
                    What did you actually do?
                  </Text>
                  <Box
                    as="select"
                    id="predictive-feedback-action"
                    className="h-8 rounded-md border border-border bg-surface px-2 text-body-sm text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    value={feedbackAction}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      setFeedbackAction(e.target.value)
                    }
                  >
                    {FEEDBACK_ACTIONS.map((action) => (
                      <option key={action} value={action}>
                        {humanizeAction(action)}
                      </option>
                    ))}
                  </Box>
                </Box>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void submitFeedback()}
                  disabled={submittingFeedback}
                  aria-label="Submit the action you actually took"
                >
                  {submittingFeedback ? "Saving…" : "Record"}
                </Button>
              </Box>
            ) : (
              <Box className="flex items-center gap-2 flex-wrap">
                <Text variant="body-sm" className="text-content-subtle">
                  You did: {humanizeAction(result.userAction)}
                </Text>
                {result.wasAccurate !== null && (
                  <Chip
                    className={
                      result.wasAccurate
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }
                  >
                    {result.wasAccurate ? "Prediction correct" : "Prediction missed"}
                  </Chip>
                )}
              </Box>
            )}
            <Text variant="caption" className="text-content-subtle">
              Predicted {formatDateTime(result.predictedAt)}
            </Text>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
PredictivePanel.displayName = "PredictivePanel";

// ─── Email workbench ───────────────────────────────────────────────────────────

function EmailWorkbench(): ReactNode {
  const [emailIdInput, setEmailIdInput] = useState("");
  const [activeEmailId, setActiveEmailId] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const trimmed = emailIdInput.trim();
    if (trimmed.length > 0) {
      setActiveEmailId(trimmed);
    }
  }

  return (
    <Box className="space-y-4">
      <Card>
        <CardHeader>
          <Text variant="heading-sm" className="font-semibold">
            Email Analysis Workbench
          </Text>
          <Text variant="body-sm" className="text-content-subtle">
            Enter an email ID to run AI priority scoring, sentiment analysis,
            smart replies, and action prediction against it.
          </Text>
        </CardHeader>
        <CardContent>
          <Box as="form" onSubmit={handleSubmit} className="flex items-end gap-3">
            <Box className="flex-1 max-w-md">
              <Input
                label="Email ID"
                value={emailIdInput}
                onChange={(e) => setEmailIdInput(e.target.value)}
                placeholder="e.g. 3f9a1c2b…"
                inputSize="md"
              />
            </Box>
            <Button
              type="submit"
              variant="primary"
              disabled={emailIdInput.trim().length === 0}
            >
              Analyze
            </Button>
          </Box>
        </CardContent>
      </Card>

      {activeEmailId === null ? (
        <Box className="rounded-xl border border-dashed border-border bg-surface-raised px-6 py-10 text-center">
          <Text variant="body-sm" className="text-content-subtle">
            No email selected. Open any email in your inbox and paste its ID
            above to see the full AI analysis.
          </Text>
        </Box>
      ) : (
        <Box className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PriorityPanel key={`priority-${activeEmailId}`} emailId={activeEmailId} />
          <SentimentPanel key={`sentiment-${activeEmailId}`} emailId={activeEmailId} />
          <SmartRepliesPanel key={`replies-${activeEmailId}`} emailId={activeEmailId} />
          <PredictivePanel key={`predict-${activeEmailId}`} emailId={activeEmailId} />
        </Box>
      )}
    </Box>
  );
}
EmailWorkbench.displayName = "EmailWorkbench";

// ─── Relationship insights ─────────────────────────────────────────────────────

function RelationshipCard({ insight }: { insight: RelationshipInsight }): ReactNode {
  return (
    <Box className="rounded-lg border border-border bg-surface-raised px-4 py-3 space-y-2.5">
      <Box className="flex items-start justify-between gap-3">
        <Box className="min-w-0">
          <Text variant="body-sm" className="font-medium text-content truncate">
            {insight.contactName ?? insight.contactEmail}
          </Text>
          {insight.contactName && (
            <Text variant="caption" className="text-content-subtle truncate">
              {insight.contactEmail}
            </Text>
          )}
        </Box>
        {insight.fadingAlert && (
          <Chip className="bg-orange-100 text-orange-700">Fading</Chip>
        )}
      </Box>
      <ScoreBar label="Relationship strength" value={insight.relationshipScore} />
      <Box className="flex flex-wrap gap-1.5">
        <Chip className="bg-surface border border-border text-content-subtle">
          {insight.emailFrequency}
        </Chip>
        <Chip className="bg-surface border border-border text-content-subtle">
          {insight.sentiment}
        </Chip>
        {insight.avgResponseTimeHours !== null && (
          <Chip className="bg-surface border border-border text-content-subtle">
            replies in ~{insight.avgResponseTimeHours.toFixed(1)}h
          </Chip>
        )}
        {insight.topTopics.slice(0, 3).map((topic) => (
          <Chip key={topic}>{topic}</Chip>
        ))}
      </Box>
      <Box className="flex items-center justify-between gap-3 flex-wrap">
        <Text variant="caption" className="text-content-subtle">
          {insight.lastContactedAt
            ? `Last contact ${formatDate(insight.lastContactedAt)}`
            : "No recent contact recorded"}
        </Text>
        {insight.suggestedAction && (
          <Text variant="caption" className="text-brand-700">
            Suggested: {insight.suggestedAction}
          </Text>
        )}
      </Box>
    </Box>
  );
}
RelationshipCard.displayName = "RelationshipCard";

function RelationshipsSection(): ReactNode {
  const [insights, setInsights] = useState<RelationshipInsight[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [fadingOnly, setFadingOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFirstPage = useCallback(
    async (fading: boolean): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const res = await aiIntelligenceApi.listRelationships({
          limit: 20,
          fadingOnly: fading,
        });
        setInsights(res.data);
        setCursor(res.cursor);
        setHasMore(res.hasMore);
      } catch (err) {
        setError(errMsg(err));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadFirstPage(fadingOnly);
  }, [loadFirstPage, fadingOnly]);

  async function loadMore(): Promise<void> {
    if (!cursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await aiIntelligenceApi.listRelationships({
        limit: 20,
        cursor,
        fadingOnly,
      });
      setInsights((prev) => [...prev, ...res.data]);
      setCursor(res.cursor);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between gap-3 flex-wrap">
          <Box>
            <Text variant="heading-sm" className="font-semibold">
              Relationship Insights
            </Text>
            <Text variant="body-sm" className="text-content-subtle">
              AI-derived contact intelligence — strength, cadence, and fading
              relationships worth reviving.
            </Text>
          </Box>
          <Button
            variant={fadingOnly ? "primary" : "outline"}
            size="sm"
            onClick={() => setFadingOnly((v) => !v)}
            aria-pressed={fadingOnly}
            aria-label="Toggle showing only fading relationships"
          >
            {fadingOnly ? "Showing fading only" : "Show fading only"}
          </Button>
        </Box>
      </CardHeader>
      <CardContent>
        {loading && <LoadingSkeleton rows={3} />}
        {!loading && error && (
          <ErrorBanner message={error} onRetry={() => void loadFirstPage(fadingOnly)} />
        )}
        {!loading && !error && insights.length === 0 && (
          <EmptyHint>
            {fadingOnly
              ? "No fading relationships — nice work staying in touch."
              : "No relationship insights yet. They build up automatically as you send and receive email."}
          </EmptyHint>
        )}
        {!loading && !error && insights.length > 0 && (
          <Box className="space-y-3">
            <Box className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {insights.map((insight) => (
                <RelationshipCard key={insight.id} insight={insight} />
              ))}
            </Box>
            {hasMore && (
              <Box className="text-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
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
RelationshipsSection.displayName = "RelationshipsSection";

// ─── Writing coach ─────────────────────────────────────────────────────────────

function gradeColorClass(grade: string): string {
  if (grade === "A") return "text-green-600";
  if (grade === "B") return "text-emerald-600";
  if (grade === "C") return "text-yellow-600";
  return "text-red-600";
}

function WritingCoachSection(): ReactNode {
  const [content, setContent] = useState("");
  const [result, setResult] = useState<WritingCoachResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const trimmed = content.trim();
    if (trimmed.length === 0) return;
    setRunning(true);
    setError(null);
    try {
      const res = await aiIntelligenceApi.analyzeWriting({ content: trimmed });
      setResult(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm" className="font-semibold">
          Writing Coach
        </Text>
        <Text variant="body-sm" className="text-content-subtle">
          Paste a draft and get clarity, tone, and persuasiveness scoring with
          concrete rewrite suggestions.
        </Text>
      </CardHeader>
      <CardContent>
        <Box as="form" onSubmit={(e: FormEvent<HTMLFormElement>) => void analyze(e)} className="space-y-4">
          <Box className="flex flex-col gap-1.5">
            <Text as="label" variant="label" htmlFor="writing-coach-content">
              Draft content
            </Text>
            <Box
              as="textarea"
              id="writing-coach-content"
              className="min-h-32 w-full rounded-lg border border-border bg-surface px-3 py-2 text-body-sm text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              value={content}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setContent(e.target.value)
              }
              placeholder="Paste your draft email here…"
              rows={6}
            />
          </Box>
          <Button
            type="submit"
            variant="primary"
            disabled={running || content.trim().length === 0}
          >
            {running ? "Analyzing…" : "Analyze draft"}
          </Button>
        </Box>

        {error && (
          <Box className="mt-4">
            <ErrorBanner message={error} />
          </Box>
        )}

        {result && !error && (
          <Box className="mt-6 space-y-5">
            <Box className="flex items-center gap-4">
              <Box className="flex items-baseline gap-2">
                <Text
                  variant="heading-lg"
                  className={`font-bold leading-none ${gradeColorClass(result.overallGrade)}`}
                >
                  {result.overallGrade}
                </Text>
                <Text variant="caption" className="text-content-subtle uppercase tracking-wide">
                  Overall grade
                </Text>
              </Box>
              <Text variant="caption" className="text-content-subtle">
                Analyzed {formatDateTime(result.analyzedAt)}
              </Text>
            </Box>
            <Box className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ScoreBar label="Clarity" value={result.clarityScore} />
              <ScoreBar label="Tone" value={result.toneScore} />
              <ScoreBar label="Persuasiveness" value={result.persuasivenessScore} />
            </Box>
            {result.suggestions.length > 0 && (
              <Box className="space-y-3" aria-label="Writing suggestions">
                <Text variant="body-sm" className="font-medium text-content">
                  Suggestions
                </Text>
                {result.suggestions.map((sug, i) => (
                  <Box
                    key={`${sug.type}-${i}`}
                    className="rounded-lg border border-border bg-surface-raised px-4 py-3 space-y-1"
                  >
                    <Box className="flex items-center gap-2 flex-wrap">
                      <Chip className="bg-surface border border-border text-content-subtle capitalize">
                        {sug.type}
                      </Chip>
                      <Text variant="body-sm" className="text-content">
                        <Box as="span" className="line-through text-content-subtle">
                          {sug.original}
                        </Box>
                        {" → "}
                        <Box as="span" className="font-medium">
                          {sug.suggested}
                        </Box>
                      </Text>
                    </Box>
                    <Text variant="caption" className="text-content-subtle">
                      {sug.reason}
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
WritingCoachSection.displayName = "WritingCoachSection";

// ─── Inner page (inside plan gate) ────────────────────────────────────────────

function AiIntelligenceContent(): ReactNode {
  return (
    <Box className="space-y-6">
      <EmailWorkbench />
      <RelationshipsSection />
      <WritingCoachSection />
    </Box>
  );
}
AiIntelligenceContent.displayName = "AiIntelligenceContent";

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AiIntelligencePage(): ReactNode {
  return (
    <PageLayout
      title="AI Intelligence"
      description="Priority scoring, sentiment, smart replies, action prediction, relationship insights, and a writing coach — all in one workbench."
    >
      <PlanGate feature="context_intelligence" required="pro">
        <AiIntelligenceContent />
      </PlanGate>
    </PageLayout>
  );
}
