"use client";

/**
 * AnimatedSkeleton — loading placeholder with shimmer effect.
 *
 * Renders a pulsing skeleton shape with a moving shimmer gradient.
 * Supports line, circle, and rectangular shapes. Multiple skeletons
 * can be staggered for a cascading loading effect.
 */

import { motion } from "motion/react";
import {
  skeletonRow,
  staggerChildren,
  useAlecRaeReducedMotion,
} from "../lib/animations";

export type SkeletonShape = "line" | "circle" | "rect";

export interface AnimatedSkeletonProps {
  /** Shape preset. Default: "line". */
  shape?: SkeletonShape;
  /** Width. Default: "100%". */
  width?: string | number;
  /** Height. Default: depends on shape. */
  height?: string | number;
  /** Border radius override. */
  borderRadius?: string | number;
  /** Extra CSS classes. */
  className?: string;
}

const shapeDefaults: Record<SkeletonShape, { height: number; borderRadius: string }> = {
  line: { height: 14, borderRadius: "6px" },
  circle: { height: 40, borderRadius: "9999px" },
  rect: { height: 80, borderRadius: "12px" },
};

export function AnimatedSkeleton({
  shape = "line",
  width,
  height,
  borderRadius,
  className,
}: AnimatedSkeletonProps): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const defaults = shapeDefaults[shape];
  const resolvedWidth = width ?? (shape === "circle" ? defaults.height : "100%");
  const resolvedHeight = height ?? defaults.height;
  const resolvedRadius = borderRadius ?? defaults.borderRadius;

  return (
    <motion.div
      className={`relative overflow-hidden ${className ?? ""}`}
      variants={skeletonRow}
      initial="initial"
      animate={reduced ? "initial" : "animate"}
      style={{
        width: resolvedWidth,
        height: resolvedHeight,
        borderRadius: resolvedRadius,
        background: "linear-gradient(90deg, rgba(120,120,120,0.08) 25%, rgba(120,120,120,0.15) 50%, rgba(120,120,120,0.08) 75%)",
        backgroundSize: "200% 100%",
      }}
      aria-hidden="true"
      role="presentation"
    >
      {!reduced && (
        <motion.div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)",
            backgroundSize: "200% 100%",
          }}
          animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
          transition={{
            duration: 1.6,
            ease: "linear",
            repeat: Infinity,
          }}
        />
      )}
    </motion.div>
  );
}

/**
 * AnimatedSkeletonGroup — staggered group of skeleton lines for list loading.
 */
export interface AnimatedSkeletonGroupProps {
  /** Number of skeleton lines. Default: 5. */
  count?: number;
  /** Gap between items in pixels. Default: 12. */
  gap?: number;
  /** Custom width range for variety. Each line gets a random width. */
  widthRange?: [number, number];
  /** Shape for all items. Default: "line". */
  shape?: SkeletonShape;
  /** Extra CSS classes on the container. */
  className?: string;
}

export function AnimatedSkeletonGroup({
  count = 5,
  gap = 12,
  widthRange = [60, 100],
  shape = "line",
  className,
}: AnimatedSkeletonGroupProps): React.ReactNode {
  const stagger = staggerChildren(0.08, 0);

  // Deterministic widths based on index, not random (avoids hydration mismatch)
  const widths = Array.from({ length: count }, (_, i) => {
    const range = widthRange[1] - widthRange[0];
    const step = range / Math.max(count - 1, 1);
    // Alternate between wider and narrower for visual variety
    const offset = i % 2 === 0 ? step * (i / 2) : range - step * ((i - 1) / 2);
    return Math.round(widthRange[0] + offset);
  });

  return (
    <motion.div
      className={`flex flex-col ${className ?? ""}`}
      style={{ gap }}
      variants={stagger}
      initial="initial"
      animate="animate"
    >
      {widths.map((w, i) => (
        <AnimatedSkeleton key={i} shape={shape} width={`${w}%`} />
      ))}
    </motion.div>
  );
}

/**
 * EmailSkeletonRow — skeleton that mimics the email list row layout.
 */
export function EmailSkeletonRow(): React.ReactNode {
  return (
    <motion.div
      className="flex items-start gap-3 px-4 py-3"
      variants={skeletonRow}
      initial="initial"
      animate="animate"
    >
      {/* Priority dot */}
      <AnimatedSkeleton shape="circle" width={8} height={8} className="mt-2 flex-shrink-0" />
      {/* Content area */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* Sender + timestamp row */}
        <div className="flex items-center justify-between gap-2">
          <AnimatedSkeleton shape="line" width="30%" height={12} />
          <AnimatedSkeleton shape="line" width={50} height={10} />
        </div>
        {/* Subject */}
        <AnimatedSkeleton shape="line" width="70%" height={12} />
        {/* Preview */}
        <AnimatedSkeleton shape="line" width="90%" height={10} />
      </div>
    </motion.div>
  );
}

/**
 * EmailListSkeleton — full email list loading state with staggered rows.
 */
export interface EmailListSkeletonProps {
  /** Number of skeleton rows. Default: 8. */
  count?: number;
  className?: string;
}

export function EmailListSkeleton({
  count = 8,
  className,
}: EmailListSkeletonProps): React.ReactNode {
  const stagger = staggerChildren(0.05, 0.02);
  const rows = Array.from({ length: count }, (_, i) => i);

  return (
    <motion.div
      className={`flex flex-col divide-y divide-border ${className ?? ""}`}
      variants={stagger}
      initial="initial"
      animate="animate"
      role="presentation"
      aria-label="Loading emails"
    >
      {rows.map((i) => (
        <EmailSkeletonRow key={i} />
      ))}
    </motion.div>
  );
}
