"use client";

/**
 * AnimatedPage — route-level transition wrapper.
 *
 * Wraps page content in a motion.div that fades/slides in on mount and out on
 * unmount. Used by dashboard pages to provide Linear-style route transitions.
 *
 * Supports two modes:
 * - "slide" (default): subtle upward slide + fade + scale
 * - "crossfade": pure opacity + scale, no vertical movement
 */

import { motion } from "motion/react";
import type { ReactNode } from "react";
import {
  pageCrossfade,
  pageEnter,
  useAlecRaeReducedMotion,
  withReducedMotion,
} from "../lib/animations";

export type AnimatedPageMode = "slide" | "crossfade";

export interface AnimatedPageProps {
  children: ReactNode;
  /** Animation mode. Default: "slide". */
  mode?: AnimatedPageMode;
  /** Extra CSS classes on the wrapper. */
  className?: string;
  /** Unique key for AnimatePresence — usually derived from pathname. */
  pageKey?: string;
}

export function AnimatedPage({
  children,
  mode = "slide",
  className,
  pageKey,
}: AnimatedPageProps): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const base = mode === "crossfade" ? pageCrossfade : pageEnter;
  const variants = withReducedMotion(base, reduced);

  return (
    <motion.div
      key={pageKey}
      className={className}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{ willChange: "opacity, transform" }}
    >
      {children}
    </motion.div>
  );
}
