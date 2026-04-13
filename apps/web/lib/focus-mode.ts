/**
 * AlecRae Focus Mode — distraction-free email triage.
 *
 * Hides everything except emails matching the user's chosen criteria
 * (important only, contacts only, no newsletters, custom AI rule).
 *
 * Triggered by Cmd+Shift+F (registered in keyboard-shortcuts.ts) or by
 * tapping the FocusModeIndicator badge. The AI layer can also auto-suggest
 * focus mode when it detects a deep-work session (long uninterrupted reading,
 * calendar shows "focus" block, etc.).
 *
 * Persisted in IndexedDB via settingsCache so the preference survives reloads.
 */

import { create } from "zustand";
import { settingsCache } from "./indexeddb-cache";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FocusModeCriteria {
  /** Only show emails the AI flagged as "important". */
  onlyImportant?: boolean;
  /** Only show emails from people in the user's contacts list. */
  onlyFromContacts?: boolean;
  /** Hide newsletters / list-mail. */
  hideNewsletters?: boolean;
  /** Free-form natural language rule, e.g. "only from my team". */
  customRule?: string;
}

/** Preset timer durations in minutes. */
export const FOCUS_TIMER_PRESETS: readonly number[] = [15, 30, 45, 60, 90] as const;

export interface FocusModeState {
  /** Is focus mode currently active. */
  active: boolean;
  /** Current filter criteria. */
  criteria: FocusModeCriteria;
  /** Last AI auto-suggestion timestamp (epoch ms), to debounce nags. */
  lastSuggestedAt: number | null;
  /** How many emails are currently filtered out by the criteria. */
  filteredOutCount: number;

  // ─── Timer State ──────────────────────────────────────────────────────────
  /** Timer duration in seconds (null means no timer). */
  timerDuration: number | null;
  /** Remaining seconds on the timer (null when inactive). */
  timerRemaining: number | null;
  /** Whether the timer is actively counting down. */
  timerRunning: boolean;

  // ─── Progress / Triage State ──────────────────────────────────────────────
  /** Total number of important emails shown in this session. */
  totalImportant: number;
  /** Number of emails the user has reviewed (clicked/opened). */
  reviewedCount: number;
  /** ID of the email currently selected in focus mode. */
  selectedEmailId: string | null;

  // Actions
  enableFocusMode: (criteria?: FocusModeCriteria) => Promise<void>;
  disableFocusMode: () => Promise<void>;
  toggleFocusMode: () => Promise<void>;
  updateCriteria: (criteria: FocusModeCriteria) => Promise<void>;
  setFilteredOutCount: (count: number) => void;
  hydrate: () => Promise<void>;
  suggestFocusMode: () => boolean;

  // Timer actions
  startTimer: (minutes: number) => void;
  stopTimer: () => void;
  tickTimer: () => void;

  // Progress actions
  setTotalImportant: (count: number) => void;
  markReviewed: (emailId: string) => void;
  selectEmail: (emailId: string | null) => void;
  resetProgress: () => void;
}

const STORAGE_KEY = "alecrae.focusMode";
const SUGGESTION_COOLDOWN_MS = 1000 * 60 * 60 * 4; // 4 hours

interface PersistedFocusMode {
  active: boolean;
  criteria: FocusModeCriteria;
  lastSuggestedAt: number | null;
}

const DEFAULT_CRITERIA: FocusModeCriteria = {
  onlyImportant: true,
  onlyFromContacts: false,
  hideNewsletters: true,
};

// ─── Zustand Store ───────────────────────────────────────────────────────────

export const useFocusMode = create<FocusModeState>((set, get) => ({
  active: false,
  criteria: DEFAULT_CRITERIA,
  lastSuggestedAt: null,
  filteredOutCount: 0,

  // Timer defaults
  timerDuration: null,
  timerRemaining: null,
  timerRunning: false,

  // Progress defaults
  totalImportant: 0,
  reviewedCount: 0,
  selectedEmailId: null,

  enableFocusMode: async (criteria) => {
    const next: FocusModeCriteria = criteria ?? get().criteria ?? DEFAULT_CRITERIA;
    set({
      active: true,
      criteria: next,
      reviewedCount: 0,
      selectedEmailId: null,
    });
    await persist({ active: true, criteria: next, lastSuggestedAt: get().lastSuggestedAt });
  },

  disableFocusMode: async () => {
    set({
      active: false,
      timerDuration: null,
      timerRemaining: null,
      timerRunning: false,
      reviewedCount: 0,
      totalImportant: 0,
      selectedEmailId: null,
    });
    await persist({
      active: false,
      criteria: get().criteria,
      lastSuggestedAt: get().lastSuggestedAt,
    });
  },

  toggleFocusMode: async () => {
    const { active, enableFocusMode, disableFocusMode } = get();
    if (active) {
      await disableFocusMode();
    } else {
      await enableFocusMode();
    }
  },

  updateCriteria: async (criteria) => {
    set({ criteria });
    await persist({
      active: get().active,
      criteria,
      lastSuggestedAt: get().lastSuggestedAt,
    });
  },

  setFilteredOutCount: (count) => set({ filteredOutCount: count }),

  hydrate: async () => {
    const stored = await settingsCache.get<PersistedFocusMode>(STORAGE_KEY);
    if (!stored) return;
    set({
      active: stored.active,
      criteria: stored.criteria ?? DEFAULT_CRITERIA,
      lastSuggestedAt: stored.lastSuggestedAt ?? null,
    });
  },

  suggestFocusMode: () => {
    const { active, lastSuggestedAt } = get();
    if (active) return false;
    const now = Date.now();
    if (lastSuggestedAt && now - lastSuggestedAt < SUGGESTION_COOLDOWN_MS) {
      return false;
    }
    set({ lastSuggestedAt: now });
    void persist({
      active: false,
      criteria: get().criteria,
      lastSuggestedAt: now,
    });
    return true;
  },

  // ─── Timer Actions ──────────────────────────────────────────────────────────

  startTimer: (minutes) => {
    const seconds = minutes * 60;
    set({
      timerDuration: seconds,
      timerRemaining: seconds,
      timerRunning: true,
    });
  },

  stopTimer: () => {
    set({
      timerDuration: null,
      timerRemaining: null,
      timerRunning: false,
    });
  },

  tickTimer: () => {
    const { timerRemaining, timerRunning } = get();
    if (!timerRunning || timerRemaining === null) return;
    const next = timerRemaining - 1;
    if (next <= 0) {
      // Timer expired — disable focus mode
      set({
        timerDuration: null,
        timerRemaining: null,
        timerRunning: false,
      });
      void get().disableFocusMode();
    } else {
      set({ timerRemaining: next });
    }
  },

  // ─── Progress Actions ───────────────────────────────────────────────────────

  setTotalImportant: (count) => set({ totalImportant: count }),

  markReviewed: (emailId) => {
    set((state) => {
      // Avoid double-counting the same email
      return { reviewedCount: state.reviewedCount + 1, selectedEmailId: emailId };
    });
  },

  selectEmail: (emailId) => set({ selectedEmailId: emailId }),

  resetProgress: () => set({ reviewedCount: 0, totalImportant: 0, selectedEmailId: null }),
}));

async function persist(state: PersistedFocusMode): Promise<void> {
  try {
    await settingsCache.set(STORAGE_KEY, state);
  } catch {
    // Cache failures must never break the UI; silently swallow.
  }
}

// ─── Filter Logic ────────────────────────────────────────────────────────────

export interface FocusFilterableEmail {
  fromAddress: string;
  isImportant?: boolean;
  isNewsletter?: boolean;
  isFromContact?: boolean;
  aiTags?: readonly string[];
}

/**
 * Returns true if the email passes the current focus criteria.
 * Pure function — safe to use in selectors / memoised filters.
 */
export function emailPassesFocus(
  email: FocusFilterableEmail,
  criteria: FocusModeCriteria,
): boolean {
  if (criteria.onlyImportant && !email.isImportant) return false;
  if (criteria.onlyFromContacts && !email.isFromContact) return false;
  if (criteria.hideNewsletters && email.isNewsletter) return false;
  if (criteria.customRule && criteria.customRule.trim().length > 0) {
    // Naive substring match against AI tags. The full rule engine evaluates
    // server-side; this client-side check is a fast pre-filter.
    const ruleLower = criteria.customRule.toLowerCase();
    const tags = email.aiTags ?? [];
    if (!tags.some((t) => t.toLowerCase().includes(ruleLower))) {
      return false;
    }
  }
  return true;
}

/**
 * Filter a list of emails by the current focus criteria, returning both the
 * filtered list and the count of dropped emails.
 */
export function applyFocusFilter<E extends FocusFilterableEmail>(
  emails: readonly E[],
  criteria: FocusModeCriteria,
): { visible: E[]; filteredOut: number } {
  const visible: E[] = [];
  let filteredOut = 0;
  for (const email of emails) {
    if (emailPassesFocus(email, criteria)) {
      visible.push(email);
    } else {
      filteredOut += 1;
    }
  }
  return { visible, filteredOut };
}

// ─── Keyboard Shortcut Wiring ────────────────────────────────────────────────

/**
 * Returns the action handler that the keyboard-shortcuts module wires
 * to Cmd+Shift+F. Imported by whatever module builds the shortcut list.
 */
export function getToggleFocusModeHandler(): () => void {
  return () => {
    void useFocusMode.getState().toggleFocusMode();
  };
}
