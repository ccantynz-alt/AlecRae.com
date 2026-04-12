"use client";

/**
 * FocusModeOverlay — full-screen distraction-free email view.
 *
 * When focus mode is active, this overlay covers the entire app surface
 * (sidebar, search bar, toolbar — all hidden). Only the filtered list of
 * important emails is rendered, plus:
 *   - A timer (optional, top-left)
 *   - A progress indicator (top-center)
 *   - An exit button (top-right)
 *   - Clean, zen-like email cards
 *   - Escape key to exit
 *
 * The aesthetic: dark gradient, ambient blurred blobs, translucent surfaces,
 * white-on-blue typography. AlecRae at its most focused.
 */

import type { JSX, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  fadeIn,
  fadeInUp,
  modalEnter,
  SPRING_SOFT,
  staggerChildren,
  useAlecRaeReducedMotion,
  withReducedMotion,
} from "../lib/animations";
import {
  useFocusMode,
  applyFocusFilter,
  type FocusFilterableEmail,
} from "../lib/focus-mode";
import { FocusModeEmailCard, type FocusModeEmail } from "./FocusModeEmailCard";
import { FocusModeTimer } from "./FocusModeTimer";
import { FocusModeProgress } from "./FocusModeProgress";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FocusModeOverlayProps {
  /**
   * The raw email list from the inbox. The overlay applies its own filter
   * criteria to decide which emails to show. Pass the full inbox list here.
   */
  emails: FocusModeOverlayEmail[];
  /**
   * Fallback: if provided, render children instead of the built-in card list.
   * Used when the parent wants full control over rendering.
   */
  children?: ReactNode;
  /** Called when the user selects an email in focus mode. */
  onSelectEmail?: (emailId: string) => void;
}

export interface FocusModeOverlayEmail extends FocusFilterableEmail {
  id: string;
  senderName: string;
  subject: string;
  preview: string;
  timestamp: string;
  isUnread: boolean;
  priority: "high" | "normal" | "low";
  aiCategory: string | undefined;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FocusModeOverlay({
  emails,
  children,
  onSelectEmail,
}: FocusModeOverlayProps): JSX.Element {
  const active = useFocusMode((s) => s.active);
  const criteria = useFocusMode((s) => s.criteria);
  const disable = useFocusMode((s) => s.disableFocusMode);
  const setFilteredOutCount = useFocusMode((s) => s.setFilteredOutCount);
  const setTotalImportant = useFocusMode((s) => s.setTotalImportant);
  const markReviewed = useFocusMode((s) => s.markReviewed);
  const selectEmail = useFocusMode((s) => s.selectEmail);
  const selectedEmailId = useFocusMode((s) => s.selectedEmailId);
  const reduced = useAlecRaeReducedMotion();

  // Track which emails have been reviewed in this session
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const overlayRef = useRef<HTMLDivElement>(null);

  // Filter emails based on criteria
  const { visible, filteredOut } = useMemo((): {
    visible: FocusModeOverlayEmail[];
    filteredOut: number;
  } => {
    if (!active) return { visible: [], filteredOut: 0 };
    return applyFocusFilter(emails, criteria);
  }, [active, emails, criteria]);

  // Sync counts with store
  useEffect(() => {
    if (active) {
      setFilteredOutCount(filteredOut);
      setTotalImportant(visible.length);
    }
  }, [active, filteredOut, visible.length, setFilteredOutCount, setTotalImportant]);

  // Convert to FocusModeEmail format
  const focusEmails: FocusModeEmail[] = useMemo(
    () =>
      visible.map((email) => ({
        id: email.id,
        senderName: email.senderName,
        senderEmail: email.fromAddress,
        subject: email.subject,
        preview: email.preview,
        timestamp: email.timestamp,
        isUnread: email.isUnread,
        priority: email.priority,
        aiCategory: email.aiCategory,
        isReviewed: reviewedIds.has(email.id),
      })),
    [visible, reviewedIds],
  );

  // Handle email selection
  const handleSelectEmail = useCallback(
    (emailId: string) => {
      selectEmail(emailId);
      onSelectEmail?.(emailId);
    },
    [selectEmail, onSelectEmail],
  );

  // Handle marking as reviewed
  const handleMarkReviewed = useCallback(
    (emailId: string) => {
      if (!reviewedIds.has(emailId)) {
        setReviewedIds((prev) => new Set(prev).add(emailId));
        markReviewed(emailId);
      }
    },
    [reviewedIds, markReviewed],
  );

  // Reset reviewed set when focus mode is activated
  useEffect(() => {
    if (active) {
      setReviewedIds(new Set());
    }
  }, [active]);

  // Escape key to exit focus mode
  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        void disable();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, disable]);

  // Focus trap: focus the overlay when it appears
  useEffect(() => {
    if (active && overlayRef.current) {
      overlayRef.current.focus();
    }
  }, [active]);

  const overlayVariants = withReducedMotion(fadeIn, reduced);
  const contentVariants = withReducedMotion(modalEnter, reduced);
  const headerVariants = withReducedMotion(fadeInUp, reduced);
  const stagger = staggerChildren(0.05, 0.1);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="focus-overlay"
          ref={overlayRef}
          className="fixed inset-0 z-[100] flex flex-col bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white"
          variants={overlayVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          role="dialog"
          aria-modal="true"
          aria-label="Focus Mode — distraction-free email triage"
          tabIndex={-1}
        >
          {/* Ambient blurred gradient blobs (matches landing page aesthetic) */}
          <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
            <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-72 h-72 bg-cyan-500 rounded-full mix-blend-screen filter blur-3xl opacity-10" />
          </div>

          {/* ─── Header Bar ─────────────────────────────────────────────── */}
          <motion.header
            className="relative z-10 flex items-center justify-between px-6 md:px-12 pt-6 pb-4"
            variants={headerVariants}
            initial="initial"
            animate="animate"
          >
            {/* Left: Timer */}
            <div className="flex-1">
              <FocusModeTimer />
            </div>

            {/* Center: Progress */}
            <div className="flex-1 flex justify-center">
              <FocusModeProgress />
            </div>

            {/* Right: Exit button */}
            <div className="flex-1 flex justify-end">
              <motion.button
                type="button"
                onClick={() => void disable()}
                className={[
                  "inline-flex items-center gap-2 px-5 py-2.5 rounded-full",
                  "bg-white/10 backdrop-blur-md border border-white/20",
                  "hover:bg-white/15 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
                ].join(" ")}
                initial={reduced ? false : { opacity: 0, y: -8 }}
                {...(!reduced ? { animate: { opacity: 1, y: 0 } } : {})}
                transition={SPRING_SOFT}
                aria-label="Exit focus mode (Escape)"
              >
                {/* Pulsing dot */}
                <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                  {!reduced && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  )}
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
                </span>
                <span className="text-xs font-medium text-blue-100 tracking-wide uppercase">
                  Exit Focus
                </span>
                <span className="text-[10px] text-blue-200/50 font-light hidden sm:inline">
                  Esc
                </span>
              </motion.button>
            </div>
          </motion.header>

          {/* ─── Email List Area ─────────────────────────────────────────── */}
          <motion.div
            className="relative z-[1] flex-1 overflow-y-auto px-6 md:px-12 lg:px-24 pb-12"
            variants={contentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="max-w-2xl mx-auto">
              {children ? (
                /* External render mode */
                children
              ) : focusEmails.length === 0 ? (
                /* Empty state */
                <motion.div
                  className="flex flex-col items-center justify-center py-24 text-center"
                  initial={reduced ? false : { opacity: 0, y: 12 }}
                  {...(!reduced ? { animate: { opacity: 1, y: 0 } } : {})}
                  transition={SPRING_SOFT}
                >
                  <span className="text-5xl mb-4" aria-hidden="true">
                    <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 text-cyan-400/60">
                      <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" />
                      <path
                        d="M16 24l5.5 5.5L32 18"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="text-xl font-medium text-white mb-2">
                    Nothing urgent right now
                  </span>
                  <span className="text-sm text-blue-200/60 max-w-xs">
                    No emails match your focus criteria. Enjoy the calm.
                  </span>
                </motion.div>
              ) : (
                /* Email card list with stagger */
                <motion.div
                  className="flex flex-col gap-3"
                  variants={stagger}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  role="list"
                  aria-label={`${focusEmails.length} important emails`}
                >
                  {focusEmails.map((email, index) => (
                    <div key={email.id} role="listitem">
                      <FocusModeEmailCard
                        email={email}
                        selected={email.id === selectedEmailId}
                        onSelect={handleSelectEmail}
                        onMarkReviewed={handleMarkReviewed}
                        index={index}
                      />
                    </div>
                  ))}
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* ─── Bottom Keyboard Hint ─────────────────────────────────────── */}
          <motion.footer
            className="relative z-10 flex justify-center pb-6"
            initial={reduced ? false : { opacity: 0 }}
            {...(!reduced ? { animate: { opacity: 1 } } : {})}
            transition={{ delay: 0.5, duration: 0.4 }}
            aria-hidden="true"
          >
            <div className="flex items-center gap-4 text-[10px] text-blue-200/30 uppercase tracking-widest">
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-blue-200/50">
                  Esc
                </kbd>
                {" "}exit
              </span>
              <span className="text-white/10">|</span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-blue-200/50">
                  J
                </kbd>
                /
                <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-blue-200/50">
                  K
                </kbd>
                {" "}navigate
              </span>
              <span className="text-white/10">|</span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-blue-200/50">
                  Enter
                </kbd>
                {" "}open
              </span>
            </div>
          </motion.footer>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
