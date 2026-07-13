"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  semanticSearchApi,
  type AutoIndexerStats,
  type SemanticSearchHit,
  type SemanticSearchResult,
  type SimilarEmailsResult,
} from "../lib/api-semantic-search";

function formatHitDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Pure-vector (semantic) search + index management.
 *
 * Distinct from the AI/hybrid search section already on the page: this hits
 * the /v1/semantic route group (kNN over email embeddings), can find emails
 * similar to any hit, and exposes the background auto-indexer's health so the
 * user can see coverage and trigger a backfill.
 */
export function SemanticSearchSection(): React.ReactNode {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SemanticSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [similarOpenFor, setSimilarOpenFor] = useState<string | null>(null);

  const [stats, setStats] = useState<AutoIndexerStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillNote, setBackfillNote] = useState<string | null>(null);

  const queryRef = useRef(query);
  queryRef.current = query;

  const loadStats = useCallback(async (): Promise<void> => {
    try {
      const res = await semanticSearchApi.stats();
      setStats(res.data);
      setStatsError(null);
    } catch (err) {
      setStatsError(
        err instanceof Error ? err.message : "Couldn't load index status",
      );
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const performSearch = useCallback(async (): Promise<void> => {
    const q = queryRef.current.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    setSimilarOpenFor(null);
    try {
      const res = await semanticSearchApi.search(q, { limit: 20 });
      setResult(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Semantic search failed");
    } finally {
      setSearching(false);
    }
  }, []);

  const handleBackfill = useCallback(async (): Promise<void> => {
    setBackfilling(true);
    setBackfillNote(null);
    setError(null);
    try {
      const res = await semanticSearchApi.backfill();
      setBackfillNote(res.data.message);
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backfill failed");
    } finally {
      setBackfilling(false);
    }
  }, [loadStats]);

  const noIndexYet =
    stats !== null && stats.totalIndexed === 0 && stats.totalQueued === 0;

  return (
    <Card>
      <CardHeader>
        <Box className="flex flex-wrap items-start justify-between gap-3">
          <Box>
            <Text variant="heading-sm">Semantic search</Text>
            <Text variant="body-sm" muted>
              Find emails by meaning, not keywords — e.g. &ldquo;someone
              suggested we should reconsider the budget&rdquo;.
            </Text>
          </Box>
          <IndexStatusBadge
            stats={stats}
            error={statsError}
            backfilling={backfilling}
            onBackfill={() => void handleBackfill()}
          />
        </Box>
      </CardHeader>
      <CardContent>
        {error && (
          <Box
            className="mb-3 rounded border border-red-200 bg-red-50 p-2"
            role="alert"
          >
            <Text variant="body-sm" className="text-red-800">
              {error}
            </Text>
          </Box>
        )}

        {backfillNote && (
          <Box
            className="mb-3 rounded border border-border bg-surface-secondary p-2"
            aria-live="polite"
          >
            <Text variant="body-sm" muted>
              {backfillNote}
            </Text>
          </Box>
        )}

        {noIndexYet && (
          <Box className="mb-3 rounded-md border border-border bg-surface-secondary p-3">
            <Text variant="body-sm" muted>
              No emails are indexed for semantic search yet. Run a backfill to
              embed your mail, then meaning-based search lights up. New mail is
              indexed automatically in the background.
            </Text>
          </Box>
        )}

        <Box className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Box className="flex-1">
            <Input
              label="Semantic query"
              variant="text"
              placeholder="Describe what was said..."
              value={query}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setQuery(e.target.value)
              }
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") void performSearch();
              }}
            />
          </Box>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void performSearch()}
            disabled={searching || !query.trim()}
          >
            {searching ? "Searching..." : "Search by meaning"}
          </Button>
        </Box>

        {result && (
          <Box className="mt-5 space-y-3" aria-live="polite">
            <Text variant="caption" muted>
              {result.totalHits} match{result.totalHits !== 1 ? "es" : ""} in{" "}
              {result.processingTimeMs}ms &middot; {result.model}
            </Text>
            {result.results.length === 0 ? (
              <Box className="py-6 text-center">
                <Text variant="body-sm" muted>
                  No semantically similar emails found. Try rephrasing, or run a
                  backfill if your mail isn&rsquo;t indexed yet.
                </Text>
              </Box>
            ) : (
              result.results.map((hit) => (
                <SemanticHitCard
                  key={hit.emailId}
                  hit={hit}
                  similarOpen={similarOpenFor === hit.emailId}
                  onToggleSimilar={() =>
                    setSimilarOpenFor((cur) =>
                      cur === hit.emailId ? null : hit.emailId,
                    )
                  }
                />
              ))
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

SemanticSearchSection.displayName = "SemanticSearchSection";

// ─── Index status badge + backfill trigger ───────────────────────────────────

interface IndexStatusBadgeProps {
  stats: AutoIndexerStats | null;
  error: string | null;
  backfilling: boolean;
  onBackfill: () => void;
}

function IndexStatusBadge({
  stats,
  error,
  backfilling,
  onBackfill,
}: IndexStatusBadgeProps): React.ReactNode {
  return (
    <Box className="flex shrink-0 flex-col items-end gap-1">
      {error ? (
        <Text variant="caption" className="text-red-700" role="alert">
          Index status unavailable
        </Text>
      ) : stats === null ? (
        <Text variant="caption" muted>
          Checking index...
        </Text>
      ) : (
        <Text variant="caption" muted aria-live="polite">
          {stats.totalIndexed.toLocaleString()} indexed
          {stats.totalQueued > 0
            ? ` · ${stats.totalQueued.toLocaleString()} queued`
            : ""}
          {stats.totalFailed > 0
            ? ` · ${stats.totalFailed.toLocaleString()} failed`
            : ""}
        </Text>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={onBackfill}
        disabled={backfilling}
      >
        {backfilling ? "Backfilling..." : "Index my mail"}
      </Button>
    </Box>
  );
}

IndexStatusBadge.displayName = "IndexStatusBadge";

// ─── A single semantic hit + inline "similar emails" ─────────────────────────

interface SemanticHitCardProps {
  hit: SemanticSearchHit;
  similarOpen: boolean;
  onToggleSimilar: () => void;
}

function SemanticHitCard({
  hit,
  similarOpen,
  onToggleSimilar,
}: SemanticHitCardProps): React.ReactNode {
  return (
    <Box className="rounded-lg border border-border bg-surface p-3">
      <Box className="flex items-center justify-between gap-3">
        <Text variant="body-sm" className="font-semibold truncate">
          {hit.subject || "(no subject)"}
        </Text>
        <Box className="flex shrink-0 items-center gap-2">
          <Text variant="caption" muted>
            {Math.round(hit.score * 100)}% match
          </Text>
          <Text variant="caption" muted>
            {formatHitDate(hit.date)}
          </Text>
        </Box>
      </Box>
      <Text variant="caption" muted>
        {hit.from.name ? `${hit.from.name} <${hit.from.email}>` : hit.from.email}
      </Text>
      {hit.snippet && (
        <Text variant="body-sm" muted className="mt-1 line-clamp-2">
          {hit.snippet}
        </Text>
      )}
      <Box className="mt-2">
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={similarOpen}
          onClick={onToggleSimilar}
        >
          {similarOpen ? "Hide similar" : "Find similar emails"}
        </Button>
      </Box>
      {similarOpen && <SimilarEmailsInline emailId={hit.emailId} />}
    </Box>
  );
}

SemanticHitCard.displayName = "SemanticHitCard";

// ─── Inline "similar to this email" (POST /v1/semantic/similar/:id) ──────────

interface SimilarEmailsInlineProps {
  emailId: string;
}

function SimilarEmailsInline({
  emailId,
}: SimilarEmailsInlineProps): React.ReactNode {
  const [data, setData] = useState<SimilarEmailsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const res = await semanticSearchApi.similar(emailId, { limit: 5 });
        if (!cancelled) setData(res.data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Couldn't load similar emails",
          );
        }
      }
    };
    void load();
    return (): void => {
      cancelled = true;
    };
  }, [emailId]);

  return (
    <Box
      className="mt-2 rounded-md border border-border bg-surface-secondary p-3"
      aria-live="polite"
    >
      {error ? (
        <Text variant="caption" className="text-red-700" role="alert">
          {error}
        </Text>
      ) : data === null ? (
        <Text variant="caption" muted>
          Finding similar emails...
        </Text>
      ) : data.results.length === 0 ? (
        <Text variant="caption" muted>
          No similar emails found for this message.
        </Text>
      ) : (
        <Box className="space-y-2">
          {data.results.map((r) => (
            <Box key={r.emailId} className="flex items-baseline gap-2">
              <Text variant="caption" className="font-semibold shrink-0">
                {Math.round(r.score * 100)}%
              </Text>
              <Box className="min-w-0">
                <Text variant="caption" className="truncate">
                  {r.subject || "(no subject)"}
                </Text>
                <Text variant="caption" muted className="truncate">
                  {r.from.name
                    ? `${r.from.name} <${r.from.email}>`
                    : r.from.email}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

SimilarEmailsInline.displayName = "SimilarEmailsInline";
