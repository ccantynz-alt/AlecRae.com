"use client";

import { useState, useCallback, useEffect, useRef, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GrammarIssue {
  readonly offset: number;
  readonly length: number;
  readonly original: string;
  readonly suggestions: readonly string[];
  readonly category:
    | "spelling"
    | "grammar"
    | "punctuation"
    | "style"
    | "tone"
    | "clarity"
    | "conciseness"
    | "etiquette"
    | "formality";
  readonly message: string;
  readonly confidence: number;
  readonly severity: "info" | "warning" | "error";
}

export interface EmailWarning {
  readonly type:
    | "missing_attachment"
    | "reply_all_risk"
    | "empty_subject"
    | "large_recipient_list"
    | "sensitive_content"
    | "missing_greeting"
    | "missing_signoff";
  readonly message: string;
  readonly severity: "info" | "warning" | "error";
}

export interface GrammarCheckResult {
  readonly issues: readonly GrammarIssue[];
  readonly correctedText: string;
  readonly qualityScore: number;
  readonly detectedLanguage: string;
  readonly detectedTone: string;
  readonly processingTimeMs: number;
  readonly emailWarnings: readonly EmailWarning[];
}

export type GrammarCheckRequestFn = (text: string) => Promise<GrammarCheckResult>;

export interface GrammarPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** The text to check (pass the current compose body) */
  text: string;
  /** Callback to run grammar check against the API */
  onGrammarCheck: GrammarCheckRequestFn;
  /** Callback when user selects a correction */
  onApplyCorrection: (issue: GrammarIssue, replacement: string) => void;
  /** Callback to apply all high-confidence fixes at once */
  onApplyAll?: () => void;
  /** Callback to dismiss an issue */
  onDismissIssue?: (issue: GrammarIssue) => void;
  /** Debounce interval in ms (default 1500) */
  debounceMs?: number;
  /** Whether grammar checking is enabled */
  enabled?: boolean;
  /** Additional className */
  className?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const SEVERITY_DOT: Record<GrammarIssue["severity"], string> = {
  error: "bg-red-400",
  warning: "bg-yellow-400",
  info: "bg-slate-400",
};

const SEVERITY_BG: Record<GrammarIssue["severity"], string> = {
  error: "bg-status-error/10",
  warning: "bg-status-warning/10",
  info: "bg-slate-700/30",
};

const WARNING_BG: Record<EmailWarning["severity"], string> = {
  error: "bg-status-error/10 border-red-500/20",
  warning: "bg-status-warning/10 border-yellow-500/20",
  info: "bg-slate-700/30 border-slate-500/20",
};

const WARNING_INDICATOR: Record<EmailWarning["severity"], string> = {
  error: "text-red-400",
  warning: "text-yellow-400",
  info: "text-slate-400",
};

function scoreColor(score: number): string {
  if (score >= 80) return "bg-emerald-500/20 text-emerald-300";
  if (score >= 60) return "bg-yellow-500/20 text-yellow-300";
  return "bg-red-500/20 text-red-300";
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function GrammarPanel({
  text,
  onGrammarCheck,
  onApplyCorrection,
  onApplyAll,
  onDismissIssue,
  debounceMs = 1500,
  enabled = true,
  className = "",
  ...rest
}: GrammarPanelProps): React.JSX.Element | null {
  const [result, setResult] = useState<GrammarCheckResult | null>(null);
  const [checking, setChecking] = useState<boolean>(false);
  const [selectedIssue, setSelectedIssue] = useState<GrammarIssue | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTextRef = useRef<string>("");

  // Debounced grammar check
  useEffect((): (() => void) => {
    if (!enabled || text.length < 3 || text === lastTextRef.current) {
      return (): void => { /* noop */ };
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout((): void => {
      lastTextRef.current = text;
      setChecking(true);
      void onGrammarCheck(text)
        .then((r) => {
          setResult(r);
          setDismissed(new Set());
          setSelectedIssue(null);
        })
        .catch(() => {
          // Silent fail — grammar check is non-critical
        })
        .finally(() => {
          setChecking(false);
        });
    }, debounceMs);

    return (): void => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [text, enabled, debounceMs, onGrammarCheck]);

  const handleDismiss = useCallback(
    (issue: GrammarIssue): void => {
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(issue.offset);
        return next;
      });
      if (selectedIssue?.offset === issue.offset) {
        setSelectedIssue(null);
      }
      if (onDismissIssue) {
        onDismissIssue(issue);
      }
    },
    [selectedIssue, onDismissIssue],
  );

  const handleApply = useCallback(
    (issue: GrammarIssue, replacement: string): void => {
      onApplyCorrection(issue, replacement);
      handleDismiss(issue);
    },
    [onApplyCorrection, handleDismiss],
  );

  const handleFixAll = useCallback((): void => {
    if (onApplyAll) {
      onApplyAll();
    }
  }, [onApplyAll]);

  if (!enabled) return null;

  const visibleIssues =
    result?.issues.filter((i) => !dismissed.has(i.offset)) ?? [];
  const emailWarnings = result?.emailWarnings ?? [];
  const hasContent = visibleIssues.length > 0 || emailWarnings.length > 0;
  const isAllClear =
    result !== null &&
    result.qualityScore >= 95 &&
    visibleIssues.length === 0 &&
    emailWarnings.length === 0;

  // Return null only when there is nothing to show and we are not checking
  if (!checking && !hasContent && !isAllClear) return null;

  const highConfidenceCount = visibleIssues.filter(
    (i) => i.confidence >= 0.8 && i.suggestions.length > 0,
  ).length;

  return (
    <Box
      className={`rounded-xl border border-white/10 bg-slate-900/60 backdrop-blur-sm overflow-hidden ${className}`}
      {...rest}
    >
      {/* ── Header ────────────────────────────────────────────────── */}
      <Box className="flex items-center justify-between px-4 py-2.5 bg-slate-800/40 border-b border-white/10">
        <Box className="flex items-center gap-2">
          <Box
            className={`h-2 w-2 rounded-full ${
              checking
                ? "bg-yellow-400 animate-pulse"
                : visibleIssues.length > 0
                  ? "bg-orange-400"
                  : "bg-emerald-400"
            }`}
          />
          <Text variant="label" className="text-xs text-blue-100/70">
            {checking ? "Checking grammar..." : "Grammar"}
          </Text>

          {/* Quality score badge */}
          {result && !checking ? (
            <Box
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${scoreColor(result.qualityScore)}`}
            >
              <Text variant="label" className="text-xs">
                {result.qualityScore}
              </Text>
            </Box>
          ) : null}

          {/* Issue count */}
          {!checking && visibleIssues.length > 0 ? (
            <Text variant="label" className="text-xs text-blue-100/40">
              {visibleIssues.length}{" "}
              {visibleIssues.length === 1 ? "issue" : "issues"}
            </Text>
          ) : null}
        </Box>

        <Box className="flex items-center gap-2">
          {/* Fix All button */}
          {onApplyAll && highConfidenceCount > 0 && !checking ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleFixAll}
              className="text-xs"
            >
              Fix All ({highConfidenceCount})
            </Button>
          ) : null}
        </Box>
      </Box>

      {/* ── All Clear message ─────────────────────────────────────── */}
      {isAllClear && !checking ? (
        <Box className="px-4 py-4 flex items-center gap-2 bg-status-success/10">
          <Box className="h-2 w-2 rounded-full bg-emerald-400" />
          <Text variant="body-sm" className="text-emerald-300">
            All clear — no grammar issues found.
          </Text>
        </Box>
      ) : null}

      {/* ── Email Warnings ────────────────────────────────────────── */}
      {emailWarnings.length > 0 && !checking ? (
        <Box className="px-4 py-2 space-y-2 border-b border-white/5">
          {emailWarnings.map((warning, idx) => (
            <Box
              key={`${warning.type}-${idx}`}
              className={`rounded-lg border px-3 py-2 flex items-start gap-2 ${WARNING_BG[warning.severity]}`}
            >
              <Text
                variant="label"
                className={`text-sm mt-0.5 ${WARNING_INDICATOR[warning.severity]}`}
              >
                {warning.severity === "error"
                  ? "!"
                  : warning.severity === "warning"
                    ? "!"
                    : "i"}
              </Text>
              <Text variant="body-sm" className="text-blue-100/80">
                {warning.message}
              </Text>
            </Box>
          ))}
        </Box>
      ) : null}

      {/* ── Issues list ───────────────────────────────────────────── */}
      {visibleIssues.length > 0 && !checking ? (
        <Box className="divide-y divide-white/5 max-h-72 overflow-y-auto">
          {visibleIssues.map((issue) => (
            <Box
              key={`${issue.offset}-${issue.original}`}
              className={`px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors ${
                selectedIssue?.offset === issue.offset ? "bg-white/5" : ""
              }`}
              role="button"
              tabIndex={0}
              aria-label={`Grammar issue: ${issue.original} — ${issue.message}`}
              onClick={(): void =>
                setSelectedIssue(
                  selectedIssue?.offset === issue.offset ? null : issue,
                )
              }
              onKeyDown={(e: React.KeyboardEvent): void => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedIssue(
                    selectedIssue?.offset === issue.offset ? null : issue,
                  );
                }
              }}
            >
              {/* Issue summary row */}
              <Box className="flex items-center justify-between">
                <Box className="flex items-center gap-3">
                  {/* Severity dot */}
                  <Box
                    className={`h-2 w-2 rounded-full flex-shrink-0 ${SEVERITY_DOT[issue.severity]}`}
                  />
                  {/* Category badge */}
                  <Box
                    className={`rounded px-1.5 py-0.5 ${SEVERITY_BG[issue.severity]}`}
                  >
                    <Text variant="label" className="text-[10px] uppercase tracking-wide text-blue-100/60">
                      {issue.category}
                    </Text>
                  </Box>
                  {/* Original text */}
                  <Text
                    variant="body-sm"
                    className="text-red-400 line-through font-mono"
                  >
                    {issue.original}
                  </Text>
                  {issue.suggestions.length > 0 ? (
                    <Text variant="body-sm" className="text-blue-100/40">
                      {"→"}
                    </Text>
                  ) : null}
                  {issue.suggestions.length > 0 ? (
                    <Text
                      variant="body-sm"
                      className="text-emerald-300 font-mono"
                    >
                      {issue.suggestions[0]}
                    </Text>
                  ) : null}
                </Box>
                <Text variant="label" className="text-xs text-blue-100/30">
                  {Math.round(issue.confidence * 100)}%
                </Text>
              </Box>

              {/* Issue message */}
              <Box className="mt-1 ml-5">
                <Text variant="caption" className="text-xs text-blue-100/50">
                  {issue.message}
                </Text>
              </Box>

              {/* Expanded suggestion panel */}
              {selectedIssue?.offset === issue.offset ? (
                <Box className="mt-3 space-y-2 ml-5">
                  {issue.suggestions.length > 0 ? (
                    <Box className="flex flex-wrap gap-1.5">
                      {issue.suggestions.map((suggestion) => (
                        <Button
                          key={suggestion}
                          variant="secondary"
                          size="sm"
                          onClick={(e: React.MouseEvent): void => {
                            e.stopPropagation();
                            handleApply(issue, suggestion);
                          }}
                          className="text-xs font-mono"
                        >
                          {suggestion}
                        </Button>
                      ))}
                    </Box>
                  ) : null}
                  <Box className="flex items-center gap-2 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e: React.MouseEvent): void => {
                        e.stopPropagation();
                        handleDismiss(issue);
                      }}
                      className="text-xs text-blue-100/50"
                    >
                      Dismiss
                    </Button>
                  </Box>
                </Box>
              ) : null}
            </Box>
          ))}
        </Box>
      ) : null}

      {/* ── Loading state ─────────────────────────────────────────── */}
      {checking ? (
        <Box className="px-4 py-4 flex items-center gap-2">
          <Box className="h-3 w-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
          <Text variant="body-sm" className="text-blue-100/50">
            Analyzing grammar, style, and email etiquette...
          </Text>
        </Box>
      ) : null}

      {/* ── Footer ────────────────────────────────────────────────── */}
      {result && !checking ? (
        <Box className="flex items-center justify-between px-4 py-2 bg-slate-800/30 border-t border-white/5">
          <Box className="flex items-center gap-3">
            <Text variant="label" className="text-xs text-blue-100/40">
              {result.detectedLanguage.toUpperCase()}
            </Text>
            <Text variant="label" className="text-xs text-blue-100/30">
              {"·"}
            </Text>
            <Text variant="label" className="text-xs text-blue-100/40">
              {result.detectedTone}
            </Text>
          </Box>
          <Box className="flex items-center gap-3">
            <Text variant="label" className="text-xs text-blue-100/30">
              {wordCount(text)} words
            </Text>
            <Text variant="label" className="text-xs text-blue-100/30">
              {"·"}
            </Text>
            <Text variant="label" className="text-xs text-blue-100/30">
              {Math.round(result.processingTimeMs)}ms
            </Text>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
