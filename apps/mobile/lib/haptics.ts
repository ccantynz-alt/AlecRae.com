/**
 * AlecRae Mobile — Semantic haptic helpers
 *
 * Wraps expo-haptics with intent-revealing names so calling code reads
 * like UX design ("medium tap on threshold cross") instead of platform
 * primitives. All calls are fire-and-forget — failures are swallowed
 * because haptics are non-essential feedback.
 */

import * as Haptics from "expo-haptics";

type HapticFn = () => Promise<void>;

const safe = (fn: () => Promise<void>): HapticFn => {
  return async (): Promise<void> => {
    try {
      await fn();
    } catch {
      // Haptics not available on this device — non-fatal.
    }
  };
};

export const lightTap: HapticFn = safe(() =>
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
);

export const mediumTap: HapticFn = safe(() =>
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
);

export const heavyTap: HapticFn = safe(() =>
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
);

export const success: HapticFn = safe(() =>
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
);

export const warning: HapticFn = safe(() =>
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
);

export const error: HapticFn = safe(() =>
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
);

export const selection: HapticFn = safe(() => Haptics.selectionAsync());
