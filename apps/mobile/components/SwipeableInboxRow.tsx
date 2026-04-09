/**
 * Vienna Mobile -- SwipeableInboxRow
 *
 * Enhanced swipeable inbox row that extends the base SwipeableEmailRow
 * with five-action swipe support:
 *   - Right swipe (short): Reply (blue) -- opens QuickReplySheet
 *   - Right swipe (long):  Snooze (orange)
 *   - Left swipe (short):  Archive (green)
 *   - Left swipe (long):   Delete (red)
 *   - Right swipe (flick): Flag (yellow)
 *
 * Features:
 *   - Haptic feedback via Expo Haptics at threshold boundaries
 *   - Velocity-based flick detection for quick commits
 *   - Spring animations on the UI thread via Reanimated 3
 *   - Configurable actions per user settings
 *   - Long-press context menu for accessibility
 *   - Undo toast callback after destructive actions
 *   - prefers-reduced-motion: instant transitions
 *
 * Calls existing Vienna API endpoints for archive, delete, reply, snooze, flag.
 */

import React, { memo, useCallback, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import {
  ACTION_COLORS,
  SPRING_COMMIT,
  SPRING_SNAP,
  SWIPE_THRESHOLDS,
  type ActionKind,
  type SwipeActionConfig,
} from "../lib/gestures";
import { lightTap, mediumTap, success } from "../lib/haptics";

// ── Types ────────────────────────────────────────────────────────────────────

export interface InboxRowEmail {
  readonly id: string;
  readonly from: string;
  readonly fromEmail: string;
  readonly subject: string;
  readonly preview: string;
  readonly receivedAt: string;
  readonly unread: boolean;
  readonly starred?: boolean;
  readonly flagged?: boolean;
}

export interface SwipeableInboxRowProps {
  readonly email: InboxRowEmail;
  readonly onAction: (id: string, action: ActionKind) => void;
  readonly onPress?: (id: string) => void;
  readonly onReplySwipe?: (id: string) => void;
  readonly onUndoRequest?: (id: string, action: ActionKind) => void;
  readonly config?: SwipeActionConfig;
  /** When true, prefer instant transitions (accessibility). */
  readonly reducedMotion?: boolean;
}

// ── Five-action config ───────────────────────────────────────────────────────

const FIVE_ACTION_CONFIG: SwipeActionConfig = {
  rightShort: "reply",
  rightLong: "snooze",
  leftShort: "archive",
  leftLong: "delete",
};

const ACTION_LABELS: Record<ActionKind, string> = {
  archive: "Archive",
  read: "Read",
  snooze: "Snooze",
  delete: "Delete",
  reply: "Reply",
  flag: "Flag",
};

const ACTION_ICONS: Record<ActionKind, string> = {
  archive: "\u{1F4E5}",
  read: "\u{2709}\u{FE0F}",
  snooze: "\u{1F4A4}",
  delete: "\u{1F5D1}\u{FE0F}",
  reply: "\u{21A9}\u{FE0F}",
  flag: "\u{1F6A9}",
};

const CONTEXT_MENU_ACTIONS: readonly ActionKind[] = [
  "reply",
  "archive",
  "snooze",
  "flag",
  "delete",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Component ────────────────────────────────────────────────────────────────

function SwipeableInboxRowImpl({
  email,
  onAction,
  onPress,
  onReplySwipe,
  onUndoRequest,
  config = FIVE_ACTION_CONFIG,
  reducedMotion = false,
}: SwipeableInboxRowProps): React.ReactElement {
  const { width: screenWidth } = useWindowDimensions();
  const translateX = useSharedValue(0);
  const rowHeight = useSharedValue(84);
  const opacity = useSharedValue(1);
  const lastZone = useSharedValue(0);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fireAction = useCallback(
    (action: ActionKind): void => {
      void success();
      // If reply action, open the quick reply sheet instead of inline action
      if (action === "reply" && onReplySwipe) {
        onReplySwipe(email.id);
        // Reset the row position
        translateX.value = reducedMotion ? 0 : withSpring(0, SPRING_SNAP);
        rowHeight.value = 84;
        opacity.value = 1;
        return;
      }
      onAction(email.id, action);
      // Fire undo callback for destructive actions
      if ((action === "delete" || action === "archive") && onUndoRequest) {
        onUndoRequest(email.id, action);
      }
    },
    [email.id, onAction, onReplySwipe, onUndoRequest, translateX, rowHeight, opacity, reducedMotion],
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
        // For reply, don't exit the row -- just spring back
        if (finalAction === "reply") {
          if (reducedMotion) {
            translateX.value = 0;
          } else {
            translateX.value = withSpring(0, SPRING_SNAP);
          }
          lastZone.value = 0;
          runOnJS(fireAction)(finalAction);
          return;
        }
        const exitTo =
          translateX.value > 0 ? screenWidth + 80 : -screenWidth - 80;
        if (reducedMotion) {
          translateX.value = exitTo;
          opacity.value = 0;
          rowHeight.value = 0;
          runOnJS(fireAction)(finalAction);
        } else {
          translateX.value = withSpring(exitTo, SPRING_COMMIT);
          opacity.value = withTiming(0, { duration: 220 });
          rowHeight.value = withTiming(0, { duration: 240 }, (finished) => {
            if (finished) runOnJS(fireAction)(finalAction);
          });
        }
      } else {
        if (reducedMotion) {
          translateX.value = 0;
        } else {
          translateX.value = withSpring(0, SPRING_SNAP);
        }
        lastZone.value = 0;
      }
    });

  const tap = Gesture.Tap()
    .maxDuration(250)
    .onEnd((_evt, ok) => {
      if (ok) runOnJS(handlePress)();
    });

  // Long press for accessibility context menu
  const longPress = Gesture.LongPress()
    .minDuration(500)
    .onEnd((_evt, ok) => {
      if (ok) runOnJS(setShowContextMenu)(true);
    });

  const composed = Gesture.Race(
    pan,
    Gesture.Exclusive(longPress, tap),
  );

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

  const rightAction =
    Math.abs(translateX.value) >= SWIPE_THRESHOLDS.LONG
      ? config.rightLong
      : config.rightShort;
  const leftAction =
    Math.abs(translateX.value) >= SWIPE_THRESHOLDS.LONG
      ? config.leftLong
      : config.leftShort;

  const handleContextMenuAction = useCallback(
    (action: ActionKind): void => {
      setShowContextMenu(false);
      if (action === "reply" && onReplySwipe) {
        onReplySwipe(email.id);
        return;
      }
      onAction(email.id, action);
      if ((action === "delete" || action === "archive") && onUndoRequest) {
        onUndoRequest(email.id, action);
      }
    },
    [email.id, onAction, onReplySwipe, onUndoRequest],
  );

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
        <Animated.View
          style={[styles.row, rowStyle]}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Email from ${email.from}: ${email.subject}. ${email.unread ? "Unread." : ""} Received ${email.receivedAt}. Swipe right to reply, swipe left to archive. Long press for more actions.`}
          accessibilityHint="Swipe horizontally for quick actions or long press for menu"
        >
          {/* Flag indicator */}
          {email.flagged ? (
            <View style={styles.flagIndicator}>
              <Text style={styles.flagIcon}>{"\u{1F6A9}"}</Text>
            </View>
          ) : null}

          {/* Unread dot */}
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

          {/* Star indicator */}
          {email.starred ? (
            <View style={styles.starContainer}>
              <Text style={styles.starIcon}>{"\u{2B50}"}</Text>
            </View>
          ) : null}
        </Animated.View>
      </GestureDetector>

      {/* Accessibility context menu overlay */}
      {showContextMenu ? (
        <View style={styles.contextOverlay}>
          <Pressable
            style={styles.contextBackdrop}
            onPress={() => setShowContextMenu(false)}
            accessibilityRole="button"
            accessibilityLabel="Close action menu"
          />
          <View style={styles.contextMenu}>
            <Text style={styles.contextTitle}>Actions</Text>
            {CONTEXT_MENU_ACTIONS.map((action) => (
              <Pressable
                key={action}
                style={styles.contextItem}
                onPress={() => handleContextMenuAction(action)}
                accessibilityRole="button"
                accessibilityLabel={ACTION_LABELS[action]}
              >
                <Text style={styles.contextIcon}>{ACTION_ICONS[action]}</Text>
                <Text style={styles.contextLabel}>{ACTION_LABELS[action]}</Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.contextItem, styles.contextCancel]}
              onPress={() => setShowContextMenu(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.contextCancelLabel}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export const SwipeableInboxRow = memo(SwipeableInboxRowImpl);

// ── Styles ───────────────────────────────────────────────────────────────────

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
  flagIndicator: {
    marginRight: 6,
  },
  flagIcon: {
    fontSize: 12,
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
  starContainer: {
    marginLeft: 8,
  },
  starIcon: {
    fontSize: 14,
  },
  // Context menu styles
  contextOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  contextBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2,6,23,0.7)",
  },
  contextMenu: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 200,
    borderWidth: 1,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  contextTitle: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  contextItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 4,
    minHeight: 44,
  },
  contextIcon: {
    fontSize: 16,
    marginRight: 12,
  },
  contextLabel: {
    color: "#e2e8f0",
    fontSize: 15,
    fontWeight: "500",
  },
  contextCancel: {
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#334155",
  },
  contextCancelLabel: {
    color: "#64748b",
    fontSize: 15,
    fontWeight: "500",
  },
});
