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
  PageLayout,
} from "@alecrae/ui";
import { EmailQueryConsole } from "../../../components/EmailQueryConsole";
import { PlanGate } from "../../../components/plan-gate";
import { SemanticSearchSection } from "../../../components/semantic-search-section";
import { aiSearchApi, type AISearchResult } from "../../../lib/api-features";
import {
  searchIntelligenceApi,
  type SearchBookmark,
  type SearchHistoryEntry,
  type SearchSuggestion,
  type SearchType,
  type RelatedEmail,
  type TrendingTerm,
} from "../../../lib/api-search-intelligence";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const SEARCH_TYPE_LABELS: Record<SearchType, string> = {
  keyword: "Keyword",
  natural_language: "AI",
  semantic: "Semantic",
};

export default function SearchPage(): React.ReactNode {
  const [query, setQuery] = useState("");
  const [runNonce, setRunNonce] = useState(0);
  const [historyVersion, setHistoryVersion] = useState(0);

  const runQuery = useCallback((q: string): void => {
    setQuery(q);
    setRunNonce((n) => n + 1);
  }, []);

  const handleSearched = useCallback((): void => {
    setHistoryVersion((v) => v + 1);
  }, []);

  return (
    <PageLayout
      title="Search"
      description="Search your email in natural language, or query your inbox like a database."
    >
      <Box className="space-y-8">
        <AISearchSection
          query={query}
          onQueryChange={setQuery}
          runNonce={runNonce}
          onPickSuggestion={runQuery}
          onSearched={handleSearched}
        />

        <PlanGate feature="semantic_search" required="pro">
          <SemanticSearchSection />
        </PlanGate>

        <Box className="grid gap-6 lg:grid-cols-2">
          <SearchHistoryPanel refreshKey={historyVersion} onRun={runQuery} />
          <SearchBookmarksPanel currentQuery={query} onRun={runQuery} />
        </Box>

        <Box>
          <Text variant="heading-sm" className="mb-1">
            Query console
          </Text>
          <Text variant="body-sm" muted className="mb-4">
            Treat your inbox as a dataset — run natural language or SQL-like
            queries, save them, and export results.
          </Text>
          <EmailQueryConsole />
        </Box>
      </Box>
    </PageLayout>
  );
}

// ─── AI natural language search ──────────────────────────────────────────────

interface AISearchSectionProps {
  query: string;
  onQueryChange: (q: string) => void;
  /** Incremented by the parent to request an immediate search of `query`. */
  runNonce: number;
  onPickSuggestion: (q: string) => void;
  /** Called after a search completes so sibling panels (history) can refresh. */
  onSearched: () => void;
}

function AISearchSection({
  query,
  onQueryChange,
  runNonce,
  onPickSuggestion,
  onSearched,
}: AISearchSectionProps): React.ReactNode {
  const [result, setResult] = useState<AISearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relatedOpenFor, setRelatedOpenFor] = useState<string | null>(null);

  const queryRef = useRef(query);
  queryRef.current = query;

  const performSearch = useCallback(async (): Promise<void> => {
    const q = queryRef.current.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    setRelatedOpenFor(null);
    try {
      const res = await aiSearchApi.search(q);
      setResult(res.data);
      onSearched();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [onSearched]);

  useEffect(() => {
    if (runNonce > 0) {
      void performSearch();
    }
  }, [runNonce, performSearch]);

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">AI search</Text>
        <Text variant="body-sm" muted>
          Ask in plain English — e.g. &ldquo;the PDF Sarah sent about the Q3
          budget last month&rdquo;.
        </Text>
      </CardHeader>
      <CardContent>
        {error && (
          <Box className="mb-3 rounded border border-red-200 bg-red-50 p-2" role="alert">
            <Text variant="body-sm" className="text-red-800">
              {error}
            </Text>
          </Box>
        )}
        <Box className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Box className="flex-1">
            <Input
              label="Search query"
              variant="text"
              placeholder="Find emails about..."
              value={query}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onQueryChange(e.target.value)
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
            {searching ? "Searching..." : "Search"}
          </Button>
        </Box>

        <SuggestionChips onPick={onPickSuggestion} />

        {result && (
          <Box className="mt-5 space-y-3" aria-live="polite">
            <Text variant="caption" muted>
              {result.totalHits} result{result.totalHits !== 1 ? "s" : ""} in{" "}
              {result.processingTimeMs}ms
            </Text>
            {result.message && (
              <Box className="rounded-md border border-border bg-surface-secondary p-3">
                <Text variant="body-sm" muted>
                  {result.message}
                </Text>
              </Box>
            )}
            {result.results.length === 0 && !result.message ? (
              <Box className="py-6 text-center">
                <Text variant="body-sm" muted>
                  No matching emails found.
                </Text>
              </Box>
            ) : (
              result.results.map((hit) => (
                <Box
                  key={hit.id}
                  className="rounded-lg border border-border bg-surface p-3"
                >
                  <Box className="flex items-center justify-between gap-3">
                    <Text variant="body-sm" className="font-semibold truncate">
                      {hit.subject || "(no subject)"}
                    </Text>
                    <Text variant="caption" muted className="shrink-0">
                      {formatDate(hit.date)}
                    </Text>
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
                      aria-expanded={relatedOpenFor === hit.id}
                      onClick={() =>
                        setRelatedOpenFor((cur) =>
                          cur === hit.id ? null : hit.id,
                        )
                      }
                    >
                      {relatedOpenFor === hit.id
                        ? "Hide related"
                        : "Find related emails"}
                    </Button>
                  </Box>
                  {relatedOpenFor === hit.id && (
                    <RelatedEmailsInline emailId={hit.id} />
                  )}
                </Box>
              ))
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

AISearchSection.displayName = "AISearchSection";

// ─── Suggestions + trending chips ────────────────────────────────────────────

// Known backend placeholder payloads (issue #29) — used only to show a
// friendly note; whatever the API returns is still rendered as-is.
const PLACEHOLDER_TRENDING_TERMS = ["invoice", "meeting notes", "quarterly report"];
const PLACEHOLDER_SUGGESTION_TEXTS = [
  "unread from last week",
  "emails with attachments",
];

function isPlaceholderTrending(terms: TrendingTerm[]): boolean {
  return (
    terms.length === PLACEHOLDER_TRENDING_TERMS.length &&
    terms.every((t, i) => t.term === PLACEHOLDER_TRENDING_TERMS[i])
  );
}

function isPlaceholderSuggestions(items: SearchSuggestion[]): boolean {
  return (
    items.length > 0 &&
    items.every((s) => PLACEHOLDER_SUGGESTION_TEXTS.includes(s.suggestion))
  );
}

const TREND_ARROWS: Record<TrendingTerm["trend"], string> = {
  up: "↑",
  down: "↓",
  stable: "→",
};

interface SuggestionChipsProps {
  onPick: (q: string) => void;
}

function SuggestionChips({ onPick }: SuggestionChipsProps): React.ReactNode {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [trending, setTrending] = useState<TrendingTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedNote, setGeneratedNote] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      const [sugRes, trendRes] = await Promise.allSettled([
        searchIntelligenceApi.listSuggestions({ limit: 8 }),
        searchIntelligenceApi.trending(),
      ]);
      if (cancelled) return;
      if (sugRes.status === "fulfilled") setSuggestions(sugRes.value.data);
      if (trendRes.status === "fulfilled") setTrending(trendRes.value.data);
      if (sugRes.status === "rejected" && trendRes.status === "rejected") {
        setError("Couldn't load search suggestions.");
      }
      setLoading(false);
    };
    void load();
    return (): void => {
      cancelled = true;
    };
  }, []);

  const handleGenerate = async (): Promise<void> => {
    setGenerating(true);
    setError(null);
    try {
      const res = await searchIntelligenceApi.generateSuggestions();
      setSuggestions(res.data);
      setGeneratedNote(isPlaceholderSuggestions(res.data));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't generate suggestions",
      );
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <Box className="mt-4">
        <Text variant="caption" muted>
          Loading suggestions...
        </Text>
      </Box>
    );
  }

  const showTrendingNote = isPlaceholderTrending(trending);

  return (
    <Box className="mt-4 space-y-3">
      {error && (
        <Text variant="caption" className="text-red-700" role="alert">
          {error}
        </Text>
      )}

      <Box className="flex flex-wrap items-center gap-2">
        <Text variant="caption" muted className="shrink-0">
          Suggestions:
        </Text>
        {suggestions.length === 0 ? (
          <Text variant="caption" muted>
            None yet — search a few times or generate some.
          </Text>
        ) : (
          suggestions.map((s) => (
            <Button
              key={s.id}
              variant="outline"
              size="sm"
              onClick={() => onPick(s.suggestion)}
              title={s.reason ?? undefined}
              aria-label={`Search for ${s.suggestion}`}
            >
              {s.suggestion}
            </Button>
          ))
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleGenerate()}
          disabled={generating}
        >
          {generating ? "Generating..." : "Generate AI suggestions"}
        </Button>
      </Box>
      {generatedNote && (
        <Text variant="caption" muted>
          These starter suggestions are illustrative — personalized AI
          suggestions arrive as your search history grows.
        </Text>
      )}

      {trending.length > 0 && (
        <Box className="flex flex-wrap items-center gap-2">
          <Text variant="caption" muted className="shrink-0">
            Trending:
          </Text>
          {trending.map((t) => (
            <Button
              key={t.term}
              variant="outline"
              size="sm"
              onClick={() => onPick(t.term)}
              aria-label={`Search trending term ${t.term}, ${t.count} searches, trend ${t.trend}`}
            >
              {t.term}{" "}
              <span aria-hidden="true">
                {TREND_ARROWS[t.trend]} {t.count}
              </span>
            </Button>
          ))}
          {showTrendingNote && (
            <Text variant="caption" muted>
              Sample terms — trending analytics come online as your team
              searches.
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}

SuggestionChips.displayName = "SuggestionChips";

// ─── Related emails (per search result) ──────────────────────────────────────

interface RelatedEmailsInlineProps {
  emailId: string;
}

function RelatedEmailsInline({
  emailId,
}: RelatedEmailsInlineProps): React.ReactNode {
  const [related, setRelated] = useState<RelatedEmail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const res = await searchIntelligenceApi.relatedEmails(emailId);
        if (!cancelled) setRelated(res.data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Couldn't load related emails",
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
      ) : related === null ? (
        <Text variant="caption" muted>
          Finding related emails...
        </Text>
      ) : related.length === 0 ? (
        <Text variant="caption" muted>
          No related emails yet — AI similarity search lights up once your
          mail is indexed for embeddings.
        </Text>
      ) : (
        <Box className="space-y-2">
          {related.map((r) => (
            <Box key={r.emailId} className="flex items-baseline gap-2">
              <Text variant="caption" className="font-semibold shrink-0">
                {Math.round(r.similarity * 100)}%
              </Text>
              <Text variant="caption" muted>
                {r.reason || r.emailId}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

RelatedEmailsInline.displayName = "RelatedEmailsInline";

// ─── Search history panel ────────────────────────────────────────────────────

interface SearchHistoryPanelProps {
  /** Bumped by the parent when a new search runs, to refresh the list. */
  refreshKey: number;
  onRun: (q: string) => void;
}

function SearchHistoryPanel({
  refreshKey,
  onRun,
}: SearchHistoryPanelProps): React.ReactNode {
  const [entries, setEntries] = useState<SearchHistoryEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const res = await searchIntelligenceApi.listHistory({ limit: 10 });
        if (!cancelled) {
          setEntries(res.data);
          setCursor(res.hasMore ? res.cursor : null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Couldn't load search history",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return (): void => {
      cancelled = true;
    };
  }, [refreshKey]);

  const handleLoadMore = async (): Promise<void> => {
    if (!cursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await searchIntelligenceApi.listHistory({
        limit: 10,
        cursor,
      });
      setEntries((prev) => [...prev, ...res.data]);
      setCursor(res.hasMore ? res.cursor : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load more");
    } finally {
      setLoadingMore(false);
    }
  };

  const handleClear = async (): Promise<void> => {
    setClearing(true);
    setError(null);
    try {
      await searchIntelligenceApi.clearHistory();
      setEntries([]);
      setCursor(null);
      setConfirmClear(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't clear search history",
      );
    } finally {
      setClearing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between gap-3">
          <Box>
            <Text variant="heading-sm">Recent searches</Text>
            <Text variant="body-sm" muted>
              Re-run anything you&rsquo;ve searched before.
            </Text>
          </Box>
          {entries.length > 0 &&
            (confirmClear ? (
              <Box className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleClear()}
                  disabled={clearing}
                >
                  {clearing ? "Clearing..." : "Confirm clear"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmClear(false)}
                  disabled={clearing}
                >
                  Cancel
                </Button>
              </Box>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmClear(true)}
              >
                Clear history
              </Button>
            ))}
        </Box>
      </CardHeader>
      <CardContent>
        {error && (
          <Box className="mb-3 rounded border border-red-200 bg-red-50 p-2" role="alert">
            <Text variant="body-sm" className="text-red-800">
              {error}
            </Text>
          </Box>
        )}
        {loading ? (
          <Text variant="body-sm" muted>
            Loading history...
          </Text>
        ) : entries.length === 0 ? (
          <Box className="py-6 text-center">
            <Text variant="body-sm" muted>
              No searches yet. Your recent searches will appear here.
            </Text>
          </Box>
        ) : (
          <Box className="space-y-2">
            {entries.map((entry) => (
              <Box
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"
              >
                <Box className="min-w-0">
                  <Text variant="body-sm" className="font-medium truncate">
                    {entry.query}
                  </Text>
                  <Text variant="caption" muted>
                    {SEARCH_TYPE_LABELS[entry.searchType]} &middot;{" "}
                    {entry.resultCount} result
                    {entry.resultCount !== 1 ? "s" : ""} &middot;{" "}
                    {formatDateTime(entry.createdAt)}
                  </Text>
                </Box>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onRun(entry.query)}
                  aria-label={`Run search: ${entry.query}`}
                >
                  Run
                </Button>
              </Box>
            ))}
            {cursor && (
              <Box className="pt-1 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleLoadMore()}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </Button>
              </Box>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

SearchHistoryPanel.displayName = "SearchHistoryPanel";

// ─── Saved searches (bookmarks) panel ────────────────────────────────────────

interface SearchBookmarksPanelProps {
  currentQuery: string;
  onRun: (q: string) => void;
}

function SearchBookmarksPanel({
  currentQuery,
  onRun,
}: SearchBookmarksPanelProps): React.ReactNode {
  const [bookmarks, setBookmarks] = useState<SearchBookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [checkResults, setCheckResults] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const res = await searchIntelligenceApi.listBookmarks({ limit: 50 });
        if (!cancelled) setBookmarks(res.data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Couldn't load saved searches",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return (): void => {
      cancelled = true;
    };
  }, []);

  const openSaveForm = (): void => {
    setSaveName(currentQuery.trim());
    setSaveOpen(true);
  };

  const handleSave = async (): Promise<void> => {
    const name = saveName.trim();
    const query = currentQuery.trim();
    if (!name || !query) return;
    setSaving(true);
    setError(null);
    try {
      const res = await searchIntelligenceApi.createBookmark({
        name,
        query,
        searchType: "natural_language",
      });
      setBookmarks((prev) => [res.data, ...prev]);
      setSaveOpen(false);
      setSaveName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save search");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    setBusyId(id);
    setError(null);
    try {
      await searchIntelligenceApi.deleteBookmark(id);
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete bookmark");
    } finally {
      setBusyId(null);
    }
  };

  const handleCheck = async (id: string): Promise<void> => {
    setBusyId(id);
    setError(null);
    try {
      const res = await searchIntelligenceApi.checkBookmark(id);
      setCheckResults((prev) => ({ ...prev, [id]: res.data.newResults }));
      setBookmarks((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                lastCheckedAt: res.data.lastCheckedAt,
                newResultsSinceLastCheck: res.data.newResults,
              }
            : b,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't check for new results",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <Box className="flex items-center justify-between gap-3">
          <Box>
            <Text variant="heading-sm">Saved searches</Text>
            <Text variant="body-sm" muted>
              Bookmark searches you run often.
            </Text>
          </Box>
          {!saveOpen && (
            <Button
              variant="secondary"
              size="sm"
              onClick={openSaveForm}
              disabled={!currentQuery.trim()}
              title={
                currentQuery.trim()
                  ? undefined
                  : "Type a search query above first"
              }
            >
              Save current search
            </Button>
          )}
        </Box>
      </CardHeader>
      <CardContent>
        {error && (
          <Box className="mb-3 rounded border border-red-200 bg-red-50 p-2" role="alert">
            <Text variant="body-sm" className="text-red-800">
              {error}
            </Text>
          </Box>
        )}

        {saveOpen && (
          <Box className="mb-4 rounded-lg border border-border bg-surface-secondary p-3">
            <Box className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Box className="flex-1">
                <Input
                  label="Bookmark name"
                  variant="text"
                  placeholder="Name this search"
                  value={saveName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSaveName(e.target.value)
                  }
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === "Enter") void handleSave();
                    if (e.key === "Escape") setSaveOpen(false);
                  }}
                />
              </Box>
              <Box className="flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={saving || !saveName.trim() || !currentQuery.trim()}
                >
                  {saving ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSaveOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </Box>
            </Box>
            <Text variant="caption" muted className="mt-2 block">
              Saves the current query: &ldquo;{currentQuery.trim()}&rdquo;
            </Text>
          </Box>
        )}

        {loading ? (
          <Text variant="body-sm" muted>
            Loading saved searches...
          </Text>
        ) : bookmarks.length === 0 ? (
          <Box className="py-6 text-center">
            <Text variant="body-sm" muted>
              No saved searches yet. Run a search and save it to keep it handy.
            </Text>
          </Box>
        ) : (
          <Box className="space-y-2">
            {bookmarks.map((bookmark) => {
              const checked = checkResults[bookmark.id];
              return (
                <Box
                  key={bookmark.id}
                  className="rounded-lg border border-border bg-surface p-3"
                >
                  <Box className="flex items-center justify-between gap-3">
                    <Box className="min-w-0">
                      <Text variant="body-sm" className="font-medium truncate">
                        {bookmark.name}
                      </Text>
                      <Text variant="caption" muted className="truncate">
                        {SEARCH_TYPE_LABELS[bookmark.searchType]} &middot;{" "}
                        {bookmark.query}
                      </Text>
                    </Box>
                    <Box className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onRun(bookmark.query)}
                        aria-label={`Run saved search: ${bookmark.name}`}
                      >
                        Run
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleCheck(bookmark.id)}
                        disabled={busyId === bookmark.id}
                        aria-label={`Check ${bookmark.name} for new results`}
                      >
                        Check
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDelete(bookmark.id)}
                        disabled={busyId === bookmark.id}
                        aria-label={`Delete saved search: ${bookmark.name}`}
                      >
                        Delete
                      </Button>
                    </Box>
                  </Box>
                  {checked !== undefined && (
                    <Text variant="caption" muted className="mt-1 block" aria-live="polite">
                      {checked === 0
                        ? "No new results since last check."
                        : `${checked} new result${checked !== 1 ? "s" : ""} since last check.`}
                    </Text>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

SearchBookmarksPanel.displayName = "SearchBookmarksPanel";
