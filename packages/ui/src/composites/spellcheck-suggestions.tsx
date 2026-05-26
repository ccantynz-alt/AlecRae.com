"use client";

import { useState, useCallback, useEffect, useRef, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SpellCheckIssue {
  readonly offset: number;
  readonly length: number;
  readonly word: string;
  readonly suggestions: readonly string[];
  readonly confidence: number;
  readonly language: string;
}

export interface SpellCheckResult {
  readonly issues: readonly SpellCheckIssue[];
  readonly detectedLanguage: string;
  readonly wordCount: number;
  readonly issueCount: number;
  readonly processingTimeMs: number;
}

export type SpellCheckRequestFn = (text: string) => Promise<SpellCheckResult>;
export type AddToDictionaryFn = (word: string) => Promise<void>;

export interface SpellCheckSuggestionsProps extends HTMLAttributes<HTMLDivElement> {
  /** The text to check (pass the current compose body) */
  text: string;
  /** Callback to run spell check against the API */
  onSpellCheck: SpellCheckRequestFn;
  /** Callback when user selects a correction */
  onApplyCorrection: (issue: SpellCheckIssue, replacement: string) => void;
  /** Callback to add a word to the user's custom dictionary */
  onAddToDictionary?: AddToDictionaryFn;
  /** Debounce interval in ms (default 1000) */
  debounceMs?: number;
  /** Whether spell check is enabled */
  enabled?: boolean;
  /** Additional className */
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SpellCheckSuggestions({
  text,
  onSpellCheck,
  onApplyCorrection,
  onAddToDictionary,
  debounceMs = 1000,
  enabled = true,
  className = "",
  ...rest
}: SpellCheckSuggestionsProps): React.JSX.Element | null {
  const [result, setResult] = useState<SpellCheckResult | null>(null);
  const [checking, setChecking] = useState<boolean>(false);
  const [selectedIssue, setSelectedIssue] = useState<SpellCheckIssue | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTextRef = useRef<string>("");

  // Debounced spell check
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
      void onSpellCheck(text)
        .then((r) => {
          setResult(r);
          setDismissed(new Set());
          setSelectedIssue(null);
        })
        .catch(() => {
          // Silent fail — spell check is non-critical
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
  }, [text, enabled, debounceMs, onSpellCheck]);

  const handleDismiss = useCallback((issue: SpellCheckIssue): void => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(issue.offset);
      return next;
    });
    if (selectedIssue?.offset === issue.offset) {
      setSelectedIssue(null);
    }
  }, [selectedIssue]);

  const handleAddToDictionary = useCallback(
    async (issue: SpellCheckIssue): Promise<void> => {
      if (onAddToDictionary) {
        await onAddToDictionary(issue.word);
      }
      handleDismiss(issue);
    },
    [onAddToDictionary, handleDismiss],
  );

  const handleApply = useCallback(
    (issue: SpellCheckIssue, replacement: string): void => {
      onApplyCorrection(issue, replacement);
      handleDismiss(issue);
    },
    [onApplyCorrection, handleDismiss],
  );

  if (!enabled) return null;

  const visibleIssues = result?.issues.filter((i) => !dismissed.has(i.offset)) ?? [];

  if (visibleIssues.length === 0 && !checking) return null;

  return (
    <Box
      className={`rounded-xl border border-white/10 bg-slate-900/60 backdrop-blur-sm overflow-hidden ${className}`}
      {...rest}
    >
      {/* Header */}
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
            {checking
              ? "Checking spelling..."
              : visibleIssues.length > 0
                ? `${visibleIssues.length} spelling ${visibleIssues.length === 1 ? "issue" : "issues"}`
                : "No spelling issues"}
          </Text>
        </Box>
        {result ? (
          <Text variant="label" className="text-xs text-blue-100/40">
            {result.detectedLanguage.toUpperCase()} · {result.wordCount} words · {Math.round(result.processingTimeMs)}ms
          </Text>
        ) : null}
      </Box>

      {/* Issue list */}
      {visibleIssues.length > 0 ? (
        <Box className="divide-y divide-white/5 max-h-60 overflow-y-auto">
          {visibleIssues.map((issue) => (
            <Box
              key={`${issue.offset}-${issue.word}`}
              className={`px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors ${
                selectedIssue?.offset === issue.offset ? "bg-white/5" : ""
              }`}
              role="button"
              tabIndex={0}
              aria-label={`Spelling issue: ${issue.word}`}
              onClick={(): void => setSelectedIssue(
                selectedIssue?.offset === issue.offset ? null : issue,
              )}
              onKeyDown={(e: React.KeyboardEvent): void => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedIssue(
                    selectedIssue?.offset === issue.offset ? null : issue,
                  );
                }
              }}
            >
              <Box className="flex items-center justify-between">
                <Box className="flex items-center gap-3">
                  <Text
                    variant="body-md"
                    className="text-red-400 line-through text-sm font-mono"
                  >
                    {issue.word}
                  </Text>
                  {issue.suggestions.length > 0 ? (
                    <Text variant="body-md" className="text-blue-100/40 text-sm">
                      →
                    </Text>
                  ) : null}
                  {issue.suggestions.length > 0 ? (
                    <Text
                      variant="body-md"
                      className="text-emerald-300 text-sm font-mono"
                    >
                      {issue.suggestions[0]}
                    </Text>
                  ) : null}
                </Box>
                <Box className="flex items-center gap-1.5">
                  <Text variant="label" className="text-xs text-blue-100/30">
                    {Math.round(issue.confidence * 100)}%
                  </Text>
                </Box>
              </Box>

              {/* Expanded suggestion panel */}
              {selectedIssue?.offset === issue.offset ? (
                <Box className="mt-3 space-y-2">
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
                      Ignore
                    </Button>
                    {onAddToDictionary ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e: React.MouseEvent): void => {
                          e.stopPropagation();
                          void handleAddToDictionary(issue);
                        }}
                        className="text-xs text-blue-100/50"
                      >
                        Add to dictionary
                      </Button>
                    ) : null}
                  </Box>
                </Box>
              ) : null}
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
