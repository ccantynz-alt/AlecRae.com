/**
 * AlecRae Mobile — Reusable gesture configuration
 *
 * Single source of truth for swipe thresholds and spring physics. Tuned
 * to feel like Things 3 / Linear: snappy, slightly overshoot, never
 * sluggish. Adjust here, not in component files.
 */

import type { WithSpringConfig } from "react-native-reanimated";

export const SWIPE_THRESHOLDS = {
  /** Distance (px) the user must drag before the first action commits. */
  SHORT: 80,
  /** Distance (px) for the second (long) action. */
  LONG: 180,
  /** Pixels of finger movement before we consider the gesture "active". */
  ACTIVATION: 8,
  /** Velocity (px/s) at which a flick auto-commits the closest action. */
  VELOCITY_COMMIT: 800,
} as const;

/**
 * Theme palette for the four canonical email actions. Background colors
 * are revealed underneath the row as it slides.
 */
export const ACTION_COLORS = {
  archive: "#10b981", // green
  read: "#3b82f6", // blue
  snooze: "#f59e0b", // orange
  delete: "#ef4444", // red
  reply: "#3b82f6", // blue
  flag: "#eab308", // yellow
  none: "#1e293b", // slate-800 (matches dark theme base)
} as const;

export type ActionKind = "archive" | "read" | "snooze" | "delete" | "reply" | "flag";

/** Standard "snap" spring — used when releasing back to rest position. */
export const SPRING_SNAP: WithSpringConfig = {
  damping: 22,
  stiffness: 240,
  mass: 0.8,
  overshootClamping: false,
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 2,
};

/** Soft, dramatic spring for sheet/menu reveals. */
export const SPRING_SHEET: WithSpringConfig = {
  damping: 26,
  stiffness: 180,
  mass: 1,
};

/** Crisp spring for the commit/exit animation when an action fires. */
export const SPRING_COMMIT: WithSpringConfig = {
  damping: 18,
  stiffness: 320,
  mass: 0.6,
};

/**
 * User-customizable swipe action mapping. Persist this in settings/zustand;
 * defaults match the spec (right = read→archive, left = snooze→delete).
 */
export interface SwipeActionConfig {
  rightShort: ActionKind;
  rightLong: ActionKind;
  leftShort: ActionKind;
  leftLong: ActionKind;
}

export const DEFAULT_SWIPE_CONFIG: SwipeActionConfig = {
  rightShort: "read",
  rightLong: "archive",
  leftShort: "snooze",
  leftLong: "delete",
};
