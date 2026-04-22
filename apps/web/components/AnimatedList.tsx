"use client";

/**
 * AnimatedList — staggered entrance/exit wrapper for any list-shaped content.
 *
 * Wraps each child in a motion.div with `listItemEnter` variants and applies
 * `staggerListItems` to the parent. Used by inbox lists, search results,
 * notification feeds, and anywhere you want list items to feel alive.
 *
 * Supports layout animations for smooth reordering when items are added,
 * removed, or reordered.
 */

import { AnimatePresence, motion, type Variants } from "motion/react";
import { Children, type ReactNode } from "react";
import {
  emailListItem,
  listItemEnter,
  staggerFast,
  staggerListItems,
  staggerSlow,
  useAlecRaeReducedMotion,
  withReducedMotion,
} from "../lib/animations";

export type StaggerSpeed = "fast" | "normal" | "slow";

export interface AnimatedListProps {
  children: ReactNode;
  /** Extra classes for the parent container. */
  className?: string;
  /** When true, items animate out when removed (uses AnimatePresence). */
  exitOnRemove?: boolean;
  /** Stagger speed preset. Default: "normal". */
  speed?: StaggerSpeed;
  /** Tag/role for the wrapper. Defaults to ul. */
  as?: "ul" | "ol" | "div";
  /** Use email-specific item variants (swipe exit). Default: false. */
  emailMode?: boolean;
  /** Enable layout animations for reordering. Default: true. */
  layoutAnimated?: boolean;
  /** Custom item variants override. */
  itemVariants?: Variants;
}

const staggerPresets: Record<StaggerSpeed, Variants> = {
  fast: staggerFast,
  normal: staggerListItems,
  slow: staggerSlow,
};

export function AnimatedList({
  children,
  className,
  exitOnRemove = true,
  speed = "normal",
  as = "ul",
  emailMode = false,
  layoutAnimated = true,
  itemVariants: customItemVariants,
}: AnimatedListProps): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const parentVariants = staggerPresets[speed];
  const baseItemVariants = customItemVariants ?? (emailMode ? emailListItem : listItemEnter);
  const childVariants = withReducedMotion(baseItemVariants, reduced);

  const items = Children.toArray(children);
  const MotionTag = motion[as];

  const content = items.map((child, i) => (
    <motion.li
      key={getKey(child, i)}
      variants={childVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      layout={layoutAnimated ? true : false}
      style={{ listStyle: "none" }}
    >
      {child}
    </motion.li>
  ));

  return (
    <MotionTag
      className={className}
      variants={parentVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {exitOnRemove ? <AnimatePresence initial={false}>{content}</AnimatePresence> : content}
    </MotionTag>
  );
}

function getKey(child: unknown, fallback: number): string | number {
  if (
    typeof child === "object" &&
    child !== null &&
    "key" in child &&
    (child as { key: unknown }).key !== null &&
    (child as { key: unknown }).key !== undefined
  ) {
    return (child as { key: string | number }).key;
  }
  return fallback;
}
