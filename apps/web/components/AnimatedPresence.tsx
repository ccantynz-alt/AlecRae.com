"use client";

/**
 * AnimatedPresence — generic enter/exit wrapper for any content.
 *
 * A convenience component that wraps children in a motion.div with
 * configurable enter/exit variants. Used anywhere content conditionally
 * appears or disappears (dropdowns, panels, expanded content, etc.).
 *
 * Pairs with AnimatePresence from motion/react for exit animations.
 */

import { AnimatePresence, motion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import {
  fadeInUp,
  useAlecRaeReducedMotion,
  withReducedMotion,
} from "../lib/animations";

export interface AnimatedPresenceProps {
  /** The content to animate. When falsy, the exit animation plays. */
  children: ReactNode;
  /** Whether the content is visible. Controls AnimatePresence. */
  show: boolean;
  /** Custom variants. Defaults to fadeInUp. */
  variants?: Variants;
  /** Extra CSS classes on the wrapper. */
  className?: string;
  /** Unique key for AnimatePresence tracking. */
  presenceKey?: string;
  /** ARIA role for the animated container. */
  role?: string;
  /** ARIA label for the animated container. */
  ariaLabel?: string;
  /** Run initial animation on first mount. Default true. */
  animateOnMount?: boolean;
}

export function AnimatedPresence({
  children,
  show,
  variants: customVariants,
  className,
  presenceKey = "animated-presence",
  role,
  ariaLabel,
  animateOnMount = true,
}: AnimatedPresenceProps): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const baseVariants = customVariants ?? fadeInUp;
  const variants = withReducedMotion(baseVariants, reduced);

  return (
    <AnimatePresence initial={animateOnMount}>
      {show && (
        <motion.div
          key={presenceKey}
          className={className}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          role={role}
          aria-label={ariaLabel}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
