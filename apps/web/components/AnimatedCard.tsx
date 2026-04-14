"use client";

/**
 * AnimatedCard — interactive card with hover lift + tap feedback.
 *
 * Used by feature cards, settings panels, dashboard tiles, and anywhere
 * a surface needs to feel tactile. Matches the dark gradient aesthetic of
 * the AlecRae landing page (translucent surface, white border, blur).
 */

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { SPRING_SNAPPY, useAlecRaeReducedMotion } from "../lib/animations";

export interface AnimatedCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  /** Disable interactions. */
  disabled?: boolean;
  /** ARIA role override. */
  role?: string;
  ariaLabel?: string;
}

export function AnimatedCard({
  children,
  className,
  onClick,
  disabled = false,
  role,
  ariaLabel,
}: AnimatedCardProps): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const interactive = !disabled && Boolean(onClick);

  const baseClass =
    "relative rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 " +
    "hover:bg-white/10 hover:border-white/20 " +
    "transition-colors p-4 text-left " +
    (interactive ? "cursor-pointer " : "") +
    (disabled ? "opacity-50 pointer-events-none " : "");

  return (
    <motion.div
      className={`${baseClass}${className ?? ""}`}
      onClick={interactive ? onClick : undefined}
      role={role ?? (interactive ? "button" : undefined)}
      aria-label={ariaLabel}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={SPRING_SNAPPY}
      whileHover={reduced || !interactive ? { scale: 1 } : { y: -3, scale: 1.01 }}
      whileTap={reduced || !interactive ? { scale: 1 } : { scale: 0.98 }}
    >
      {children}
    </motion.div>
  );
}
