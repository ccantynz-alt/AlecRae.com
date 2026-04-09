"use client";

/**
 * FocusModeEmailCard — minimal, zen-like email card for focus mode.
 *
 * Renders a single email in a distraction-free style: clean typography,
 * generous whitespace, no clutter. Designed to be scanned in under a second.
 *
 * Keyboard accessible: focusable, Enter/Space to select, Escape to deselect.
 * ARIA role="article" so screen readers announce it as an email item.
 */

import type { JSX } from "react";
import { motion } from "motion/react";
import {
  SPRING_SNAPPY,
  listItemEnter,
  useViennaReducedMotion,
  withReducedMotion,
} from "../lib/animations";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FocusModeEmail {
  id: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  preview: string;
  timestamp: string;
  isUnread: boolean;
  priority: "high" | "normal" | "low";
  aiCategory: string | undefined;
  isReviewed: boolean;
}

export interface FocusModeEmailCardProps {
  email: FocusModeEmail;
  selected: boolean;
  onSelect: (emailId: string) => void;
  onMarkReviewed: (emailId: string) => void;
  index: number;
}

// ─── Priority Label ──────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<FocusModeEmail["priority"], string> = {
  high: "bg-red-500/20 text-red-300 border-red-500/30",
  normal: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  low: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

const PRIORITY_LABELS: Record<FocusModeEmail["priority"], string> = {
  high: "Urgent",
  normal: "Normal",
  low: "Low",
};

// ─── Component ───────────────────────────────────────────────────────────────

export function FocusModeEmailCard({
  email,
  selected,
  onSelect,
  onMarkReviewed,
  index,
}: FocusModeEmailCardProps): JSX.Element {
  const reduced = useViennaReducedMotion();
  const itemVariants = withReducedMotion(listItemEnter, reduced);

  const handleClick = (): void => {
    onSelect(email.id);
    if (!email.isReviewed) {
      onMarkReviewed(email.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <motion.div
      variants={itemVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      custom={index}
      layout
    >
      <motion.button
        type="button"
        className={[
          "w-full text-left rounded-xl px-6 py-5 transition-colors",
          "border backdrop-blur-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
          selected
            ? "bg-white/10 border-cyan-400/40 shadow-lg shadow-cyan-500/5"
            : "bg-white/[0.03] border-white/10 hover:bg-white/[0.07] hover:border-white/20",
          email.isReviewed && !selected ? "opacity-60" : "",
        ].join(" ")}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="article"
        aria-label={`Email from ${email.senderName}: ${email.subject}`}
        aria-selected={selected}
        tabIndex={0}
        {...(!reduced ? { whileHover: { y: -1, scale: 1.005 } } : {})}
        {...(!reduced ? { whileTap: { scale: 0.995 } } : {})}
        transition={SPRING_SNAPPY}
      >
        {/* Top row: sender + timestamp + priority */}
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-3 min-w-0">
            {/* Unread dot */}
            {email.isUnread && (
              <span
                className="w-2 h-2 rounded-full bg-cyan-400 flex-shrink-0"
                aria-label="Unread"
              />
            )}
            {/* Reviewed checkmark */}
            {email.isReviewed && !email.isUnread && (
              <span
                className="w-4 h-4 flex-shrink-0 text-emerald-400"
                aria-label="Reviewed"
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  className="w-full h-full"
                  aria-hidden="true"
                >
                  <path
                    d="M13.25 4.75L6 12L2.75 8.75"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            )}
            <span
              className={[
                "text-sm font-medium truncate",
                email.isUnread ? "text-white" : "text-blue-100/90",
              ].join(" ")}
            >
              {email.senderName}
            </span>
            <span className="text-xs text-blue-200/40 truncate hidden sm:inline">
              {email.senderEmail}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {email.priority !== "normal" && (
              <span
                className={[
                  "text-[10px] font-medium px-2 py-0.5 rounded-full border uppercase tracking-wider",
                  PRIORITY_STYLES[email.priority],
                ].join(" ")}
              >
                {PRIORITY_LABELS[email.priority]}
              </span>
            )}
            <span className="text-xs text-blue-200/50">{email.timestamp}</span>
          </div>
        </div>

        {/* Subject line */}
        <div
          className={[
            "text-base mb-1.5 leading-snug",
            email.isUnread ? "font-semibold text-white" : "font-normal text-blue-50/90",
          ].join(" ")}
        >
          {email.subject}
        </div>

        {/* Preview text */}
        <div className="text-sm text-blue-200/60 leading-relaxed line-clamp-2">
          {email.preview}
        </div>

        {/* AI category badge */}
        {email.aiCategory && (
          <div className="mt-3">
            <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/20 uppercase tracking-wider">
              {email.aiCategory}
            </span>
          </div>
        )}
      </motion.button>
    </motion.div>
  );
}
