"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface SearchResult {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
}

const SEARCH_INDEX: readonly SearchResult[] = [
  { slug: "/quickstart", title: "Quickstart", description: "Send your first email in under five minutes", category: "Getting Started" },
  { slug: "/authentication", title: "Authentication", description: "API keys, OAuth 2.0, bearer tokens, and scopes", category: "Getting Started" },
  { slug: "/rate-limits", title: "Rate Limits", description: "Rate limits, quotas, and retry strategies", category: "Getting Started" },
  { slug: "/errors", title: "Errors", description: "Error codes, status codes, and retry guidance", category: "Getting Started" },
  { slug: "/emails", title: "Emails", description: "Send, list, search, and manage email messages", category: "Endpoints" },
  { slug: "/threads", title: "Threads", description: "Thread-level operations and conversation view", category: "Endpoints" },
  { slug: "/contacts", title: "Contacts", description: "Contact management and address book", category: "Endpoints" },
  { slug: "/calendar", title: "Calendar", description: "Calendar events and scheduling", category: "Endpoints" },
  { slug: "/search", title: "Search", description: "Full-text and AI-powered semantic search", category: "Endpoints" },
  { slug: "/ai", title: "AI", description: "AI compose, voice profile, grammar, and translation", category: "Endpoints" },
  { slug: "/billing", title: "Billing", description: "Plans, checkout, portal, and usage", category: "Endpoints" },
  { slug: "/domains", title: "Domains", description: "Domain management and DNS verification", category: "Endpoints" },
  { slug: "/templates", title: "Templates", description: "Email template CRUD and rendering", category: "Endpoints" },
  { slug: "/webhooks", title: "Webhooks", description: "Webhook registration and event reference", category: "Endpoints" },
  { slug: "/analytics", title: "Analytics", description: "Delivery and engagement analytics", category: "Endpoints" },
  { slug: "/suppressions", title: "Suppressions", description: "Suppression list management", category: "Endpoints" },
  { slug: "/api-reference", title: "OpenAPI Spec", description: "Download the full OpenAPI 3.1 specification", category: "Reference" },
  { slug: "/migrate-gmail", title: "From Gmail", description: "Switch from Gmail to AlecRae in 5 minutes", category: "Migration" },
  { slug: "/migrate-outlook", title: "From Outlook", description: "Migrate from Outlook / Microsoft 365", category: "Migration" },
  { slug: "/migrate-apple-mail", title: "From Apple Mail", description: "Export MBOX from Apple Mail and import into AlecRae", category: "Migration" },
];

export function Search(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const results = query.length > 0
    ? SEARCH_INDEX.filter(
        (item) =>
          item.title.toLowerCase().includes(query.toLowerCase()) ||
          item.description.toLowerCase().includes(query.toLowerCase()) ||
          item.category.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  const handleOpen = useCallback((): void => {
    setOpen(true);
    setQuery("");
  }, []);

  const handleClose = useCallback((): void => {
    setOpen(false);
    setQuery("");
  }, []);

  const handleNavigate = useCallback(
    (slug: string): void => {
      router.push(slug);
      handleClose();
    },
    [router, handleClose]
  );

  useEffect((): (() => void) => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return (): void => window.removeEventListener("keydown", handler);
  }, []);

  useEffect((): void => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-blue-200/40 hover:bg-white/10 hover:text-blue-200/60 transition-colors"
        type="button"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span>Search docs...</span>
        <kbd className="ml-auto text-xs text-blue-200/30 bg-white/5 px-1.5 py-0.5 rounded border border-white/10 font-mono">
          Ctrl+K
        </kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} role="presentation" />
          <div className="relative w-full max-w-lg mx-4 rounded-2xl bg-slate-900 border border-white/20 shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
              <svg className="w-5 h-5 text-blue-200/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e): void => setQuery(e.target.value)}
                placeholder="Search documentation..."
                className="flex-1 bg-transparent text-white placeholder-blue-200/30 outline-none text-sm"
                type="text"
              />
              <kbd className="text-xs text-blue-200/30 bg-white/5 px-1.5 py-0.5 rounded border border-white/10 font-mono">
                Esc
              </kbd>
            </div>

            {query.length > 0 ? (
              <div className="max-h-80 overflow-y-auto py-2">
                {results.length > 0 ? (
                  results.map((result) => (
                    <button
                      key={result.slug}
                      onClick={(): void => handleNavigate(result.slug)}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors"
                      type="button"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-blue-200/30 uppercase tracking-wider">{result.category}</span>
                      </div>
                      <div className="text-sm font-medium text-white mt-0.5">{result.title}</div>
                      <div className="text-xs text-blue-100/50 mt-0.5">{result.description}</div>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-8 text-center text-sm text-blue-200/40">
                    No results for &ldquo;{query}&rdquo;
                  </div>
                )}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-sm text-blue-200/30">
                Start typing to search the documentation
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
