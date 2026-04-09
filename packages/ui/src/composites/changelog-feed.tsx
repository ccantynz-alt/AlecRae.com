"use client";

/**
 * ChangelogFeed — Timeline-style feed of changelog entries.
 *
 * Features:
 * - Version grouping (entries under same version)
 * - Category filter tabs
 * - "What's new" badge for entries since user's last visit
 * - RSS feed link
 * - Load more pagination
 */

import React, { forwardRef, useState, useMemo, useCallback, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";
import {
  ChangelogEntry,
  type ChangelogEntryData,
  type ChangelogCategory,
} from "./changelog-entry";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChangelogFeedProps extends HTMLAttributes<HTMLDivElement> {
  /** All changelog entries to display. */
  entries: readonly ChangelogEntryData[];
  /** ISO date string of user's last visit (entries after this get "new" badge). */
  lastVisitedAt?: string | null;
  /** URL for RSS feed. */
  rssFeedUrl?: string;
  /** Whether more entries are available to load. */
  hasMore?: boolean;
  /** Whether more entries are currently loading. */
  loadingMore?: boolean;
  /** Callback to load more entries. */
  onLoadMore?: () => void;
  /** Optional className for the root container. */
  className?: string;
}

// ─── Filter definitions ─────────────────────────────────────────────────────

interface FilterOption {
  id: ChangelogCategory | "all";
  label: string;
}

const FILTERS: readonly FilterOption[] = [
  { id: "all", label: "All" },
  { id: "feature", label: "Features" },
  { id: "improvement", label: "Improvements" },
  { id: "fix", label: "Fixes" },
  { id: "security", label: "Security" },
  { id: "breaking", label: "Breaking" },
] as const;

// ─── Version grouping ───────────────────────────────────────────────────────

interface VersionGroup {
  version: string;
  entries: ChangelogEntryData[];
  /** Earliest publishedAt in the group (for sorting). */
  latestDate: string | null;
}

function groupByVersion(entries: readonly ChangelogEntryData[]): VersionGroup[] {
  const groups = new Map<string, ChangelogEntryData[]>();

  for (const entry of entries) {
    const existing = groups.get(entry.version);
    if (existing) {
      existing.push(entry);
    } else {
      groups.set(entry.version, [entry]);
    }
  }

  const result: VersionGroup[] = [];
  for (const [version, groupEntries] of groups) {
    const latestDate = groupEntries.reduce<string | null>((latest, e) => {
      if (!e.publishedAt) return latest;
      if (!latest) return e.publishedAt;
      return e.publishedAt > latest ? e.publishedAt : latest;
    }, null);

    result.push({ version, entries: groupEntries, latestDate });
  }

  // Sort groups by latest date descending
  result.sort((a, b) => {
    if (!a.latestDate && !b.latestDate) return 0;
    if (!a.latestDate) return 1;
    if (!b.latestDate) return -1;
    return b.latestDate.localeCompare(a.latestDate);
  });

  return result;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const ChangelogFeed = forwardRef<HTMLDivElement, ChangelogFeedProps>(
  function ChangelogFeed(
    {
      entries,
      lastVisitedAt,
      rssFeedUrl,
      hasMore = false,
      loadingMore = false,
      onLoadMore,
      className = "",
      ...props
    },
    ref,
  ) {
    const [activeFilter, setActiveFilter] = useState<ChangelogCategory | "all">("all");

    const filteredEntries = useMemo(() => {
      if (activeFilter === "all") return entries;
      return entries.filter((e) => e.category === activeFilter);
    }, [entries, activeFilter]);

    const versionGroups = useMemo(
      () => groupByVersion(filteredEntries),
      [filteredEntries],
    );

    const isEntryNew = useCallback(
      (entry: ChangelogEntryData): boolean => {
        if (!lastVisitedAt || !entry.publishedAt) return false;
        return entry.publishedAt > lastVisitedAt;
      },
      [lastVisitedAt],
    );

    const newCount = useMemo(() => {
      if (!lastVisitedAt) return 0;
      return entries.filter((e) => e.publishedAt && e.publishedAt > lastVisitedAt).length;
    }, [entries, lastVisitedAt]);

    const handleFilterClick = useCallback((filterId: ChangelogCategory | "all") => {
      setActiveFilter(filterId);
    }, []);

    return (
      <Box ref={ref} className={className} {...props}>
        {/* Filter tabs + RSS link */}
        <Box className="flex flex-wrap items-center gap-2 mb-12">
          {FILTERS.map((f) => {
            const active = activeFilter === f.id;
            return (
              <Button
                key={f.id}
                variant="ghost"
                size="sm"
                onClick={() => handleFilterClick(f.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                  active
                    ? "bg-white/15 border-white/30 text-white"
                    : "bg-white/5 border-white/10 text-blue-100/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                {f.label}
              </Button>
            );
          })}

          {rssFeedUrl && (
            <Box className="ml-auto">
              <Box
                as="a"
                href={rssFeedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium bg-orange-500/10 text-orange-300 border border-orange-400/20 hover:bg-orange-500/20 transition-colors"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 11a9 9 0 0 1 9 9" />
                  <path d="M4 4a16 16 0 0 1 16 16" />
                  <circle cx="5" cy="19" r="1" />
                </svg>
                RSS
              </Box>
            </Box>
          )}
        </Box>

        {/* "What's new" banner */}
        {newCount > 0 && activeFilter === "all" && (
          <Box className="mb-8 flex items-center gap-3 px-4 py-3 rounded-xl bg-cyan-500/10 border border-cyan-400/20">
            <Box className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <Text variant="body-sm" className="text-cyan-300">
              {newCount} new {newCount === 1 ? "update" : "updates"} since your last visit
            </Text>
          </Box>
        )}

        {/* Empty state */}
        {versionGroups.length === 0 && (
          <Box className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center text-blue-100/50 text-sm">
            {activeFilter === "all"
              ? "No changelog entries yet."
              : `No ${activeFilter} entries found.`}
          </Box>
        )}

        {/* Timeline feed grouped by version */}
        <Box className="space-y-16">
          {versionGroups.map((group) => (
            <Box key={group.version} className="relative">
              {/* Version header with timeline dot */}
              <Box className="flex items-center gap-4 mb-6">
                <Box className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-400/20">
                  <Text variant="caption" className="font-mono text-xs text-cyan-300 font-bold">
                    {group.version}
                  </Text>
                </Box>
                <Box className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
              </Box>

              {/* Entries within this version */}
              <Box className="space-y-6 pl-5 border-l-2 border-white/5 ml-5">
                {group.entries.map((entry) => (
                  <Box key={entry.id} className="relative">
                    {/* Timeline connector dot */}
                    <Box className="absolute -left-[calc(1.25rem+5px)] top-8 w-2.5 h-2.5 rounded-full bg-white/20 border-2 border-slate-900" />
                    <ChangelogEntry
                      entry={entry}
                      isNew={isEntryNew(entry)}
                    />
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>

        {/* Load more */}
        {hasMore && (
          <Box className="flex justify-center mt-12">
            <Button
              variant="secondary"
              size="md"
              onClick={onLoadMore}
              disabled={loadingMore}
              loading={loadingMore}
              className="bg-white/5 border-white/10 text-blue-100/60 hover:bg-white/10 hover:text-white"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </Button>
          </Box>
        )}
      </Box>
    );
  },
);

ChangelogFeed.displayName = "ChangelogFeed";
