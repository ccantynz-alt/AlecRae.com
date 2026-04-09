"use client";

/**
 * FocusModeProgress — shows "3 of 12 important emails reviewed".
 *
 * Displays a horizontal progress bar and textual count. Celebrates
 * inbox zero with a subtle animation when all emails are reviewed.
 * Fully accessible with ARIA live region for screen reader updates.
 */

import type { JSX } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  SPRING_BOUNCY,
  scalePopIn,
  useViennaReducedMotion,
  withReducedMotion,
} from "../lib/animations";
import { useFocusMode } from "../lib/focus-mode";

export interface FocusModeProgressProps {
  className?: string;
}

export function FocusModeProgress({ className }: FocusModeProgressProps): JSX.Element {
  const reduced = useViennaReducedMotion();
  const totalImportant = useFocusMode((s) => s.totalImportant);
  const reviewedCount = useFocusMode((s) => s.reviewedCount);

  const safeTotal = Math.max(totalImportant, 1);
  const clamped = Math.min(reviewedCount, totalImportant);
  const progress = totalImportant > 0 ? clamped / safeTotal : 0;
  const isComplete = totalImportant > 0 && clamped >= totalImportant;

  const popVariants = withReducedMotion(scalePopIn, reduced);

  return (
    <div
      className={className}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={
        isComplete
          ? "All important emails reviewed"
          : `${clamped} of ${totalImportant} important emails reviewed`
      }
    >
      <div className="flex flex-col items-center gap-2">
        {/* Text label */}
        <AnimatePresence mode="wait">
          {isComplete ? (
            <motion.div
              key="complete"
              variants={popVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex items-center gap-2"
            >
              <span className="text-emerald-400 text-sm" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
              <span className="text-sm font-medium text-emerald-300">
                All caught up
              </span>
            </motion.div>
          ) : (
            <motion.span
              key="counting"
              variants={popVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="text-sm text-blue-200/70"
            >
              <span className="text-white font-semibold tabular-nums">{clamped}</span>
              {" of "}
              <span className="text-white font-semibold tabular-nums">{totalImportant}</span>
              {" important emails reviewed"}
            </motion.span>
          )}
        </AnimatePresence>

        {/* Progress bar */}
        <div className="w-48 h-1 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className={[
              "h-full rounded-full",
              isComplete
                ? "bg-gradient-to-r from-emerald-400 to-emerald-300"
                : "bg-gradient-to-r from-cyan-400 to-purple-400",
            ].join(" ")}
            initial={{ width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={SPRING_BOUNCY}
          />
        </div>
      </div>
    </div>
  );
}
