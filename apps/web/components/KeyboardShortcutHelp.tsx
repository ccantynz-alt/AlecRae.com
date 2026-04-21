"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_BOUNCY, useAlecRaeReducedMotion } from "../lib/animations";

interface ShortcutEntry {
  label: string;
  keys: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { label: "Command palette", keys: "Cmd+K" },
      { label: "Search emails", keys: "/" },
      { label: "Go to Inbox", keys: "G then I" },
      { label: "Go to Sent", keys: "G then S" },
      { label: "Go to Drafts", keys: "G then D" },
      { label: "Go to Settings", keys: "G then ," },
      { label: "Next email", keys: "J / Arrow Down" },
      { label: "Previous email", keys: "K / Arrow Up" },
      { label: "Open email", keys: "Enter / O" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { label: "Compose new email", keys: "C" },
      { label: "Archive", keys: "E" },
      { label: "Delete", keys: "#" },
      { label: "Star / unstar", keys: "S" },
      { label: "Snooze", keys: "B" },
      { label: "Mark read", keys: "Shift+I" },
      { label: "Mark unread", keys: "Shift+U" },
      { label: "Undo last action", keys: "Cmd+Z" },
    ],
  },
  {
    title: "Compose",
    shortcuts: [
      { label: "Reply", keys: "R" },
      { label: "Reply all", keys: "A" },
      { label: "Forward", keys: "F" },
      { label: "Send email", keys: "Cmd+Enter" },
    ],
  },
  {
    title: "AI Features",
    shortcuts: [
      { label: "AI compose", keys: "Cmd+Shift+C" },
      { label: "AI reply", keys: "Cmd+Shift+R" },
      { label: "AI summarize", keys: "Cmd+Shift+S" },
    ],
  },
  {
    title: "View",
    shortcuts: [
      { label: "Toggle dark mode", keys: "Cmd+Shift+D" },
      { label: "Toggle focus mode", keys: "Cmd+Shift+F" },
      { label: "Show shortcuts", keys: "?" },
    ],
  },
];

function KeyCombo({ keys }: { keys: string }): React.ReactNode {
  const parts = keys.split(/(\+| \/ | then )/);

  return (
    <span className="flex items-center gap-0.5 flex-shrink-0">
      {parts.map((part, i) => {
        if (part === "+" || part === " / " || part === " then ") {
          return (
            <span key={i} className="text-xs text-content-tertiary mx-0.5">
              {part.trim() === "+" ? "+" : part.trim() === "/" ? "or" : "then"}
            </span>
          );
        }
        return (
          <kbd
            key={i}
            className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 text-xs font-medium text-content bg-surface-secondary border border-border rounded shadow-sm"
          >
            {part === "Cmd" && typeof navigator !== "undefined" && !/Mac/.test(navigator.platform) ? "Ctrl" : part}
          </kbd>
        );
      })}
    </span>
  );
}

export function KeyboardShortcutHelp(): React.ReactNode {
  const [open, setOpen] = useState(false);
  const reduced = useAlecRaeReducedMotion();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 20 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 20 }}
            transition={SPRING_BOUNCY}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[301] w-[640px] max-h-[80vh] bg-surface rounded-2xl border border-border shadow-2xl overflow-hidden"
            role="dialog"
            aria-label="Keyboard shortcuts"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-content">Keyboard Shortcuts</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center text-content-tertiary hover:text-content rounded-lg transition-colors"
                aria-label="Close"
              >
                &#10005;
              </button>
            </div>

            <div className="overflow-y-auto max-h-[calc(80vh-64px)] p-6">
              <div className="grid grid-cols-2 gap-8">
                {SHORTCUT_GROUPS.map((group) => (
                  <div key={group.title}>
                    <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider mb-3">
                      {group.title}
                    </h3>
                    <div className="space-y-2">
                      {group.shortcuts.map((shortcut) => (
                        <div
                          key={shortcut.label}
                          className="flex items-center justify-between py-1"
                        >
                          <span className="text-sm text-content">{shortcut.label}</span>
                          <KeyCombo keys={shortcut.keys} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-3 border-t border-border bg-surface-secondary/50">
              <p className="text-xs text-content-tertiary text-center">
                Press <kbd className="px-1.5 py-0.5 text-xs bg-surface border border-border rounded shadow-sm">?</kbd> to toggle this panel
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
