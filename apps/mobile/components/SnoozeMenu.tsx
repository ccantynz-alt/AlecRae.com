/**
 * AlecRae Mobile — SnoozeMenu
 *
 * Bottom sheet that hosts:
 *   1. Quick presets ("Later today", "Tomorrow morning", "This weekend", "Next week")
 *   2. A 30-day MiniCalendar drop grid
 *   3. A draggable email card the user can drop onto a date
 *   4. A time picker that appears once a date is chosen
 *
 * The drag interaction uses a Pan gesture on the email card. As the finger
 * moves, we hit-test the absolute drop coordinates against the cell layouts
 * MiniCalendar reports back via onLayoutCells. The hovered cell is highlighted
 * (with a haptic tick on transitions). On release over a valid cell we
 * commit the date selection, surface the time picker, and snap the card back.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import {
  MiniCalendar,
  dateKey,
  type CalendarCellLayout,
} from "./MiniCalendar";
import { SPRING_SHEET, SPRING_SNAP } from "../lib/gestures";
import { lightTap, mediumTap, success } from "../lib/haptics";

export interface SnoozePreset {
  label: string;
  compute: () => Date;
}

const DEFAULT_PRESETS: SnoozePreset[] = [
  {
    label: "Later today",
    compute: (): Date => {
      const d = new Date();
      d.setHours(d.getHours() + 3, 0, 0, 0);
      return d;
    },
  },
  {
    label: "Tomorrow morning",
    compute: (): Date => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(8, 0, 0, 0);
      return d;
    },
  },
  {
    label: "This weekend",
    compute: (): Date => {
      const d = new Date();
      const dow = d.getDay();
      const offset = dow <= 6 ? 6 - dow : 6;
      d.setDate(d.getDate() + Math.max(offset, 1));
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    label: "Next week",
    compute: (): Date => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      d.setHours(8, 0, 0, 0);
      return d;
    },
  },
];

export interface SnoozeMenuProps {
  visible: boolean;
  emailSubject: string;
  emailFrom: string;
  onDismiss: () => void;
  onConfirm: (snoozeUntil: Date) => void;
}

const TIME_PRESETS: { label: string; hour: number }[] = [
  { label: "8:00 AM", hour: 8 },
  { label: "12:00 PM", hour: 12 },
  { label: "3:00 PM", hour: 15 },
  { label: "6:00 PM", hour: 18 },
];

export function SnoozeMenu({
  visible,
  emailSubject,
  emailFrom,
  onDismiss,
  onConfirm,
}: SnoozeMenuProps): React.ReactElement | null {
  const { height: screenHeight } = useWindowDimensions();
  const cardSlotRef = useRef<View>(null);
  const sheetY = useSharedValue(screenHeight);

  // Drag state for the email card.
  const cardX = useSharedValue(0);
  const cardY = useSharedValue(0);
  const cardScale = useSharedValue(1);
  const cardOriginX = useRef(0);
  const cardOriginY = useRef(0);

  const [cellLayouts, setCellLayouts] = useState<CalendarCellLayout[]>([]);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [pickedDate, setPickedDate] = useState<Date | null>(null);

  // Open/close animation.
  React.useEffect(() => {
    if (visible) {
      sheetY.value = withSpring(0, SPRING_SHEET);
    } else {
      sheetY.value = withTiming(screenHeight, { duration: 220 });
      setPickedDate(null);
      setHoveredKey(null);
    }
  }, [visible, screenHeight, sheetY]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cardX.value },
      { translateY: cardY.value },
      { scale: cardScale.value },
    ],
  }));

  const hitTest = useCallback(
    (absX: number, absY: number): CalendarCellLayout | null => {
      for (const cell of cellLayouts) {
        if (
          absX >= cell.pageX &&
          absX <= cell.pageX + cell.width &&
          absY >= cell.pageY &&
          absY <= cell.pageY + cell.height
        ) {
          return cell;
        }
      }
      return null;
    },
    [cellLayouts],
  );

  const onHoverChange = useCallback(
    (key: string | null) => {
      setHoveredKey((prev) => {
        if (prev !== key && key !== null) {
          void lightTap();
        }
        return key;
      });
    },
    [],
  );

  const handleDrop = useCallback(
    (date: Date | null): void => {
      if (date) {
        void mediumTap();
        setPickedDate(date);
      }
    },
    [],
  );

  const cardPan = Gesture.Pan()
    .onStart(() => {
      cardScale.value = withSpring(1.05, SPRING_SNAP);
    })
    .onUpdate((evt) => {
      cardX.value = evt.translationX;
      cardY.value = evt.translationY;
      const absX = cardOriginX.current + evt.translationX + 140; // approx card center
      const absY = cardOriginY.current + evt.translationY + 36;
      const hit = hitTest(absX, absY);
      const key = hit ? hit.key : null;
      runOnJS(onHoverChange)(key);
    })
    .onEnd((evt) => {
      const absX = cardOriginX.current + evt.translationX + 140;
      const absY = cardOriginY.current + evt.translationY + 36;
      const hit = hitTest(absX, absY);
      cardX.value = withSpring(0, SPRING_SNAP);
      cardY.value = withSpring(0, SPRING_SNAP);
      cardScale.value = withSpring(1, SPRING_SNAP);
      runOnJS(handleDrop)(hit ? hit.date : null);
      runOnJS(onHoverChange)(null);
    });

  const handlePresetTap = useCallback(
    (preset: SnoozePreset): void => {
      void success();
      onConfirm(preset.compute());
    },
    [onConfirm],
  );

  const handleTimeSelect = useCallback(
    (hour: number): void => {
      if (!pickedDate) return;
      const final = new Date(pickedDate);
      final.setHours(hour, 0, 0, 0);
      void success();
      onConfirm(final);
    },
    [pickedDate, onConfirm],
  );

  const presets = useMemo(() => DEFAULT_PRESETS, []);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onDismiss} />

      <Animated.View style={[styles.sheet, sheetStyle]}>
        <View style={styles.handle} />

        <Text style={styles.title}>Snooze until</Text>

        {/* Quick presets */}
        <View style={styles.presetRow}>
          {presets.map((preset) => (
            <Pressable
              key={preset.label}
              style={styles.preset}
              onPress={(): void => handlePresetTap(preset)}
            >
              <Text style={styles.presetLabel}>{preset.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Or drag onto a day</Text>

        {/* Draggable email card */}
        <View
          style={styles.cardSlot}
          ref={cardSlotRef}
          onLayout={(): void => {
            // Capture absolute origin for hit-testing.
            cardSlotRef.current?.measureInWindow(
              (x: number, y: number) => {
                cardOriginX.current = x;
                cardOriginY.current = y;
              },
            );
          }}
        >
          <GestureDetector gesture={cardPan}>
            <Animated.View style={[styles.card, cardStyle]}>
              <Text style={styles.cardFrom} numberOfLines={1}>
                {emailFrom}
              </Text>
              <Text style={styles.cardSubject} numberOfLines={1}>
                {emailSubject}
              </Text>
              <Text style={styles.cardHint}>Drag to a date below</Text>
            </Animated.View>
          </GestureDetector>
        </View>

        {/* Mini calendar grid */}
        <MiniCalendar
          days={30}
          hoveredKey={hoveredKey}
          selectedKey={pickedDate ? dateKey(pickedDate) : null}
          onLayoutCells={setCellLayouts}
          onSelectDate={setPickedDate}
        />

        {/* Time picker — appears after a date is chosen */}
        {pickedDate ? (
          <View style={styles.timePicker}>
            <Text style={styles.timePickerLabel}>
              {pickedDate.toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </Text>
            <View style={styles.timeRow}>
              {TIME_PRESETS.map((t) => (
                <Pressable
                  key={t.label}
                  style={styles.timeChip}
                  onPress={(): void => handleTimeSelect(t.hour)}
                >
                  <Text style={styles.timeChipLabel}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2,6,23,0.6)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 32,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: "#1e293b",
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#334155",
    marginBottom: 16,
  },
  title: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  preset: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  presetLabel: {
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: "600",
  },
  sectionLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  cardSlot: {
    height: 80,
    marginBottom: 16,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  cardFrom: {
    color: "#22d3ee",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2,
  },
  cardSubject: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  cardHint: {
    color: "#64748b",
    fontSize: 11,
  },
  timePicker: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#1e293b",
  },
  timePickerLabel: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  timeRow: {
    flexDirection: "row",
    gap: 8,
  },
  timeChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(34,211,238,0.1)",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.3)",
    alignItems: "center",
  },
  timeChipLabel: {
    color: "#22d3ee",
    fontSize: 13,
    fontWeight: "700",
  },
});
