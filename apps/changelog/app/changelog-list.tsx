"use client";

import { useState, useMemo, useEffect, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ReleaseType = "feature" | "improvement" | "fix" | "security" | "breaking";

export interface Release {
  readonly slug: string;
  readonly version: string;
  readonly date: string;
  readonly title: string;
  readonly types: readonly ReleaseType[];
  readonly body: string;
}

// ─── Category styles ────────────────────────────────────────────────────────

const TYPE_STYLES: Readonly<Record<ReleaseType, string>> = {
  feature: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
  improvement: "bg-blue-500/15 text-blue-300 border-blue-400/30",
  fix: "bg-orange-500/15 text-orange-300 border-orange-400/30",
  security: "bg-red-500/15 text-red-300 border-red-400/30",
  breaking: "bg-purple-500/15 text-purple-300 border-purple-400/30",
};

const FILTERS: ReadonlyArray<{ readonly id: ReleaseType | "all"; readonly label: string }> = [
  { id: "all", label: "All" },
  { id: "feature", label: "Features" },
  { id: "improvement", label: "Improvements" },
  { id: "fix", label: "Fixes" },
  { id: "security", label: "Security" },
  { id: "breaking", label: "Breaking" },
];

// ─── Last visit tracking ────────────────────────────────────────────────────

const LAST_VISIT_KEY = "vienna_changelog_last_visit";

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
    // silently ignore
  }
}

// ─── Lightweight markdown renderer ──────────────────────────────────────────

function renderMarkdown(md: string): string {
  let html = md;

  // Escape HTML
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Headings
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

  // Code blocks
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

  // Wrap consecutive list items
  html = html.replace(
    /(<li[\s\S]*?<\/li>\n?)+/g,
    (match) => `<ul class="space-y-1 my-3">${match}</ul>`,
  );

  // Paragraphs
  html = html.replace(
    /^(?!<[a-z/])((?!^\s*$).+)$/gm,
    '<p class="text-blue-100/70 leading-relaxed my-2">$1</p>',
  );

  html = html.replace(/\n{3,}/g, "\n\n");

  return html;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ChangelogList({ releases }: { readonly releases: readonly Release[] }): React.JSX.Element {
  const [filter, setFilter] = useState<ReleaseType | "all">("all");
  const [lastVisitedAt, setLastVisitedAtState] = useState<string | null>(null);

  // Track last visit
  useEffect(() => {
    setLastVisitedAtState(getLastVisitedAt());
    // Set the new last-visited timestamp after a small delay so the "new" badges show
    const timer = setTimeout(() => {
      setLastVisitedAt();
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const visible = useMemo(
    () => (filter === "all" ? releases : releases.filter((r) => r.types.includes(filter))),
    [filter, releases],
  );

  const newCount = useMemo(() => {
    if (!lastVisitedAt) return 0;
    return releases.filter((r) => r.date > lastVisitedAt.split("T")[0]!).length;
  }, [releases, lastVisitedAt]);

  const isNew = useCallback(
    (release: Release): boolean => {
      if (!lastVisitedAt) return false;
      return release.date > lastVisitedAt.split("T")[0]!;
    },
    [lastVisitedAt],
  );

  // Group by version
  const versionGroups = useMemo(() => {
    const groups = new Map<string, Release[]>();
    for (const r of visible) {
      const existing = groups.get(r.version);
      if (existing) {
        existing.push(r);
      } else {
        groups.set(r.version, [r]);
      }
    }
    return Array.from(groups.entries());
  }, [visible]);

  return (
    <>
      {/* Filter tabs + RSS */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                active
                  ? "bg-white/15 border-white/30 text-white"
                  : "bg-white/5 border-white/10 text-blue-100/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              {f.label}
            </button>
          );
        })}
        <a
          href="/rss.xml"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium bg-orange-500/10 text-orange-300 border border-orange-400/20 hover:bg-orange-500/20 transition-colors"
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
        </a>
      </div>

      {/* What's new banner */}
      {newCount > 0 && filter === "all" && (
        <div className="mb-8 flex items-center gap-3 px-4 py-3 rounded-xl bg-cyan-500/10 border border-cyan-400/20">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-sm text-cyan-300">
            {newCount} new {newCount === 1 ? "update" : "updates"} since your last visit
          </span>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center text-blue-100/50 text-sm">
          No releases match this filter.
        </div>
      ) : (
        <div className="space-y-16">
          {versionGroups.map(([version, groupReleases]) => (
            <div key={version} className="relative">
              {/* Version header with timeline dot */}
              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-400/20">
                  <span className="font-mono text-xs text-cyan-300 font-bold">
                    {version}
                  </span>
                </div>
                <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
              </div>

              {/* Entries */}
              <div className="space-y-6 pl-5 border-l-2 border-white/5 ml-5">
                {groupReleases.map((release) => (
                  <div key={release.slug} className="relative">
                    <div className="absolute -left-[calc(1.25rem+5px)] top-8 w-2.5 h-2.5 rounded-full bg-white/20 border-2 border-slate-900" />
                    <article className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm p-8 relative">
                      {isNew(release) && (
                        <div className="absolute -top-2 -right-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/30">
                          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                          <span className="text-cyan-300 text-[10px] uppercase tracking-wider font-semibold">
                            New
                          </span>
                        </div>
                      )}
                      <header className="mb-6 flex flex-wrap items-center gap-3">
                        <span className="font-mono text-sm text-cyan-300 bg-cyan-500/10 px-2.5 py-1 rounded-md border border-cyan-400/20">
                          v{release.version}
                        </span>
                        <span className="text-xs text-blue-100/40">
                          {formatDate(release.date)}
                        </span>
                        <div className="flex gap-2 ml-auto">
                          {release.types.map((t) => (
                            <span
                              key={t}
                              className={`px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-semibold border ${TYPE_STYLES[t]}`}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </header>
                      <div
                        className="prose prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(release.body) }}
                      />
                    </article>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
