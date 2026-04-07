"use client";

import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type ReleaseType = "feature" | "fix" | "breaking";

export interface Release {
  readonly slug: string;
  readonly version: string;
  readonly date: string;
  readonly title: string;
  readonly types: readonly ReleaseType[];
  readonly body: string;
}

const TYPE_STYLES: Readonly<Record<ReleaseType, string>> = {
  feature: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
  fix: "bg-blue-500/15 text-blue-300 border-blue-400/30",
  breaking: "bg-red-500/15 text-red-300 border-red-400/30",
};

const FILTERS: ReadonlyArray<{ readonly id: ReleaseType | "all"; readonly label: string }> = [
  { id: "all", label: "All" },
  { id: "feature", label: "Features" },
  { id: "fix", label: "Fixes" },
  { id: "breaking", label: "Breaking" },
];

export function ChangelogList({ releases }: { readonly releases: readonly Release[] }): React.JSX.Element {
  const [filter, setFilter] = useState<ReleaseType | "all">("all");

  const visible = useMemo(
    () => (filter === "all" ? releases : releases.filter((r) => r.types.includes(filter))),
    [filter, releases],
  );

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-12">
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
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center text-blue-100/50 text-sm">
          No releases match this filter.
        </div>
      ) : (
        <div className="space-y-12">
          {visible.map((release) => (
            <article
              key={release.slug}
              className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm p-8"
            >
              <header className="mb-6 flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm text-cyan-300">v{release.version}</span>
                <span className="text-xs text-blue-100/40">{release.date}</span>
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
              <div className="prose prose-invert prose-headings:bg-gradient-to-r prose-headings:from-white prose-headings:via-blue-200 prose-headings:to-cyan-300 prose-headings:bg-clip-text prose-headings:text-transparent prose-a:text-cyan-300 hover:prose-a:text-cyan-200 prose-code:text-cyan-200 max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{release.body}</ReactMarkdown>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
