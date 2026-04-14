/**
 * AlecRae Mobile — SwipeableEmailRow
 *
 * A single inbox row with two-stage horizontal swipe gestures, powered
 * by react-native-gesture-handler (Pan) + reanimated 3 worklets so all
 * animation runs on the UI thread.
 *
 * Behaviour:
 *   - Drag right past SHORT threshold → first right action (default: read)
 *   - Drag right past LONG  threshold → second right action (default: archive)
 *   - Drag left  past SHORT threshold → first left  action (default: snooze)
 *   - Drag left  past LONG  threshold → second left  action (default: delete)
 *
 * The row slides with the finger, the background color reveals the active
 * action, and a haptic tick fires whenever the threshold boundary is crossed.
 * On release we either spring back home or commit (slide off-screen + invoke
 * the parent's callback). Velocity flicks auto-commit even below threshold.
 */

import React, { memo, useCallback } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Extrapolation,
} from "react-native-reanimated";

import {
  ACTION_COLORS,
  DEFAULT_SWIPE_CONFIG,
  SPRING_COMMIT,
  SPRING_SNAP,
  SWIPE_THRESHOLDS,
  type ActionKind,
  type SwipeActionConfig,
} from "../lib/gestures";
import { lightTap, mediumTap, success } from "../lib/haptics";

export interface EmailRowData {
  id: string;
  from: string;
  subject: string;
  preview: string;
  receivedAt: string;
  unread: boolean;
}

export interface SwipeableEmailRowProps {
  email: EmailRowData;
  onAction: (id: string, action: ActionKind) => void;
  onPress?: (id: string) => void;
  config?: SwipeActionConfig;
}

const ACTION_LABELS: Record<ActionKind, string> = {
  archive: "Archive",
  read: "Read",
  snooze: "Snooze",
  delete: "Delete",
  reply: "Reply",
  flag: "Flag",
};

const ACTION_ICONS: Record<ActionKind, string> = {
  archive: "\u{1F4E5}", // inbox tray
  read: "\u{2709}\u{FE0F}", // envelope
  snooze: "\u{1F4A4}", // zzz
  delete: "\u{1F5D1}\u{FE0F}", // wastebasket
  reply: "\u{21A9}\u{FE0F}", // reply arrow
  flag: "\u{1F6A9}", // flag
};

function pickAction(
  translation: number,
  config: SwipeActionConfig,
): ActionKind | null {
  "worklet";
  const abs = Math.abs(translation);
  if (abs < SWIPE_THRESHOLDS.SHORT) return null;
  if (translation > 0) {
    return abs >= SWIPE_THRESHOLDS.LONG ? config.rightLong : config.rightShort;
  }
  return abs >= SWIPE_THRESHOLDS.LONG ? config.leftLong : config.leftShort;
}

function SwipeableEmailRowImpl({
  email,
  onAction,
  onPress,
  config = DEFAULT_SWIPE_CONFIG,
}: SwipeableEmailRowProps): React.ReactElement {
  const { width: screenWidth } = useWindowDimensions();
  const translateX = useSharedValue(0);
  const rowHeight = useSharedValue(84);
  const opacity = useSharedValue(1);
  // Tracks which action zone the finger is currently in (-2/-1/0/1/2) so we
  // only fire haptics on transitions, not every frame.
  const lastZone = useSharedValue(0);

  const fireAction = useCallback(
    (action: ActionKind): void => {
      success();
      onAction(email.id, action);
    },
    [email.id, onAction],
  );

  const handlePress = useCallback((): void => {
    onPress?.(email.id);
  }, [email.id, onPress]);

  const pan = Gesture.Pan()
    .activeOffsetX([-SWIPE_THRESHOLDS.ACTIVATION, SWIPE_THRESHOLDS.ACTIVATION])
    .failOffsetY([-12, 12])
    .onUpdate((evt) => {
      translateX.value = evt.translationX;
      const abs = Math.abs(evt.translationX);
      let zone = 0;
      if (abs >= SWIPE_THRESHOLDS.LONG) zone = evt.translationX > 0 ? 2 : -2;
      else if (abs >= SWIPE_THRESHOLDS.SHORT)
        zone = evt.translationX > 0 ? 1 : -1;
      if (zone !== lastZone.value) {
        lastZone.value = zone;
        if (zone === 1 || zone === -1) runOnJS(lightTap)();
        else if (zone === 2 || zone === -2) runOnJS(mediumTap)();
      }
    })
    .onEnd((evt) => {
      const action = pickAction(translateX.value, config);
      const flick = Math.abs(evt.velocityX) > SWIPE_THRESHOLDS.VELOCITY_COMMIT;
      const finalAction =
        action ??
        (flick
          ? evt.velocityX > 0
            ? config.rightShort
            : config.leftShort
          : null);

      if (finalAction) {
        const exitTo =
          translateX.value > 0 ? screenWidth + 80 : -screenWidth - 80;
        translateX.value = withSpring(exitTo, SPRING_COMMIT);
        opacity.value = withTiming(0, { duration: 220 });
        rowHeight.value = withTiming(0, { duration: 240 }, (finished) => {
          if (finished) runOnJS(fireAction)(finalAction);
        });
      } else {
        translateX.value = withSpring(0, SPRING_SNAP);
        lastZone.value = 0;
      }
    });

  const tap = Gesture.Tap()
    .maxDuration(250)
    .onEnd((_evt, ok) => {
      if (ok) runOnJS(handlePress)();
    });

  const composed = Gesture.Exclusive(pan, tap);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    height: rowHeight.value,
    opacity: opacity.value,
  }));

  const backgroundStyle = useAnimatedStyle(() => {
    const t = translateX.value;
    const abs = Math.abs(t);
    const right = t > 0;
    const shortAction = right ? config.rightShort : config.leftShort;
    const longAction = right ? config.rightLong : config.leftLong;

    const bgColor = interpolateColor(
      abs,
      [0, SWIPE_THRESHOLDS.SHORT, SWIPE_THRESHOLDS.LONG],
      [
        ACTION_COLORS.none,
        ACTION_COLORS[shortAction],
        ACTION_COLORS[longAction],
      ],
    );

    return {
      backgroundColor: bgColor,
      height: rowHeight.value,
      opacity: opacity.value,
    };
  });

  const iconStyle = useAnimatedStyle(() => {
    const abs = Math.abs(translateX.value);
    const scale = interpolate(
      abs,
      [0, SWIPE_THRESHOLDS.SHORT, SWIPE_THRESHOLDS.LONG],
      [0.6, 1, 1.18],
      Extrapolation.CLAMP,
    );
    const o = interpolate(
      abs,
      [0, SWIPE_THRESHOLDS.ACTIVATION, SWIPE_THRESHOLDS.SHORT],
      [0, 0.4, 1],
      Extrapolation.CLAMP,
    );
    return { transform: [{ scale }], opacity: o };
  });

  // Compute label text on the JS thread (cheap — re-renders only on mount).
  // The shown label updates via animated style on icon visibility; here we
  // render both sides and let the animated bg pick which is visible.
  const rightAction =
    Math.abs(translateX.value) >= SWIPE_THRESHOLDS.LONG
      ? config.rightLong
      : config.rightShort;
  const leftAction =
    Math.abs(translateX.value) >= SWIPE_THRESHOLDS.LONG
      ? config.leftLong
      : config.leftShort;

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.background, backgroundStyle]}>
        <Animated.View style={[styles.actionLeft, iconStyle]}>
          <Text style={styles.actionIcon}>{ACTION_ICONS[rightAction]}</Text>
          <Text style={styles.actionLabel}>{ACTION_LABELS[rightAction]}</Text>
        </Animated.View>
        <Animated.View style={[styles.actionRight, iconStyle]}>
          <Text style={styles.actionIcon}>{ACTION_ICONS[leftAction]}</Text>
          <Text style={styles.actionLabel}>{ACTION_LABELS[leftAction]}</Text>
        </Animated.View>
      </Animated.View>

      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.row, rowStyle]}>
          {email.unread ? <View style={styles.unreadDot} /> : null}
          <View style={styles.rowContent}>
            <View style={styles.rowHeader}>
              <Text
                style={[styles.from, email.unread && styles.fromUnread]}
                numberOfLines={1}
              >
                {email.from}
              </Text>
              <Text style={styles.timestamp}>{email.receivedAt}</Text>
            </View>
            <Text
              style={[styles.subject, email.unread && styles.subjectUnread]}
              numberOfLines={1}
            >
              {email.subject}
            </Text>
            <Text style={styles.preview} numberOfLines={1}>
              {email.preview}
            </Text>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export const SwipeableEmailRow = memo(SwipeableEmailRowImpl);

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
  },
  actionLeft: {
    alignItems: "center",
  },
  actionRight: {
    alignItems: "center",
  },
  actionIcon: {
    fontSize: 22,
  },
  actionLabel: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
    letterSpacing: 0.5,
  },
  row: {
    backgroundColor: "#0f172a",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1e293b",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22d3ee",
    marginRight: 12,
  },
  rowContent: {
    flex: 1,
  },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  from: {
    color: "#cbd5e1",
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
    marginRight: 8,
  },
  fromUnread: {
    color: "#ffffff",
    fontWeight: "700",
  },
  timestamp: {
    color: "#64748b",
    fontSize: 12,
  },
  subject: {
    color: "#cbd5e1",
    fontSize: 14,
    marginBottom: 2,
  },
  subjectUnread: {
    color: "#ffffff",
    fontWeight: "600",
  },
  preview: {
    color: "#64748b",
    fontSize: 13,
  },
});
