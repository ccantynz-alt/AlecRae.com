/**
 * AlecRae Keyboard Shortcuts — Cmd+K Command Palette + Global Shortcuts
 *
 * Makes AlecRae feel faster than Superhuman ($30/mo — ours is free).
 *
 * Shortcut modes:
 *   - Default (Gmail-compatible)
 *   - Vim mode (j/k navigation, dd delete, etc.)
 *   - Custom (user-defined)
 *
 * Features:
 *   - Cmd+K / Ctrl+K: Command palette (universal search + actions)
 *   - Single-key shortcuts in inbox (no modifier needed)
 *   - Shortcut hints in UI
 *   - Customizable key bindings
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Shortcut {
  /** Unique action ID */
  id: string;
  /** Display label */
  label: string;
  /** Category for grouping in help/palette */
  category: "navigation" | "actions" | "compose" | "search" | "view" | "ai";
  /** Key combination(s) — first is primary */
  keys: string[];
  /** Description shown in help */
  description: string;
  /** Handler function */
  handler: () => void;
  /** Only active in specific contexts */
  context?: "inbox" | "thread" | "compose" | "global";
  /** Icon for command palette */
  icon?: string;
}

export interface CommandPaletteItem {
  id: string;
  label: string;
  description?: string | undefined;
  category: string;
  icon?: string | undefined;
  shortcut?: string | undefined;
  action: () => void;
}

// ─── Default Shortcut Map ────────────────────────────────────────────────────

export function createDefaultShortcuts(actions: {
  openCommandPalette: () => void;
  compose: () => void;
  search: () => void;
  goToInbox: () => void;
  goToSent: () => void;
  goToDrafts: () => void;
  goToSettings: () => void;
  nextEmail: () => void;
  prevEmail: () => void;
  openEmail: () => void;
  archiveEmail: () => void;
  deleteEmail: () => void;
  starEmail: () => void;
  markRead: () => void;
  markUnread: () => void;
  replyEmail: () => void;
  replyAllEmail: () => void;
  forwardEmail: () => void;
  snoozeEmail: () => void;
  undoAction: () => void;
  aiCompose: () => void;
  aiReply: () => void;
  aiSummarize: () => void;
  toggleDarkMode: () => void;
  toggleFocusMode: () => void;
}): Shortcut[] {
  return [
    // Navigation
    { id: "command-palette", label: "Command Palette", category: "navigation", keys: ["mod+k"], description: "Open command palette", handler: actions.openCommandPalette, context: "global", icon: "⌘" },
    { id: "compose", label: "Compose", category: "navigation", keys: ["c"], description: "New email", handler: actions.compose, context: "inbox", icon: "✏️" },
    { id: "search", label: "Search", category: "navigation", keys: ["/", "mod+f"], description: "Search emails", handler: actions.search, context: "global", icon: "🔍" },
    { id: "go-inbox", label: "Go to Inbox", category: "navigation", keys: ["g i"], description: "Navigate to inbox", handler: actions.goToInbox, context: "global", icon: "📥" },
    { id: "go-sent", label: "Go to Sent", category: "navigation", keys: ["g s"], description: "Navigate to sent", handler: actions.goToSent, context: "global", icon: "📤" },
    { id: "go-drafts", label: "Go to Drafts", category: "navigation", keys: ["g d"], description: "Navigate to drafts", handler: actions.goToDrafts, context: "global", icon: "📝" },
    { id: "go-settings", label: "Settings", category: "navigation", keys: ["g ,"], description: "Open settings", handler: actions.goToSettings, context: "global", icon: "⚙️" },

    // Email list navigation
    { id: "next-email", label: "Next Email", category: "navigation", keys: ["j", "ArrowDown"], description: "Select next email", handler: actions.nextEmail, context: "inbox" },
    { id: "prev-email", label: "Previous Email", category: "navigation", keys: ["k", "ArrowUp"], description: "Select previous email", handler: actions.prevEmail, context: "inbox" },
    { id: "open-email", label: "Open Email", category: "navigation", keys: ["Enter", "o"], description: "Open selected email", handler: actions.openEmail, context: "inbox" },

    // Actions
    { id: "archive", label: "Archive", category: "actions", keys: ["e"], description: "Archive email", handler: actions.archiveEmail, context: "inbox", icon: "📦" },
    { id: "delete", label: "Delete", category: "actions", keys: ["#", "Backspace"], description: "Delete email", handler: actions.deleteEmail, context: "inbox", icon: "🗑️" },
    { id: "star", label: "Star/Unstar", category: "actions", keys: ["s"], description: "Toggle star", handler: actions.starEmail, context: "inbox", icon: "⭐" },
    { id: "mark-read", label: "Mark Read", category: "actions", keys: ["shift+i"], description: "Mark as read", handler: actions.markRead, context: "inbox" },
    { id: "mark-unread", label: "Mark Unread", category: "actions", keys: ["shift+u"], description: "Mark as unread", handler: actions.markUnread, context: "inbox" },
    { id: "snooze", label: "Snooze", category: "actions", keys: ["b"], description: "Snooze email", handler: actions.snoozeEmail, context: "inbox", icon: "⏰" },
    { id: "undo", label: "Undo", category: "actions", keys: ["mod+z"], description: "Undo last action", handler: actions.undoAction, context: "global", icon: "↩️" },

    // Compose
    { id: "reply", label: "Reply", category: "compose", keys: ["r"], description: "Reply to email", handler: actions.replyEmail, context: "thread", icon: "↩️" },
    { id: "reply-all", label: "Reply All", category: "compose", keys: ["a"], description: "Reply to all", handler: actions.replyAllEmail, context: "thread", icon: "↩️" },
    { id: "forward", label: "Forward", category: "compose", keys: ["f"], description: "Forward email", handler: actions.forwardEmail, context: "thread", icon: "➡️" },

    // AI
    { id: "ai-compose", label: "AI Compose", category: "ai", keys: ["mod+shift+c"], description: "AI write an email", handler: actions.aiCompose, context: "global", icon: "🤖" },
    { id: "ai-reply", label: "AI Reply", category: "ai", keys: ["mod+shift+r"], description: "AI generate reply", handler: actions.aiReply, context: "thread", icon: "🤖" },
    { id: "ai-summarize", label: "AI Summarize", category: "ai", keys: ["mod+shift+s"], description: "Summarize thread", handler: actions.aiSummarize, context: "thread", icon: "📋" },

    // View
    { id: "dark-mode", label: "Toggle Dark Mode", category: "view", keys: ["mod+shift+d"], description: "Switch light/dark theme", handler: actions.toggleDarkMode, context: "global", icon: "🌙" },
    { id: "focus-mode", label: "Toggle Focus Mode", category: "view", keys: ["mod+shift+f"], description: "Hide everything except important emails", handler: actions.toggleFocusMode, context: "global", icon: "🎯" },
  ];
}

// ─── Keyboard Event Handler ──────────────────────────────────────────────────

/**
 * Parse a key event into a normalized string like "mod+k" or "shift+enter"
 */
function normalizeKeyEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("mod");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");

  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  parts.push(key);

  return parts.join("+");
}

/**
 * Register global keyboard shortcut listener.
 * Returns a cleanup function.
 */
export function registerShortcuts(
  shortcuts: Shortcut[],
  getContext: () => "inbox" | "thread" | "compose" | "global",
): () => void {
  let pendingSequence = "";
  let sequenceTimer: ReturnType<typeof setTimeout> | null = null;

  const handler = (e: KeyboardEvent) => {
    // Don't intercept when user is typing in an input/textarea
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    ) {
      // Exception: Cmd+K should always work
      const normalized = normalizeKeyEvent(e);
      if (normalized === "mod+k") {
        e.preventDefault();
        const cmdK = shortcuts.find((s) => s.id === "command-palette");
        cmdK?.handler();
      }
      return;
    }

    const normalized = normalizeKeyEvent(e);
    const context = getContext();

    // Handle two-key sequences (e.g., "g i")
    if (pendingSequence) {
      const sequence = `${pendingSequence} ${normalized}`;
      const matched = shortcuts.find(
        (s) =>
          s.keys.includes(sequence) &&
          (!s.context || s.context === context || s.context === "global"),
      );

      pendingSequence = "";
      if (sequenceTimer) clearTimeout(sequenceTimer);

      if (matched) {
        e.preventDefault();
        matched.handler();
        return;
      }
    }

    // Check for sequence starters
    const startsSequence = shortcuts.some((s) =>
      s.keys.some((k) => k.startsWith(normalized + " ")),
    );

    if (startsSequence) {
      pendingSequence = normalized;
      sequenceTimer = setTimeout(() => {
        pendingSequence = "";
      }, 1000);
      return;
    }

    // Direct match
    const matched = shortcuts.find(
      (s) =>
        s.keys.includes(normalized) &&
        (!s.context || s.context === context || s.context === "global"),
    );

    if (matched) {
      e.preventDefault();
      matched.handler();
    }
  };

  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}

// ─── Command Palette Helpers ─────────────────────────────────────────────────

/**
 * Convert shortcuts to command palette items + add dynamic items.
 */
export function buildPaletteItems(
  shortcuts: Shortcut[],
  dynamicItems?: CommandPaletteItem[],
): CommandPaletteItem[] {
  const fromShortcuts: CommandPaletteItem[] = shortcuts.map((s) => ({
    id: s.id,
    label: s.label,
    description: s.description,
    category: s.category,
    icon: s.icon,
    shortcut: s.keys[0],
    action: s.handler,
  }));

  return [...fromShortcuts, ...(dynamicItems ?? [])];
}

/**
 * Filter palette items by search query.
 */
export function filterPaletteItems(
  items: CommandPaletteItem[],
  query: string,
): CommandPaletteItem[] {
  if (!query.trim()) return items;
  const lower = query.toLowerCase();
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(lower) ||
      item.description?.toLowerCase().includes(lower) ||
      item.category.toLowerCase().includes(lower),
  );
}

/**
 * Format a shortcut key for display.
 * Converts "mod+k" to "⌘K" on Mac, "Ctrl+K" on Windows.
 */
export function formatShortcutKey(key: string): string {
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  return key
    .split("+")
    .map((part) => {
      switch (part) {
        case "mod": return isMac ? "⌘" : "Ctrl";
        case "shift": return isMac ? "⇧" : "Shift";
        case "alt": return isMac ? "⌥" : "Alt";
        case "enter": return "↵";
        case "ArrowUp": return "↑";
        case "ArrowDown": return "↓";
        case "Backspace": return "⌫";
        default: return part.toUpperCase();
      }
    })
    .join(isMac ? "" : "+");
}
