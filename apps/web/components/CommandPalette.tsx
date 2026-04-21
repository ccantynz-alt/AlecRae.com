"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_BOUNCY, useAlecRaeReducedMotion } from "../lib/animations";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  category: string;
  shortcut?: string;
  action: () => void;
}

const CATEGORIES: Record<string, string> = {
  navigation: "Go to",
  actions: "Actions",
  compose: "Compose",
  ai: "AI",
  search: "Search",
};

function getDefaultCommands(router: ReturnType<typeof useRouter>): CommandItem[] {
  return [
    { id: "inbox", label: "Inbox", category: "navigation", shortcut: "G I", action: () => router.push("/inbox") },
    { id: "compose", label: "Compose New Email", category: "compose", shortcut: "C", action: () => router.push("/compose") },
    { id: "sent", label: "Sent Mail", category: "navigation", shortcut: "G S", action: () => router.push("/sent") },
    { id: "drafts", label: "Drafts", category: "navigation", shortcut: "G D", action: () => router.push("/drafts") },
    { id: "snoozed", label: "Snoozed", category: "navigation", action: () => router.push("/snoozed") },
    { id: "contacts", label: "Contacts", category: "navigation", action: () => router.push("/contacts") },
    { id: "templates", label: "Templates", category: "navigation", action: () => router.push("/templates") },
    { id: "analytics", label: "Analytics", category: "navigation", action: () => router.push("/analytics") },
    { id: "domains", label: "Domains", category: "navigation", action: () => router.push("/domains") },
    { id: "settings", label: "Settings", category: "navigation", shortcut: "G ,", action: () => router.push("/settings") },
    { id: "ai-compose", label: "AI Compose", description: "Let AI write an email for you", category: "ai", shortcut: "Cmd+Shift+C", action: () => router.push("/compose") },
    { id: "search", label: "Search Emails", description: "Full-text search across all emails", category: "search", shortcut: "/", action: () => { router.push("/inbox"); setTimeout(() => document.querySelector<HTMLInputElement>('input[type="search"], input[placeholder*="Search"]')?.focus(), 100); } },
    { id: "dark-mode", label: "Toggle Dark Mode", category: "actions", shortcut: "Cmd+Shift+D", action: () => document.documentElement.classList.toggle("dark") },
  ];
}

export function CommandPalette(): React.ReactNode {
  const router = useRouter();
  const reduced = useAlecRaeReducedMotion();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo(() => getDefaultCommands(router), [router]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const lower = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(lower) ||
        cmd.category.toLowerCase().includes(lower) ||
        cmd.description?.toLowerCase().includes(lower),
    );
  }, [commands, query]);

  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const item of filtered) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category]!.push(item);
    }
    return groups;
  }, [filtered]);

  const flatItems = useMemo(() => {
    const items: CommandItem[] = [];
    for (const category of Object.keys(grouped)) {
      items.push(...grouped[category]!);
    }
    return items;
  }, [grouped]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
        setActiveIndex(0);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const runCommand = useCallback(
    (item: CommandItem) => {
      setOpen(false);
      setQuery("");
      item.action();
    },
    [],
  );

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatItems[activeIndex];
      if (item) runCommand(item);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  useEffect(() => {
    const active = listRef.current?.querySelector('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -20 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -20 }}
            transition={SPRING_BOUNCY}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 z-[401] w-[560px] bg-surface rounded-2xl border border-border shadow-2xl overflow-hidden"
            role="dialog"
            aria-label="Command palette"
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-content-tertiary flex-shrink-0" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a command or search..."
                className="flex-1 text-sm bg-transparent text-content placeholder:text-content-tertiary focus:outline-none"
                role="combobox"
                aria-expanded="true"
                aria-autocomplete="list"
              />
              <kbd className="px-1.5 py-0.5 text-xs text-content-tertiary bg-surface-secondary border border-border rounded">
                Esc
              </kbd>
            </div>

            <div ref={listRef} className="max-h-[360px] overflow-y-auto py-2" role="listbox">
              {flatItems.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-content-tertiary">
                    No commands found for &quot;{query}&quot;
                  </p>
                </div>
              ) : (
                Object.entries(grouped).map(([category, items]) => (
                  <div key={category}>
                    <div className="px-4 py-1.5">
                      <p className="text-xs font-semibold text-content-tertiary uppercase tracking-wider">
                        {CATEGORIES[category] ?? category}
                      </p>
                    </div>
                    {items.map((item) => {
                      const globalIdx = flatItems.indexOf(item);
                      const isActive = globalIdx === activeIndex;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-active={isActive}
                          onClick={() => runCommand(item)}
                          onMouseEnter={() => setActiveIndex(globalIdx)}
                          className={`w-full text-left flex items-center justify-between px-4 py-2.5 transition-colors ${
                            isActive ? "bg-brand-50 text-brand-700" : "text-content hover:bg-surface-secondary"
                          }`}
                          role="option"
                          aria-selected={isActive}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.label}</p>
                            {item.description && (
                              <p className="text-xs text-content-tertiary truncate mt-0.5">
                                {item.description}
                              </p>
                            )}
                          </div>
                          {item.shortcut && (
                            <span className="flex-shrink-0 ml-4 text-xs text-content-tertiary">
                              {item.shortcut.split("+").map((key, i) => (
                                <kbd
                                  key={i}
                                  className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-xs bg-surface-secondary border border-border rounded shadow-sm ml-0.5"
                                >
                                  {key === "Cmd" && typeof navigator !== "undefined" && !/Mac/.test(navigator.platform) ? "Ctrl" : key}
                                </kbd>
                              ))}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="px-4 py-2 border-t border-border bg-surface-secondary/50 flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs text-content-tertiary">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-surface border border-border rounded text-xs shadow-sm">&#8593;</kbd>
                  <kbd className="px-1 py-0.5 bg-surface border border-border rounded text-xs shadow-sm">&#8595;</kbd>
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-xs shadow-sm">&#9166;</kbd>
                  select
                </span>
              </div>
              <p className="text-xs text-content-tertiary">
                {flatItems.length} command{flatItems.length !== 1 ? "s" : ""}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
