"use client";

/**
 * QueryConsole — Email-as-Database query interface (B2)
 *
 * Split-pane console: query input (top) + results table (bottom).
 * Supports natural language and SQL-like syntax with auto-complete,
 * syntax highlighting for SQL keywords, explain mode, CSV export,
 * query history sidebar, and saved queries.
 *
 * Fully accessible: keyboard-navigable (Cmd+Enter to run), ARIA labels,
 * focus management, screen reader friendly.
 */

import {
  forwardRef,
  useState,
  useCallback,
  useRef,
  type KeyboardEvent,
  type ChangeEvent,
  type HTMLAttributes,
} from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";
import { Card, CardContent, CardHeader } from "../primitives/card";
import { Input } from "../primitives/input";

// ─── Types ─────────────────────────────────────────────────────────────────

export type QueryMode = "natural" | "sql";
export type QueryState = "idle" | "running" | "explaining" | "success" | "error";
export type ConsolePanelView = "results" | "history" | "saved";

export interface QueryResultColumn {
  readonly name: string;
  readonly type: "string" | "number" | "boolean" | "date" | "unknown";
}

export interface QueryResultData {
  readonly columns: readonly string[];
  readonly rows: readonly Record<string, unknown>[];
  readonly rowCount: number;
  readonly executionTimeMs: number;
  readonly originalQuery: string;
  readonly parsedDescription?: string;
}

export interface QueryHistoryEntry {
  readonly id: string;
  readonly queryText: string;
  readonly queryType: QueryMode;
  readonly resultCount: number | null;
  readonly executionTimeMs: number | null;
  readonly createdAt: string;
}

export interface SavedQueryEntry {
  readonly id: string;
  readonly name: string;
  readonly queryText: string;
  readonly queryType: QueryMode;
  readonly lastRunAt: string | null;
  readonly runCount: number;
  readonly createdAt: string;
}

export interface QueryExplanationData {
  readonly description: string;
  readonly estimatedScope: string;
  readonly warnings: readonly string[];
}

export interface QueryConsoleProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onError"> {
  /** Current query execution state. */
  state: QueryState;
  /** Current query text. */
  queryText: string;
  /** Current query mode. */
  mode: QueryMode;
  /** Result data from the last query. */
  result: QueryResultData | null;
  /** Explanation data (when using explain mode). */
  explanation: QueryExplanationData | null;
  /** Error message (when state="error"). */
  errorMessage?: string;
  /** Query history entries. */
  history: readonly QueryHistoryEntry[];
  /** Saved query entries. */
  savedQueries: readonly SavedQueryEntry[];
  /** Current sidebar panel view. */
  panelView: ConsolePanelView;
  /** Sort column for results (null = no sort). */
  sortColumn: string | null;
  /** Sort direction for results. */
  sortDirection: "asc" | "desc";

  // Callbacks
  /** Called when query text changes. */
  onQueryChange: (text: string) => void;
  /** Called when query mode toggles. */
  onModeChange: (mode: QueryMode) => void;
  /** Called to execute the query. */
  onExecute: () => void;
  /** Called to explain the query. */
  onExplain: () => void;
  /** Called when user exports to CSV. */
  onExportCsv: () => void;
  /** Called when a history entry is clicked. */
  onHistorySelect: (entry: QueryHistoryEntry) => void;
  /** Called when a saved query is clicked. */
  onSavedQuerySelect: (entry: SavedQueryEntry) => void;
  /** Called to save the current query. */
  onSaveQuery: (name: string) => void;
  /** Called to delete a saved query. */
  onDeleteSavedQuery: (id: string) => void;
  /** Called when panel view changes. */
  onPanelViewChange: (view: ConsolePanelView) => void;
  /** Called when sort changes. */
  onSortChange: (column: string) => void;

  /** Extra Tailwind classes. */
  className?: string;
}

// ─── SQL keyword highlighting ──────────────────────────────────────────────

const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "ORDER", "BY",
  "LIMIT", "OFFSET", "GROUP", "COUNT", "AVG", "SUM", "ASC", "DESC",
  "LIKE", "IN", "IS", "NULL", "BETWEEN", "HAVING", "AS",
];

const FIELD_NAMES = [
  "from", "to", "subject", "date", "hasAttachment", "labels",
  "isRead", "size", "threadLength", "status", "domain",
];

function highlightSql(text: string): { text: string; type: "keyword" | "field" | "string" | "number" | "text" }[] {
  const tokens: { text: string; type: "keyword" | "field" | "string" | "number" | "text" }[] = [];
  const words = text.split(/(\s+|,|;|\(|\))/);

  for (const word of words) {
    if (SQL_KEYWORDS.includes(word.toUpperCase())) {
      tokens.push({ text: word, type: "keyword" });
    } else if (FIELD_NAMES.includes(word)) {
      tokens.push({ text: word, type: "field" });
    } else if (/^['"].*['"]$/.test(word)) {
      tokens.push({ text: word, type: "string" });
    } else if (/^\d+$/.test(word)) {
      tokens.push({ text: word, type: "number" });
    } else {
      tokens.push({ text: word, type: "text" });
    }
  }

  return tokens;
}

// ─── Auto-complete suggestions ─────────────────────────────────────────────

function getAutoCompleteSuggestions(text: string, cursorPos: number): string[] {
  const before = text.slice(0, cursorPos);
  const lastWord = before.split(/\s+/).pop()?.toLowerCase() ?? "";

  if (lastWord.length < 2) return [];

  const allSuggestions = [
    ...FIELD_NAMES,
    ...SQL_KEYWORDS.map((k) => k.toLowerCase()),
  ];

  return allSuggestions
    .filter((s) => s.startsWith(lastWord) && s !== lastWord)
    .slice(0, 5);
}

// ─── Token color classes ───────────────────────────────────────────────────

const TOKEN_COLORS: Record<string, string> = {
  keyword: "text-purple-400 font-semibold",
  field: "text-cyan-400",
  string: "text-green-400",
  number: "text-amber-400",
  text: "text-slate-300",
};

// ─── Component ─────────────────────────────────────────────────────────────

export const QueryConsole = forwardRef<HTMLDivElement, QueryConsoleProps>(
  function QueryConsole(props, ref) {
    const {
      state,
      queryText,
      mode,
      result,
      explanation,
      errorMessage,
      history,
      savedQueries,
      panelView,
      sortColumn,
      sortDirection,
      onQueryChange,
      onModeChange,
      onExecute,
      onExplain,
      onExportCsv,
      onHistorySelect,
      onSavedQuerySelect,
      onSaveQuery,
      onDeleteSavedQuery,
      onPanelViewChange,
      onSortChange,
      className,
      ...rest
    } = props;

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [selectedSuggestion, setSelectedSuggestion] = useState(0);
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [saveName, setSaveName] = useState("");

    const isRunning = state === "running" || state === "explaining";

    // ── Keyboard handler ───────────────────────────────────────────────
    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLTextAreaElement>) => {
        // Cmd+Enter or Ctrl+Enter to execute
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          if (!isRunning) {
            onExecute();
          }
          return;
        }

        // Cmd+Shift+Enter to explain
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "Enter") {
          e.preventDefault();
          if (!isRunning) {
            onExplain();
          }
          return;
        }

        // Handle suggestion navigation
        if (showSuggestions && suggestions.length > 0) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedSuggestion((prev) =>
              prev < suggestions.length - 1 ? prev + 1 : 0,
            );
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedSuggestion((prev) =>
              prev > 0 ? prev - 1 : suggestions.length - 1,
            );
            return;
          }
          if (e.key === "Tab" || e.key === "Enter") {
            e.preventDefault();
            const suggestion = suggestions[selectedSuggestion];
            if (suggestion) {
              applySuggestion(suggestion);
            }
            return;
          }
          if (e.key === "Escape") {
            setShowSuggestions(false);
            return;
          }
        }
      },
      [isRunning, onExecute, onExplain, showSuggestions, suggestions, selectedSuggestion],
    );

    const applySuggestion = useCallback(
      (suggestion: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const cursorPos = textarea.selectionStart;
        const before = queryText.slice(0, cursorPos);
        const after = queryText.slice(cursorPos);
        const lastWordMatch = before.match(/\S+$/);
        const lastWordStart = lastWordMatch
          ? cursorPos - lastWordMatch[0].length
          : cursorPos;

        const newText = queryText.slice(0, lastWordStart) + suggestion + " " + after;
        onQueryChange(newText);
        setShowSuggestions(false);
      },
      [queryText, onQueryChange],
    );

    // ── Input change handler ───────────────────────────────────────────
    const handleInputChange = useCallback(
      (e: ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        onQueryChange(value);

        // Auto-complete
        if (mode === "sql") {
          const cursorPos = e.target.selectionStart;
          const newSuggestions = getAutoCompleteSuggestions(value, cursorPos);
          setSuggestions(newSuggestions);
          setShowSuggestions(newSuggestions.length > 0);
          setSelectedSuggestion(0);
        } else {
          setShowSuggestions(false);
        }
      },
      [mode, onQueryChange],
    );

    // ── Save dialog handlers ───────────────────────────────────────────
    const handleSave = useCallback(() => {
      if (saveName.trim()) {
        onSaveQuery(saveName.trim());
        setSaveDialogOpen(false);
        setSaveName("");
      }
    }, [saveName, onSaveQuery]);

    // ── Format time ────────────────────────────────────────────────────
    const formatMs = (ms: number): string => {
      if (ms < 1000) return `${ms}ms`;
      return `${(ms / 1000).toFixed(2)}s`;
    };

    // ── Format value for display ───────────────────────────────────────
    const formatCellValue = (value: unknown): string => {
      if (value === null || value === undefined) return "-";
      if (typeof value === "boolean") return value ? "Yes" : "No";
      if (value instanceof Date) return value.toLocaleString();
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    };

    return (
      <Box
        ref={ref}
        className={`flex h-full flex-col bg-slate-950 ${className ?? ""}`}
        role="region"
        aria-label="Email Query Console"
        {...rest}
      >
        {/* ── Query Input Area ──────────────────────────────────────── */}
        <Box className="flex-shrink-0 border-b border-slate-700 p-4">
          {/* Mode toggle + actions */}
          <Box className="mb-3 flex items-center justify-between">
            <Box className="flex items-center gap-2">
              <Button
                variant={mode === "natural" ? "primary" : "ghost"}
                size="sm"
                onClick={() => onModeChange("natural")}
                aria-pressed={mode === "natural"}
              >
                <Text variant="caption">Natural Language</Text>
              </Button>
              <Button
                variant={mode === "sql" ? "primary" : "ghost"}
                size="sm"
                onClick={() => onModeChange("sql")}
                aria-pressed={mode === "sql"}
              >
                <Text variant="caption">SQL-like</Text>
              </Button>
            </Box>

            <Box className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onExplain}
                disabled={isRunning || !queryText.trim()}
                aria-label="Explain query"
              >
                <Text variant="caption">Explain</Text>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={onExecute}
                disabled={isRunning || !queryText.trim()}
                aria-label="Run query"
              >
                <Text variant="caption">
                  {state === "running" ? "Running..." : "Run"}
                </Text>
              </Button>
            </Box>
          </Box>

          {/* Query textarea */}
          <Box className="relative">
            <textarea
              ref={textareaRef}
              value={queryText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                mode === "natural"
                  ? "Ask a question about your emails... (e.g. 'Show me all emails from @stripe.com this month with attachments')"
                  : "SELECT from, subject, date FROM emails WHERE from LIKE '%@stripe.com' ORDER BY date DESC LIMIT 20"
              }
              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 p-3 font-mono text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={4}
              aria-label={mode === "natural" ? "Natural language query" : "SQL-like query"}
              spellCheck={mode === "natural"}
            />

            {/* SQL syntax highlighting overlay (visual only) */}
            {mode === "sql" && queryText && (
              <Box
                className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-lg p-3 font-mono text-sm"
                aria-hidden="true"
              >
                {highlightSql(queryText).map((token, idx) => (
                  <span key={idx} className={TOKEN_COLORS[token.type] ?? ""}>
                    {token.text}
                  </span>
                ))}
              </Box>
            )}

            {/* Auto-complete dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <Box
                className="absolute left-3 top-full z-50 mt-1 rounded-lg border border-slate-600 bg-slate-800 py-1 shadow-lg"
                role="listbox"
                aria-label="Auto-complete suggestions"
              >
                {suggestions.map((suggestion, idx) => (
                  <Box
                    key={suggestion}
                    className={`cursor-pointer px-3 py-1.5 text-sm ${
                      idx === selectedSuggestion
                        ? "bg-blue-600 text-white"
                        : "text-slate-300 hover:bg-slate-700"
                    }`}
                    role="option"
                    aria-selected={idx === selectedSuggestion}
                    onClick={() => applySuggestion(suggestion)}
                  >
                    <Text variant="caption">{suggestion}</Text>
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          {/* Keyboard shortcuts hint */}
          <Box className="mt-2 flex items-center gap-4">
            <Text variant="caption" className="text-slate-500">
              {navigator.platform.includes("Mac") ? "\u2318" : "Ctrl"}+Enter to run
            </Text>
            <Text variant="caption" className="text-slate-500">
              {navigator.platform.includes("Mac") ? "\u2318" : "Ctrl"}+Shift+Enter to explain
            </Text>
          </Box>
        </Box>

        {/* ── Results / Sidebar Area ───────────────────────────────── */}
        <Box className="flex min-h-0 flex-1">
          {/* Results panel */}
          <Box className="flex-1 overflow-auto p-4">
            {/* Explanation */}
            {explanation && state !== "running" && (
              <Card className="mb-4 border-blue-800 bg-blue-950/30">
                <CardHeader>
                  <Text variant="label" className="text-blue-400">
                    Query Explanation
                  </Text>
                </CardHeader>
                <CardContent>
                  <Text variant="body-md" className="mb-2 text-slate-300">
                    {explanation.description}
                  </Text>
                  <Text variant="caption" className="text-slate-400">
                    Scope: {explanation.estimatedScope}
                  </Text>
                  {explanation.warnings.length > 0 && (
                    <Box className="mt-2">
                      {explanation.warnings.map((warning, idx) => (
                        <Text
                          key={idx}
                          variant="caption"
                          className="text-amber-400"
                        >
                          Warning: {warning}
                        </Text>
                      ))}
                    </Box>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Error state */}
            {state === "error" && errorMessage && (
              <Card className="mb-4 border-red-800 bg-red-950/30">
                <CardContent>
                  <Text variant="body-md" className="text-red-400">
                    {errorMessage}
                  </Text>
                </CardContent>
              </Card>
            )}

            {/* Loading state */}
            {isRunning && (
              <Box className="flex items-center justify-center py-12">
                <Box className="flex items-center gap-3">
                  <Box className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  <Text variant="body-md" className="text-slate-400">
                    {state === "explaining"
                      ? "Analyzing query..."
                      : "Executing query..."}
                  </Text>
                </Box>
              </Box>
            )}

            {/* Results table */}
            {result && state === "success" && (
              <Box>
                {/* Results header */}
                <Box className="mb-3 flex items-center justify-between">
                  <Text variant="caption" className="text-slate-400">
                    {result.rowCount} row{result.rowCount !== 1 ? "s" : ""} in{" "}
                    {formatMs(result.executionTimeMs)}
                  </Text>
                  <Box className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onExportCsv}
                      aria-label="Export results to CSV"
                    >
                      <Text variant="caption">Export CSV</Text>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSaveDialogOpen(true)}
                      aria-label="Save this query"
                    >
                      <Text variant="caption">Save Query</Text>
                    </Button>
                  </Box>
                </Box>

                {/* Data table */}
                {result.rows.length > 0 ? (
                  <Box className="overflow-x-auto rounded-lg border border-slate-700">
                    <table className="w-full border-collapse text-sm" role="grid">
                      <thead>
                        <tr className="border-b border-slate-700 bg-slate-900">
                          {result.columns.map((col) => (
                            <th
                              key={col}
                              className="cursor-pointer px-3 py-2 text-left font-medium text-slate-300 hover:text-white"
                              onClick={() => onSortChange(col)}
                              role="columnheader"
                              aria-sort={
                                sortColumn === col
                                  ? sortDirection === "asc"
                                    ? "ascending"
                                    : "descending"
                                  : "none"
                              }
                            >
                              <Box className="flex items-center gap-1">
                                <Text variant="caption">{col}</Text>
                                {sortColumn === col && (
                                  <Text variant="caption" className="text-blue-400">
                                    {sortDirection === "asc" ? "\u2191" : "\u2193"}
                                  </Text>
                                )}
                              </Box>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((row, rowIdx) => (
                          <tr
                            key={rowIdx}
                            className="border-b border-slate-800 hover:bg-slate-800/50"
                            role="row"
                          >
                            {result.columns.map((col) => (
                              <td
                                key={col}
                                className="max-w-xs truncate px-3 py-2 text-slate-300"
                                role="gridcell"
                                title={formatCellValue(row[col])}
                              >
                                <Text variant="caption">
                                  {formatCellValue(row[col])}
                                </Text>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Box>
                ) : (
                  <Box className="rounded-lg border border-slate-700 py-8 text-center">
                    <Text variant="body-md" className="text-slate-400">
                      No results found
                    </Text>
                  </Box>
                )}
              </Box>
            )}

            {/* Idle state */}
            {state === "idle" && !result && !explanation && (
              <Box className="flex flex-col items-center justify-center py-16">
                <Text variant="heading-md" className="mb-2 text-slate-500">
                  Query Your Inbox
                </Text>
                <Text variant="body-md" className="mb-4 max-w-md text-center text-slate-600">
                  Use natural language or SQL-like syntax to search and analyze
                  your emails. Try "How many emails did I get from each domain
                  this month?" or "SELECT from, subject FROM emails WHERE
                  hasAttachment = true"
                </Text>
                <Box className="flex flex-wrap justify-center gap-2">
                  {[
                    "Show me unread emails from this week",
                    "Count emails by sender domain",
                    "Largest emails with attachments",
                    "Emails from @github.com in the last 30 days",
                  ].map((example) => (
                    <Button
                      key={example}
                      variant="ghost"
                      size="sm"
                      onClick={() => onQueryChange(example)}
                      className="text-slate-400"
                    >
                      <Text variant="caption">{example}</Text>
                    </Button>
                  ))}
                </Box>
              </Box>
            )}
          </Box>

          {/* ── Sidebar (history / saved) ──────────────────────────── */}
          <Box className="w-72 flex-shrink-0 border-l border-slate-700 bg-slate-900/50">
            {/* Sidebar tabs */}
            <Box className="flex border-b border-slate-700">
              <Button
                variant={panelView === "history" ? "ghost" : "ghost"}
                size="sm"
                className={`flex-1 rounded-none ${panelView === "history" ? "border-b-2 border-blue-500 text-blue-400" : "text-slate-500"}`}
                onClick={() => onPanelViewChange("history")}
                aria-selected={panelView === "history"}
                role="tab"
              >
                <Text variant="caption">History</Text>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`flex-1 rounded-none ${panelView === "saved" ? "border-b-2 border-blue-500 text-blue-400" : "text-slate-500"}`}
                onClick={() => onPanelViewChange("saved")}
                aria-selected={panelView === "saved"}
                role="tab"
              >
                <Text variant="caption">Saved</Text>
              </Button>
            </Box>

            <Box className="overflow-auto p-2" role="tabpanel">
              {panelView === "history" && (
                <Box>
                  {history.length === 0 ? (
                    <Text variant="caption" className="p-3 text-slate-500">
                      No recent queries
                    </Text>
                  ) : (
                    history.map((entry) => (
                      <Box
                        key={entry.id}
                        className="cursor-pointer rounded-lg p-2 hover:bg-slate-800"
                        onClick={() => onHistorySelect(entry)}
                        role="button"
                        tabIndex={0}
                        aria-label={`History: ${entry.queryText}`}
                        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onHistorySelect(entry);
                          }
                        }}
                      >
                        <Text
                          variant="caption"
                          className="mb-1 line-clamp-2 text-slate-300"
                        >
                          {entry.queryText}
                        </Text>
                        <Box className="flex items-center gap-2">
                          {entry.resultCount !== null && (
                            <Text variant="caption" className="text-slate-500">
                              {entry.resultCount} rows
                            </Text>
                          )}
                          {entry.executionTimeMs !== null && (
                            <Text variant="caption" className="text-slate-500">
                              {formatMs(entry.executionTimeMs)}
                            </Text>
                          )}
                        </Box>
                      </Box>
                    ))
                  )}
                </Box>
              )}

              {panelView === "saved" && (
                <Box>
                  {savedQueries.length === 0 ? (
                    <Text variant="caption" className="p-3 text-slate-500">
                      No saved queries
                    </Text>
                  ) : (
                    savedQueries.map((entry) => (
                      <Box
                        key={entry.id}
                        className="group cursor-pointer rounded-lg p-2 hover:bg-slate-800"
                        role="button"
                        tabIndex={0}
                        aria-label={`Saved query: ${entry.name}`}
                        onClick={() => onSavedQuerySelect(entry)}
                        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSavedQuerySelect(entry);
                          }
                        }}
                      >
                        <Box className="flex items-center justify-between">
                          <Text
                            variant="caption"
                            className="font-medium text-slate-300"
                          >
                            {entry.name}
                          </Text>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="hidden text-slate-500 hover:text-red-400 group-hover:block"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteSavedQuery(entry.id);
                            }}
                            aria-label={`Delete saved query "${entry.name}"`}
                          >
                            <Text variant="caption">x</Text>
                          </Button>
                        </Box>
                        <Text
                          variant="caption"
                          className="line-clamp-1 text-slate-500"
                        >
                          {entry.queryText}
                        </Text>
                        <Text variant="caption" className="text-slate-600">
                          Run {entry.runCount} time{entry.runCount !== 1 ? "s" : ""}
                        </Text>
                      </Box>
                    ))
                  )}
                </Box>
              )}
            </Box>
          </Box>
        </Box>

        {/* ── Save Query Dialog ─────────────────────────────────────── */}
        {saveDialogOpen && (
          <Box
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            role="dialog"
            aria-modal="true"
            aria-label="Save query"
            onClick={() => setSaveDialogOpen(false)}
          >
            <Card
              className="w-96 border-slate-600 bg-slate-800"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader>
                <Text variant="label" className="text-slate-200">
                  Save Query
                </Text>
              </CardHeader>
              <CardContent>
                <Input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Query name..."
                  className="mb-3"
                  autoFocus
                  aria-label="Query name"
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === "Enter") handleSave();
                    if (e.key === "Escape") setSaveDialogOpen(false);
                  }}
                />
                <Box className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSaveDialogOpen(false)}
                  >
                    <Text variant="caption">Cancel</Text>
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSave}
                    disabled={!saveName.trim()}
                  >
                    <Text variant="caption">Save</Text>
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        )}
      </Box>
    );
  },
);
