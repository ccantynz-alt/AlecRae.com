"use client";

/**
 * FocusModeIndicator — toolbar badge that toggles focus mode.
 *
 * Shows a small pill in the toolbar. Pulses gently when focus mode is active.
 * When inactive, displays the keyboard shortcut hint. When active, shows the
 * count of "filtered out" emails so the user knows what they're missing.
 *
 * Enhanced: also shows reviewed/total progress and timer dot when running.
 */

import type { JSX } from "react";
import { motion } from "motion/react";
import { SPRING_SNAPPY, useViennaReducedMotion } from "../lib/animations";
import { useFocusMode } from "../lib/focus-mode";

export interface FocusModeIndicatorProps {
  className?: string;
}

export function FocusModeIndicator({ className }: FocusModeIndicatorProps): JSX.Element {
  const active = useFocusMode((s) => s.active);
  const filteredOutCount = useFocusMode((s) => s.filteredOutCount);
  const toggle = useFocusMode((s) => s.toggleFocusMode);
  const reviewedCount = useFocusMode((s) => s.reviewedCount);
  const totalImportant = useFocusMode((s) => s.totalImportant);
  const timerRunning = useFocusMode((s) => s.timerRunning);
  const reduced = useViennaReducedMotion();

  const baseClass =
    "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium " +
    "border transition-colors select-none " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 ";

  const stateClass = active
    ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/30 "
    : "bg-white/5 border-white/10 text-blue-100/80 hover:bg-white/10 hover:text-white ";

  return (
    <motion.button
      type="button"
      onClick={() => void toggle()}
      className={`${baseClass}${stateClass}${className ?? ""}`}
      aria-pressed={active}
      aria-label={active ? "Disable focus mode" : "Enable focus mode"}
      title={active ? "Focus mode is on (Cmd+Shift+F)" : "Enter focus mode (Cmd+Shift+F)"}
      {...(!reduced ? { whileHover: { scale: 1.04 } } : {})}
      {...(!reduced ? { whileTap: { scale: 0.96 } } : {})}
      transition={SPRING_SNAPPY}
    >
      <span className="relative flex h-2 w-2">
        {active && !reduced && (
          <motion.span
            className="absolute inline-flex h-full w-full rounded-full bg-cyan-400"
            animate={{ opacity: [0.75, 0, 0.75], scale: [1, 1.8, 1] }}
            transition={{ duration: 2, ease: "easeInOut", repeat: Infinity }}
          />
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            active ? "bg-cyan-400" : "bg-blue-300/60"
          }`}
        />
      </span>
      <span className="tracking-wide uppercase">Focus</span>
      {active && timerRunning && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"
          aria-label="Timer running"
        />
      )}
      {active && totalImportant > 0 && (
        <span className="text-[10px] font-normal text-cyan-200/80 normal-case tabular-nums">
          {reviewedCount}/{totalImportant}
        </span>
      )}
      {active && filteredOutCount > 0 && (
        <span className="text-[10px] font-normal text-cyan-200/60 normal-case">
          {filteredOutCount} hidden
        </span>
      )}
    </motion.button>
  );
}
