/**
 * AlecRae Animation Library — Magic UI / Linear-grade motion presets
 *
 * Pre-defined Framer Motion variants and spring physics tuned to match
 * Linear's snappy-but-organic feel. Used by list items, modals, page
 * transitions, panels, badges, and anywhere a transition needs to feel
 * intentional rather than incidental.
 *
 * All variants degrade gracefully to instant transitions when the user has
 * `prefers-reduced-motion` enabled (see `useAlecRaeReducedMotion`).
 */

import type { Transition, Variants } from "motion/react";
import { useReducedMotion } from "motion/react";

// ─── Spring Physics Presets ──────────────────────────────────────────────────

/** Linear-style: confident bounce, fast settle. The "signature" AlecRae feel. */
export const SPRING_BOUNCY: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 25,
  mass: 0.8,
};

/** Gentle entrance — for modals, drawers, large surfaces. */
export const SPRING_SOFT: Transition = {
  type: "spring",
  stiffness: 220,
  damping: 28,
  mass: 1,
};

/** Instant response — for hover, tap, micro-interactions. */
export const SPRING_SNAPPY: Transition = {
  type: "spring",
  stiffness: 600,
  damping: 30,
  mass: 0.5,
};

/** No bounce, fast settle — for panels and content swaps. */
export const SPRING_PRECISE: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 40,
  mass: 0.7,
};

/** Heavy, deliberate — for drag completion and snapping. */
export const SPRING_HEAVY: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 35,
  mass: 1.2,
};

/** Elastic: noticeable bounce — for toasts and notifications. */
export const SPRING_ELASTIC: Transition = {
  type: "spring",
  stiffness: 350,
  damping: 15,
  mass: 0.6,
};

/** Micro: ultra-fast, for button press and tiny feedback. */
export const SPRING_MICRO: Transition = {
  type: "spring",
  stiffness: 700,
  damping: 35,
  mass: 0.3,
};

// ─── Fade Variants ───────────────────────────────────────────────────────────

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: SPRING_PRECISE },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const fadeOut: Variants = {
  initial: { opacity: 1 },
  animate: { opacity: 0, transition: { duration: 0.2 } },
};

export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: SPRING_BOUNCY },
  exit: { opacity: 0, y: 12, transition: { duration: 0.15 } },
};

export const fadeInDown: Variants = {
  initial: { opacity: 0, y: -12 },
  animate: { opacity: 1, y: 0, transition: SPRING_BOUNCY },
  exit: { opacity: 0, y: -12, transition: { duration: 0.15 } },
};

export const fadeInLeft: Variants = {
  initial: { opacity: 0, x: -12 },
  animate: { opacity: 1, x: 0, transition: SPRING_BOUNCY },
  exit: { opacity: 0, x: -12, transition: { duration: 0.15 } },
};

export const fadeInRight: Variants = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0, transition: SPRING_BOUNCY },
  exit: { opacity: 0, x: 12, transition: { duration: 0.15 } },
};

// ─── Scale Variants ──────────────────────────────────────────────────────────

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: SPRING_BOUNCY },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } },
};

export const scaleOut: Variants = {
  initial: { opacity: 1, scale: 1 },
  animate: { opacity: 0, scale: 0.96, transition: { duration: 0.2 } },
};

/** Pop-in: starts smaller, overshoots slightly. For badges, toasts, popovers. */
export const scalePopIn: Variants = {
  initial: { opacity: 0, scale: 0.6 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", stiffness: 500, damping: 18, mass: 0.6 },
  },
  exit: { opacity: 0, scale: 0.6, transition: { duration: 0.15 } },
};

/** Tap/press feedback — pair with whileTap. */
export const scalePop: Variants = {
  initial: { scale: 1 },
  animate: { scale: 1, transition: SPRING_SNAPPY },
  tap: { scale: 0.96, transition: SPRING_SNAPPY },
  hover: { scale: 1.02, transition: SPRING_SNAPPY },
};

// ─── Slide Variants ──────────────────────────────────────────────────────────

export const slideInUp: Variants = {
  initial: { y: "100%" },
  animate: { y: 0, transition: SPRING_SOFT },
  exit: { y: "100%", transition: SPRING_PRECISE },
};

export const slideInDown: Variants = {
  initial: { y: "-100%" },
  animate: { y: 0, transition: SPRING_SOFT },
  exit: { y: "-100%", transition: SPRING_PRECISE },
};

export const slideInLeft: Variants = {
  initial: { x: "-100%" },
  animate: { x: 0, transition: SPRING_SOFT },
  exit: { x: "-100%", transition: SPRING_PRECISE },
};

export const slideInRight: Variants = {
  initial: { x: "100%" },
  animate: { x: 0, transition: SPRING_SOFT },
  exit: { x: "100%", transition: SPRING_PRECISE },
};

// ─── Page Transition Variants ───────────────────────────────────────────────

/** Route-level page enter: subtle upward fade with scale. Linear-style. */
export const pageEnter: Variants = {
  initial: { opacity: 0, y: 8, scale: 0.99 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: SPRING_BOUNCY,
  },
  exit: {
    opacity: 0,
    y: -4,
    scale: 0.99,
    transition: { duration: 0.15 },
  },
};

/** Page crossfade — for smoother route changes without vertical shift. */
export const pageCrossfade: Variants = {
  initial: { opacity: 0, scale: 0.98 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: SPRING_PRECISE,
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: { duration: 0.12 },
  },
};

// ─── Email Thread Expand/Collapse ───────────────────────────────────────────

/** Thread content expand: height auto + fade. For email thread toggling. */
export const threadExpand: Variants = {
  initial: { opacity: 0, height: 0, overflow: "hidden" },
  animate: {
    opacity: 1,
    height: "auto",
    overflow: "visible",
    transition: {
      height: SPRING_BOUNCY,
      opacity: { duration: 0.2, delay: 0.05 },
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    overflow: "hidden",
    transition: {
      height: { ...SPRING_PRECISE, duration: 0.25 },
      opacity: { duration: 0.1 },
    },
  },
};

// ─── Compose Window ─────────────────────────────────────────────────────────

/** Compose window slide-up: modal-like entrance from the bottom. */
export const composeEnter: Variants = {
  initial: { opacity: 0, y: 40, scale: 0.97 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: SPRING_SOFT,
  },
  exit: {
    opacity: 0,
    y: 40,
    scale: 0.97,
    transition: { duration: 0.2, ease: "easeIn" },
  },
};

/** Compose overlay backdrop. */
export const composeBackdrop: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

// ─── Sidebar ────────────────────────────────────────────────────────────────

/** Sidebar width expansion with spring physics. */
export const sidebarExpand: Variants = {
  collapsed: {
    width: 64,
    transition: SPRING_PRECISE,
  },
  expanded: {
    width: 256,
    transition: SPRING_BOUNCY,
  },
};

/** Sidebar label fade — shown only when expanded. */
export const sidebarLabel: Variants = {
  collapsed: {
    opacity: 0,
    width: 0,
    transition: { duration: 0.1 },
  },
  expanded: {
    opacity: 1,
    width: "auto",
    transition: { delay: 0.1, duration: 0.15 },
  },
};

// ─── Toast / Notification ───────────────────────────────────────────────────

/** Toast slide-in from right with elastic bounce. */
export const toastEnterRight: Variants = {
  initial: { opacity: 0, x: 80, scale: 0.9 },
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: SPRING_ELASTIC,
  },
  exit: {
    opacity: 0,
    x: 80,
    scale: 0.9,
    transition: { duration: 0.2, ease: "easeIn" },
  },
};

/** Toast slide-in from top with bounce. */
export const toastEnterTop: Variants = {
  initial: { opacity: 0, y: -60, scale: 0.9 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: SPRING_ELASTIC,
  },
  exit: {
    opacity: 0,
    y: -60,
    scale: 0.9,
    transition: { duration: 0.2, ease: "easeIn" },
  },
};

/** Toast slide-in from bottom with bounce. */
export const toastEnterBottom: Variants = {
  initial: { opacity: 0, y: 60, scale: 0.9 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: SPRING_ELASTIC,
  },
  exit: {
    opacity: 0,
    y: 60,
    scale: 0.9,
    transition: { duration: 0.2, ease: "easeIn" },
  },
};

export const toastEnter = {
  right: toastEnterRight,
  top: toastEnterTop,
  bottom: toastEnterBottom,
} as const;

// ─── Button Press Feedback ──────────────────────────────────────────────────

/** Button scale-down on press, subtle hover lift. */
export const buttonPress: Variants = {
  initial: { scale: 1 },
  animate: { scale: 1, transition: SPRING_MICRO },
  tap: { scale: 0.97, transition: SPRING_MICRO },
  hover: { scale: 1.015, transition: SPRING_MICRO },
};

/** Icon button: slightly more dramatic. */
export const iconButtonPress: Variants = {
  initial: { scale: 1 },
  animate: { scale: 1, transition: SPRING_MICRO },
  tap: { scale: 0.9, transition: SPRING_MICRO },
  hover: { scale: 1.08, transition: SPRING_MICRO },
};

// ─── Drag & Drop ────────────────────────────────────────────────────────────

/** Item being dragged — lifts up with shadow increase. */
export const dragLift: Variants = {
  initial: { scale: 1, boxShadow: "0 0 0 rgba(0,0,0,0)", zIndex: 0 },
  dragging: {
    scale: 1.03,
    boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
    zIndex: 50,
    transition: SPRING_SNAPPY,
  },
  dropped: {
    scale: 1,
    boxShadow: "0 0 0 rgba(0,0,0,0)",
    zIndex: 0,
    transition: SPRING_HEAVY,
  },
};

/** Drop target highlight pulse. */
export const dropTarget: Variants = {
  idle: {
    borderColor: "rgba(0,0,0,0)",
    backgroundColor: "rgba(0,0,0,0)",
  },
  active: {
    borderColor: "rgba(59,130,246,0.5)",
    backgroundColor: "rgba(59,130,246,0.05)",
    transition: {
      duration: 0.2,
      repeat: Infinity,
      repeatType: "reverse",
    },
  },
};

// ─── List Item Variants (Staggered) ──────────────────────────────────────────

export const listItemEnter: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: SPRING_BOUNCY },
  exit: { opacity: 0, x: -20, transition: { duration: 0.15 } },
};

export const listItemExit: Variants = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

/** Email list item with swipe-away exit and layout animation. */
export const emailListItem: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: SPRING_BOUNCY,
  },
  exit: {
    opacity: 0,
    x: -60,
    transition: { duration: 0.2, ease: "easeIn" },
  },
  hover: {
    backgroundColor: "rgba(255,255,255,0.03)",
    transition: { duration: 0.1 },
  },
};

// ─── Modal Variants ──────────────────────────────────────────────────────────

export const modalEnter: Variants = {
  initial: { opacity: 0, scale: 0.94, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: SPRING_BOUNCY },
  exit: { opacity: 0, scale: 0.94, y: 8, transition: { duration: 0.18 } },
};

export const modalExit: Variants = {
  initial: { opacity: 1, scale: 1 },
  animate: { opacity: 0, scale: 0.94, transition: { duration: 0.18 } },
};

export const modalBackdrop: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

// ─── Drawer Variants ─────────────────────────────────────────────────────────

export const drawerEnterLeft: Variants = {
  initial: { x: "-100%", opacity: 0.5 },
  animate: { x: 0, opacity: 1, transition: SPRING_SOFT },
  exit: { x: "-100%", opacity: 0, transition: SPRING_PRECISE },
};

export const drawerEnterRight: Variants = {
  initial: { x: "100%", opacity: 0.5 },
  animate: { x: 0, opacity: 1, transition: SPRING_SOFT },
  exit: { x: "100%", opacity: 0, transition: SPRING_PRECISE },
};

export const drawerEnterBottom: Variants = {
  initial: { y: "100%", opacity: 0.5 },
  animate: { y: 0, opacity: 1, transition: SPRING_SOFT },
  exit: { y: "100%", opacity: 0, transition: SPRING_PRECISE },
};

/** Convenience namespaced object for the three drawer directions. */
export const drawerEnter = {
  left: drawerEnterLeft,
  right: drawerEnterRight,
  bottom: drawerEnterBottom,
} as const;

export const drawerExitLeft: Variants = {
  initial: { x: 0 },
  animate: { x: "-100%", transition: SPRING_PRECISE },
};

export const drawerExitRight: Variants = {
  initial: { x: 0 },
  animate: { x: "100%", transition: SPRING_PRECISE },
};

export const drawerExitBottom: Variants = {
  initial: { y: 0 },
  animate: { y: "100%", transition: SPRING_PRECISE },
};

export const drawerExit = {
  left: drawerExitLeft,
  right: drawerExitRight,
  bottom: drawerExitBottom,
} as const;

// ─── Loading / Skeleton ──────────────────────────────────────────────────────

export const skeletonShimmer: Variants = {
  initial: { backgroundPosition: "-200% 0" },
  animate: {
    backgroundPosition: "200% 0",
    transition: {
      duration: 1.4,
      ease: "linear",
      repeat: Infinity,
    },
  },
};

/** Skeleton row fade-in: stagger-friendly. */
export const skeletonRow: Variants = {
  initial: { opacity: 0.4 },
  animate: {
    opacity: [0.4, 0.7, 0.4],
    transition: {
      duration: 1.5,
      ease: "easeInOut",
      repeat: Infinity,
    },
  },
};

// ─── Toolbar / Action Bar ───────────────────────────────────────────────────

/** Toolbar item hover lift. */
export const toolbarItem: Variants = {
  initial: { scale: 1 },
  hover: { scale: 1.04, y: -1, transition: SPRING_SNAPPY },
  tap: { scale: 0.96, transition: SPRING_MICRO },
};

// ─── Badge / Chip Variants ──────────────────────────────────────────────────

/** Badge count update — pop. */
export const badgePop: Variants = {
  initial: { scale: 0.6, opacity: 0 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: { type: "spring", stiffness: 500, damping: 20, mass: 0.5 },
  },
  exit: {
    scale: 0.6,
    opacity: 0,
    transition: { duration: 0.1 },
  },
};

// ─── Stagger Helpers ─────────────────────────────────────────────────────────

/**
 * Build a parent variants object that staggers its children.
 * Use with `listItemEnter` on each child.
 */
export function staggerChildren(delay?: number, initialDelay?: number): Variants {
  const staggerDelay = delay ?? 0.04;
  const startDelay = initialDelay ?? 0;
  return {
    initial: {},
    animate: {
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: startDelay,
      },
    },
    exit: {
      transition: {
        staggerChildren: staggerDelay / 2,
        staggerDirection: -1,
      },
    },
  };
}

/** Default staggered list — used by AnimatedList. */
export const staggerListItems: Variants = staggerChildren(0.035, 0.02);

/** Fast stagger for dense lists (inbox). */
export const staggerFast: Variants = staggerChildren(0.02, 0.01);

/** Slow stagger for feature cards and grids. */
export const staggerSlow: Variants = staggerChildren(0.06, 0.05);

/** Grid stagger — for dashboard cards. */
export const staggerGrid: Variants = staggerChildren(0.05, 0.03);

// ─── Reduced Motion Support ──────────────────────────────────────────────────

/**
 * AlecRae's wrapper around Framer Motion's `useReducedMotion`.
 *
 * Returns `true` when the user prefers reduced motion. Components should
 * use this to swap variants for instant ones (or pass `transition={{ duration: 0 }}`).
 */
export function useAlecRaeReducedMotion(): boolean {
  return useReducedMotion() ?? false;
}

/**
 * Returns a variants object that's collapsed to instant transitions when
 * the user prefers reduced motion. Pass any of the named variants above.
 */
export function withReducedMotion(variants: Variants, reduced: boolean): Variants {
  if (!reduced) return variants;
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0 } },
    exit: { opacity: 0, transition: { duration: 0 } },
  };
}

/**
 * No-op transition for reduced motion: use as `transition` prop directly.
 */
export const INSTANT_TRANSITION: Transition = { duration: 0 };

/**
 * Returns either the given transition or instant depending on reduced motion.
 */
export function selectTransition(
  transition: Transition,
  reduced: boolean,
): Transition {
  return reduced ? INSTANT_TRANSITION : transition;
}
