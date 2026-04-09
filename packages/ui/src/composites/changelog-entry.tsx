"use client";

/**
 * ChangelogEntry — Single changelog entry card with version badge, date,
 * category tag (color-coded), title, and markdown-rendered content.
 *
 * Uses a lightweight regex-based markdown renderer (no heavy dependencies).
 */

import React, { forwardRef, useMemo, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Card } from "../primitives/card";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ChangelogCategory =
  | "feature"
  | "improvement"
  | "fix"
  | "security"
  | "breaking";

export interface ChangelogEntryData {
  /** Unique identifier. */
  id: string;
  /** Semver version string. */
  version: string;
  /** Entry title. */
  title: string;
  /** Raw markdown content. */
  content: string;
  /** Category tag. */
  category: ChangelogCategory;
  /** ISO date string when published. */
  publishedAt: string | null;
  /** Display name of the author. */
  authorName: string;
}

export interface ChangelogEntryProps extends HTMLAttributes<HTMLDivElement> {
  /** The changelog entry data. */
  entry: ChangelogEntryData;
  /** Whether this entry is "new" since user's last visit. */
  isNew?: boolean;
  /** Optional className for the root container. */
  className?: string;
}

// ─── Category styles ────────────────────────────────────────────────────────

const CATEGORY_STYLES: Readonly<Record<ChangelogCategory, { bg: string; text: string; border: string; label: string }>> = {
  feature: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-300",
    border: "border-emerald-400/30",
    label: "Feature",
  },
  improvement: {
    bg: "bg-blue-500/15",
    text: "text-blue-300",
    border: "border-blue-400/30",
    label: "Improvement",
  },
  fix: {
    bg: "bg-orange-500/15",
    text: "text-orange-300",
    border: "border-orange-400/30",
    label: "Fix",
  },
  security: {
    bg: "bg-red-500/15",
    text: "text-red-300",
    border: "border-red-400/30",
    label: "Security",
  },
  breaking: {
    bg: "bg-purple-500/15",
    text: "text-purple-300",
    border: "border-purple-400/30",
    label: "Breaking",
  },
};

// ─── Lightweight markdown renderer ──────────────────────────────────────────

function renderMarkdown(md: string): string {
  let html = md;

  // Escape HTML entities first (prevent XSS)
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Headings (### h3, ## h2, # h1) — must come before inline patterns
  html = html.replace(
    /^### (.+)$/gm,
    '<h3 class="text-lg font-semibold mt-6 mb-2">$1</h3>',
  );
  html = html.replace(
    /^## (.+)$/gm,
    '<h2 class="text-xl font-semibold mt-8 mb-3">$1</h2>',
  );
  html = html.replace(
    /^# (.+)$/gm,
    '<h1 class="text-2xl font-bold mt-8 mb-4">$1</h1>',
  );

  // Code blocks (``` ... ```)
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    '<pre class="bg-white/5 rounded-lg p-4 overflow-x-auto my-4"><code class="text-sm text-cyan-200">$2</code></pre>',
  );

  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="bg-white/10 px-1.5 py-0.5 rounded text-sm text-cyan-200">$1</code>',
  );

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="text-cyan-300 hover:text-cyan-200 underline underline-offset-2" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  // Horizontal rules
  html = html.replace(
    /^---$/gm,
    '<hr class="border-white/10 my-6" />',
  );

  // Unordered list items
  html = html.replace(
    /^- (.+)$/gm,
    '<li class="ml-4 pl-2 list-disc text-blue-100/80">$1</li>',
  );

  // Wrap consecutive list items in <ul>
  html = html.replace(
    /(<li[\s\S]*?<\/li>\n?)+/g,
    (match) => `<ul class="space-y-1 my-3">${match}</ul>`,
  );

  // Paragraphs: non-empty lines not already wrapped in HTML tags
  html = html.replace(
    /^(?!<[a-z/])((?!^\s*$).+)$/gm,
    '<p class="text-blue-100/70 leading-relaxed my-2">$1</p>',
  );

  // Clean up extra blank lines
  html = html.replace(/\n{3,}/g, "\n\n");

  return html;
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ─── Component ──────────────────────────────────────────────────────────────

export const ChangelogEntry = forwardRef<HTMLDivElement, ChangelogEntryProps>(
  function ChangelogEntry({ entry, isNew = false, className = "", ...props }, ref) {
    const categoryStyle = CATEGORY_STYLES[entry.category];
    const renderedContent = useMemo(
      () => renderMarkdown(entry.content),
      [entry.content],
    );

    return (
      <Card
        ref={ref}
        padding="lg"
        className={`bg-white/5 border-white/10 backdrop-blur-sm relative ${className}`}
        {...props}
      >
        {isNew && (
          <Box className="absolute -top-2 -right-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/30">
            <Box className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <Text variant="caption" className="text-cyan-300 text-[10px] uppercase tracking-wider font-semibold">
              New
            </Text>
          </Box>
        )}

        <Box className="mb-6 flex flex-wrap items-center gap-3">
          <Text
            variant="caption"
            className="font-mono text-sm text-cyan-300 bg-cyan-500/10 px-2.5 py-1 rounded-md border border-cyan-400/20"
          >
            v{entry.version}
          </Text>

          {entry.publishedAt && (
            <Text variant="caption" className="text-xs text-blue-100/40">
              {formatDate(entry.publishedAt)}
            </Text>
          )}

          <Box className="flex gap-2 ml-auto">
            <Box
              className={`px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-semibold border ${categoryStyle.bg} ${categoryStyle.text} ${categoryStyle.border}`}
            >
              {categoryStyle.label}
            </Box>
          </Box>
        </Box>

        <Text variant="heading-md" className="mb-4 text-white">
          {entry.title}
        </Text>

        <Box
          className="prose prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: renderedContent }}
        />

        {entry.authorName && (
          <Box className="mt-6 pt-4 border-t border-white/5">
            <Text variant="caption" className="text-blue-100/30 text-xs">
              Published by {entry.authorName}
            </Text>
          </Box>
        )}
      </Card>
    );
  },
);

ChangelogEntry.displayName = "ChangelogEntry";
