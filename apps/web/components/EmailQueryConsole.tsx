"use client";

/**
 * EmailQueryConsole — Container component for B2 (Email-as-Database).
 *
 * Full-page query console that wires the QueryConsole UI composite to
 * the /v1/query/* API endpoints. Handles state management, API calls,
 * keyboard shortcuts, and CSV export.
 *
 * Usage:
 *   <EmailQueryConsole />
 */

import type { ReactElement } from "react";
import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  QueryConsole,
  type QueryMode,
  type QueryState,
  type ConsolePanelView,
  type QueryResultData,
  type QueryExplanationData,
  type QueryHistoryEntry,
  type SavedQueryEntry,
} from "@emailed/ui";
import {
  emailQueryApi,
} from "../lib/api";
import {
  fadeInUp,
  SPRING_BOUNCY,
  useViennaReducedMotion,
  withReducedMotion,
} from "../lib/animations";

// ─── Component ─────────────────────────────────────────────────────────────

export function EmailQueryConsole(): ReactElement {
  const [queryText, setQueryText] = useState("");
  const [mode, setMode] = useState<QueryMode>("natural");
  const [state, setState] = useState<QueryState>("idle");
  const [result, setResult] = useState<QueryResultData | null>(null);
  const [explanation, setExplanation] = useState<QueryExplanationData | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [history, setHistory] = useState<readonly QueryHistoryEntry[]>([]);
  const [savedQueries, setSavedQueries] = useState<readonly SavedQueryEntry[]>(
    [],
  );
  const [panelView, setPanelView] = useState<ConsolePanelView>("history");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const prefersReducedMotion = useViennaReducedMotion();

  // ── Load history and saved queries on mount ─────────────────────────
  useEffect(() => {
    emailQueryApi.getHistory().then((res) => {
      setHistory(res.data.entries);
    }).catch(() => {
      // Non-critical — history may fail if not yet set up
    });

    emailQueryApi.getSavedQueries().then((res) => {
      setSavedQueries(res.data.queries);
    }).catch(() => {
      // Non-critical
    });
  }, []);

  // ── Execute query ───────────────────────────────────────────────────
  const handleExecute = useCallback(async () => {
    if (!queryText.trim()) return;

    setState("running");
    setErrorMessage("");
    setExplanation(null);

    try {
      const res = await emailQueryApi.execute({
        query: queryText,
        queryType: mode,
      });

      setResult({
        columns: res.data.columns,
        rows: res.data.rows,
        rowCount: res.data.rowCount,
        executionTimeMs: res.data.executionTimeMs,
        originalQuery: queryText,
      });
      setState("success");

      // Refresh history
      emailQueryApi.getHistory().then((histRes) => {
        setHistory(histRes.data.entries);
      }).catch(() => {
        // silent
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Query execution failed",
      );
      setState("error");
    }
  }, [queryText, mode]);

  // ── Explain query ───────────────────────────────────────────────────
  const handleExplain = useCallback(async () => {
    if (!queryText.trim()) return;

    setState("explaining");
    setErrorMessage("");

    try {
      const res = await emailQueryApi.explain({
        query: queryText,
        queryType: mode,
      });

      setExplanation({
        description: res.data.description,
        estimatedScope: res.data.estimatedScope,
        warnings: res.data.warnings,
      });
      setState("success");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to explain query",
      );
      setState("error");
    }
  }, [queryText, mode]);

  // ── Export CSV ──────────────────────────────────────────────────────
  const handleExportCsv = useCallback(async () => {
    if (!queryText.trim()) return;

    try {
      const res = await emailQueryApi.execute({
        query: queryText,
        queryType: mode,
        format: "csv",
      });

      // Create a download link for the CSV data
      const csvContent = typeof res === "string" ? res : JSON.stringify(res);
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "query-results.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // Fall back to client-side CSV generation from current result
      if (result) {
        const headers = result.columns.join(",");
        const rows = result.rows.map((row) =>
          result.columns
            .map((col) => {
              const val = row[col];
              if (val === null || val === undefined) return "";
              const str = String(val);
              if (str.includes(",") || str.includes('"') || str.includes("\n")) {
                return `"${str.replace(/"/g, '""')}"`;
              }
              return str;
            })
            .join(","),
        );
        const csv = [headers, ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "query-results.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    }
  }, [queryText, mode, result]);

  // ── History select ─────────────────────────────────────────────────
  const handleHistorySelect = useCallback((entry: QueryHistoryEntry) => {
    setQueryText(entry.queryText);
    setMode(entry.queryType);
  }, []);

  // ── Saved query select ─────────────────────────────────────────────
  const handleSavedQuerySelect = useCallback((entry: SavedQueryEntry) => {
    setQueryText(entry.queryText);
    setMode(entry.queryType);
  }, []);

  // ── Save query ─────────────────────────────────────────────────────
  const handleSaveQuery = useCallback(
    async (name: string) => {
      try {
        await emailQueryApi.saveQuery({
          name,
          queryText,
          queryType: mode,
        });

        // Refresh saved queries
        const res = await emailQueryApi.getSavedQueries();
        setSavedQueries(res.data.queries);
      } catch {
        // Could show a toast here
      }
    },
    [queryText, mode],
  );

  // ── Delete saved query ─────────────────────────────────────────────
  const handleDeleteSavedQuery = useCallback(async (id: string) => {
    try {
      await emailQueryApi.deleteSavedQuery(id);

      // Refresh saved queries
      const res = await emailQueryApi.getSavedQueries();
      setSavedQueries(res.data.queries);
    } catch {
      // Could show a toast here
    }
  }, []);

  // ── Sort handler ───────────────────────────────────────────────────
  const handleSortChange = useCallback(
    (column: string) => {
      if (sortColumn === column) {
        setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(column);
        setSortDirection("asc");
      }

      // Sort result rows client-side
      if (result) {
        const sorted = [...result.rows].sort((a, b) => {
          const aVal = a[column];
          const bVal = b[column];
          if (aVal === bVal) return 0;
          if (aVal === null || aVal === undefined) return 1;
          if (bVal === null || bVal === undefined) return -1;

          const dir = sortColumn === column && sortDirection === "asc" ? -1 : 1;

          if (typeof aVal === "number" && typeof bVal === "number") {
            return (aVal - bVal) * dir;
          }
          return String(aVal).localeCompare(String(bVal)) * dir;
        });

        setResult({
          ...result,
          rows: sorted,
        });
      }
    },
    [sortColumn, sortDirection, result],
  );

  const motionProps = withReducedMotion(fadeInUp, prefersReducedMotion);

  return (
    <motion.div
      className="flex h-full flex-col"
      {...motionProps}
      transition={SPRING_BOUNCY}
    >
      <QueryConsole
        state={state}
        queryText={queryText}
        mode={mode}
        result={result}
        explanation={explanation}
        errorMessage={errorMessage}
        history={history}
        savedQueries={savedQueries}
        panelView={panelView}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onQueryChange={setQueryText}
        onModeChange={setMode}
        onExecute={handleExecute}
        onExplain={handleExplain}
        onExportCsv={handleExportCsv}
        onHistorySelect={handleHistorySelect}
        onSavedQuerySelect={handleSavedQuerySelect}
        onSaveQuery={handleSaveQuery}
        onDeleteSavedQuery={handleDeleteSavedQuery}
        onPanelViewChange={setPanelView}
        onSortChange={handleSortChange}
        className="flex-1"
      />
    </motion.div>
  );
}
