"use client";

/**
 * FocusModeToggle — compact toolbar button that activates/deactivates focus mode.
 *
 * Shows an eye icon when inactive, a pulsing indicator when active.
 * Displays the keyboard shortcut hint (Cmd+Shift+F) in its tooltip.
 * This is the button placed in the dashboard toolbar / header area.
 */

import type { JSX } from "react";
import { motion } from "motion/react";
import { SPRING_SNAPPY, useAlecRaeReducedMotion } from "../lib/animations";
import { useFocusMode } from "../lib/focus-mode";

export interface FocusModeToggleProps {
  className?: string;
}

export function FocusModeToggle({ className }: FocusModeToggleProps): JSX.Element {
  const reduced = useAlecRaeReducedMotion();
  const active = useFocusMode((s) => s.active);
  const toggle = useFocusMode((s) => s.toggleFocusMode);
  const filteredOutCount = useFocusMode((s) => s.filteredOutCount);
  const timerRunning = useFocusMode((s) => s.timerRunning);

  const handleClick = (): void => {
    void toggle();
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={[
        "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium",
        "border transition-colors select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
        active
          ? "bg-cyan-500/15 border-cyan-400/30 text-cyan-100 hover:bg-cyan-500/25"
          : "bg-white/5 border-white/10 text-blue-100/70 hover:bg-white/10 hover:text-white hover:border-white/20",
        className ?? "",
      ].join(" ")}
      aria-pressed={active}
      aria-label={active ? "Exit focus mode" : "Enter focus mode"}
      title={active ? "Focus mode is on (Cmd+Shift+F)" : "Enter focus mode (Cmd+Shift+F)"}
      {...(!reduced ? { whileHover: { scale: 1.03 } } : {})}
      {...(!reduced ? { whileTap: { scale: 0.97 } } : {})}
      transition={SPRING_SNAPPY}
    >
      {/* Icon */}
      <span className="relative flex items-center justify-center w-4 h-4">
        {active ? (
          <>
            {/* Pulsing ring behind the icon when active */}
            {!reduced && (
              <motion.span
                className="absolute inset-0 rounded-full bg-cyan-400/40"
                animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 2, ease: "easeInOut", repeat: Infinity }}
                aria-hidden="true"
              />
            )}
            {/* Eye-open icon */}
            <svg
              viewBox="0 0 16 16"
              fill="none"
              className="w-4 h-4 text-cyan-300 relative"
              aria-hidden="true"
            >
              <path
                d="M8 3.5C4.5 3.5 1.73 6.11 1 8c.73 1.89 3.5 4.5 7 4.5s6.27-2.61 7-4.5c-.73-1.89-3.5-4.5-7-4.5z"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="8"
                cy="8"
                r="2"
                stroke="currentColor"
                strokeWidth="1.25"
              />
            </svg>
          </>
        ) : (
          /* Eye-closed icon */
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <path
              d="M2 2l12 12M6.5 6.64a2 2 0 002.86 2.86M1 8c.73-1.89 3.5-4.5 7-4.5.89 0 1.73.14 2.5.4M15 8c-.46 1.19-1.55 2.68-3.18 3.64"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>

      {/* Label */}
      <span className="hidden sm:inline tracking-wide">Focus</span>

      {/* Timer indicator dot when timer is running */}
      {active && timerRunning && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0"
          aria-label="Timer running"
        />
      )}

      {/* Hidden count badge */}
      {active && filteredOutCount > 0 && (
        <span className="text-[10px] font-normal text-cyan-200/70 tabular-nums">
          {filteredOutCount} hidden
        </span>
      )}
    </motion.button>
  );
}
