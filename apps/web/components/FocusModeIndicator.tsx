"use client";

/**
 * FocusModeIndicator — toolbar badge that toggles focus mode.
 *
 * Shows a small pill in the toolbar. Pulses gently when focus mode is active.
 * When inactive, displays the keyboard shortcut hint. When active, shows the
 * count of "filtered out" emails so the user knows what they're missing.
 */

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
  const reduced = useViennaReducedMotion();

  const baseClass =
    "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium " +
    "border transition-colors select-none ";

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
      whileHover={reduced ? undefined : { scale: 1.04 }}
      whileTap={reduced ? undefined : { scale: 0.96 }}
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
      {active && filteredOutCount > 0 && (
        <span className="text-[10px] font-normal text-cyan-200/80 normal-case">
          {filteredOutCount} hidden
        </span>
      )}
    </motion.button>
  );
}
