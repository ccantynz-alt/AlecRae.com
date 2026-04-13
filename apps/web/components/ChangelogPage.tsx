"use client";

/**
 * ChangelogPage — Full changelog page for the AlecRae web app.
 *
 * Fetches changelog entries from the API and renders them in a
 * timeline-style feed using the ChangelogFeed composite component.
 *
 * Features:
 * - Fetches from /v1/changelog with pagination
 * - Tracks user's last visit in localStorage for "what's new" badges
 * - SEO meta tags (via parent layout or head)
 * - Category filtering
 * - Load more pagination
 */

import type { ReactElement } from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, ChangelogFeed, type ChangelogEntryData, type ChangelogCategory } from "@alecrae/ui";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChangelogApiEntry {
  id: string;
  version: string;
  title: string;
  content: string;
  category: ChangelogCategory;
  publishedAt: string | null;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

interface ChangelogApiResponse {
  data: {
    entries: ChangelogApiEntry[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  };
}

type LoadState = "idle" | "loading" | "loaded" | "error";

// ─── Constants ──────────────────────────────────────────────────────────────

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "https://api.alecrae.com";
const LAST_VISIT_KEY = "alecrae_changelog_last_visit";
const PAGE_SIZE = 20;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getLastVisitedAt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LAST_VISIT_KEY);
  } catch {
    return null;
  }
}

function setLastVisitedAt(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
  } catch {
    // silently ignore — not critical
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export interface ChangelogPageProps {
  /** Optional className for the root container. */
  className?: string;
}

export function ChangelogPage({ className = "" }: ChangelogPageProps): ReactElement {
  const [entries, setEntries] = useState<ChangelogEntryData[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [lastVisitedAt, setLastVisitedAtState] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const initialLoadDone = useRef(false);

  // Read last visit from localStorage on mount
  useEffect(() => {
    setLastVisitedAtState(getLastVisitedAt());
  }, []);

  // Fetch entries
  const fetchEntries = useCallback(
    async (pageNum: number, append: boolean): Promise<void> => {
      try {
        const url = new URL(`${API_BASE}/v1/changelog`);
        url.searchParams.set("page", String(pageNum));
        url.searchParams.set("limit", String(PAGE_SIZE));

        const response = await fetch(url.toString(), {
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          throw new Error(`API returned ${String(response.status)}`);
        }

        const json = (await response.json()) as ChangelogApiResponse;
        const newEntries: ChangelogEntryData[] = json.data.entries.map((e) => ({
          id: e.id,
          version: e.version,
          title: e.title,
          content: e.content,
          category: e.category,
          publishedAt: e.publishedAt,
          authorName: e.authorName,
        }));

        if (append) {
          setEntries((prev) => [...prev, ...newEntries]);
        } else {
          setEntries(newEntries);
        }

        setHasMore(json.data.pagination.hasMore);
        setPage(pageNum);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load changelog";
        setErrorMessage(message);
        throw err;
      }
    },
    [],
  );

  // Initial load
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    setLoadState("loading");
    fetchEntries(1, false)
      .then(() => {
        setLoadState("loaded");
        // Update last visited timestamp after successful load
        setLastVisitedAt();
      })
      .catch(() => {
        setLoadState("error");
      });
  }, [fetchEntries]);

  // Load more handler
  const handleLoadMore = useCallback((): void => {
    if (loadingMore) return;
    setLoadingMore(true);
    fetchEntries(page + 1, true)
      .then(() => {
        setLoadingMore(false);
      })
      .catch(() => {
        setLoadingMore(false);
      });
  }, [fetchEntries, page, loadingMore]);

  return (
    <Box className={`min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white ${className}`}>
      {/* Background decorations */}
      <Box className="fixed inset-0 overflow-hidden pointer-events-none">
        <Box className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
        <Box className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
      </Box>

      <Box className="relative z-10 max-w-4xl mx-auto px-6 py-16">
        {/* Header */}
        <Box as="header" className="mb-12">
          <Box className="flex items-center gap-3 mb-4">
            <Text variant="heading-lg" className="font-bold tracking-tight bg-gradient-to-r from-white via-blue-200 to-cyan-300 bg-clip-text text-transparent">
              AlecRae
            </Text>
            <Text variant="caption" className="text-sm uppercase tracking-wider text-blue-200/60">
              Changelog
            </Text>
          </Box>
          <Text variant="display-sm" className="text-4xl md:text-5xl font-bold tracking-tighter mb-3 text-white">
            Every release.
          </Text>
          <Text variant="body-md" className="text-blue-100/60 max-w-2xl">
            New features, improvements, fixes, and breaking changes — every time we ship.
          </Text>
        </Box>

        {/* Loading state */}
        {loadState === "loading" && (
          <Box className="space-y-8">
            {[1, 2, 3].map((i) => (
              <Box
                key={i}
                className="rounded-2xl bg-white/5 border border-white/10 p-8 animate-pulse"
              >
                <Box className="flex gap-3 mb-4">
                  <Box className="w-16 h-6 bg-white/10 rounded-md" />
                  <Box className="w-24 h-6 bg-white/10 rounded-md" />
                </Box>
                <Box className="w-3/4 h-6 bg-white/10 rounded-md mb-3" />
                <Box className="w-full h-4 bg-white/5 rounded-md mb-2" />
                <Box className="w-2/3 h-4 bg-white/5 rounded-md" />
              </Box>
            ))}
          </Box>
        )}

        {/* Error state */}
        {loadState === "error" && (
          <Box className="rounded-2xl bg-red-500/10 border border-red-400/20 p-8 text-center">
            <Text variant="body-md" className="text-red-300 mb-2">
              Failed to load changelog
            </Text>
            <Text variant="body-sm" className="text-red-300/60">
              {errorMessage ?? "An unexpected error occurred. Please try again later."}
            </Text>
          </Box>
        )}

        {/* Feed */}
        {loadState === "loaded" && (
          <ChangelogFeed
            entries={entries}
            lastVisitedAt={lastVisitedAt}
            rssFeedUrl={`${API_BASE}/v1/changelog?format=rss`}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMore}
          />
        )}

        {/* Footer */}
        <Box as="footer" className="text-center text-xs text-blue-200/40 pt-16 mt-16 border-t border-white/5">
          2026 AlecRae - changelog.alecrae.com
        </Box>
      </Box>
    </Box>
  );
}
