/**
 * AlecRae Mobile — MiniCalendar
 *
 * Compact 30-day forward calendar grid used as a drop target for the
 * drag-to-snooze interaction. Each cell exposes its layout (page-relative
 * x/y/w/h) via onLayoutCells, so the parent SnoozeMenu can hit-test the
 * dragged email card against absolute screen coordinates without coupling
 * to gesture-handler internals.
 *
 * Design notes:
 *   - 7-column grid, weeks roll forward from "today"
 *   - Today highlighted with cyan accent
 *   - Weekends rendered subtly muted
 *   - Active drop target highlighted via `hoveredKey`
 *   - Pure presentation: no gesture logic lives here
 */

import React, { useCallback, useMemo, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type View as RNView,
} from "react-native";

export interface CalendarCellLayout {
  key: string;
  date: Date;
  pageX: number;
  pageY: number;
  width: number;
  height: number;
}

export interface MiniCalendarProps {
  /** Number of forward days to show (default 30). */
  days?: number;
  /** Key (yyyy-mm-dd) of the cell currently being hovered by a drag. */
  hoveredKey?: string | null;
  /** Selected date key (post-drop confirmation). */
  selectedKey?: string | null;
  /** Fired once after layout with absolute coordinates of every cell. */
  onLayoutCells?: (cells: CalendarCellLayout[]) => void;
  /** Tap fallback (non-drag selection). */
  onSelectDate?: (date: Date) => void;
  /** Marks each cell as a drop target — purely informational flag. */
  acceptsDrop?: boolean;
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildDates(days: number): Date[] {
  const out: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push(d);
  }
  return out;
}

export function MiniCalendar({
  days = 30,
  hoveredKey = null,
  selectedKey = null,
  onLayoutCells,
  onSelectDate,
  acceptsDrop: _acceptsDrop = true,
}: MiniCalendarProps): React.ReactElement {
  const dates = useMemo(() => buildDates(days), [days]);
  const todayKey = useMemo(() => dateKey(new Date()), []);

  // Stash refs + a counter so we can emit cell layouts once they're all known.
  const cellRefs = useRef<Map<string, RNView | null>>(new Map());
  const measured = useRef<Map<string, CalendarCellLayout>>(new Map());

  const handleCellLayout = useCallback(
    (key: string, date: Date) =>
      (_e: LayoutChangeEvent): void => {
        const node = cellRefs.current.get(key);
        if (!node) return;
        node.measureInWindow((x, y, w, h) => {
          measured.current.set(key, {
            key,
            date,
            pageX: x,
            pageY: y,
            width: w,
            height: h,
          });
          if (measured.current.size === dates.length && onLayoutCells) {
            onLayoutCells(Array.from(measured.current.values()));
          }
        });
      },
    [dates.length, onLayoutCells],
  );

  return (
    <View style={styles.container}>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <Text key={`${label}-${i}`} style={styles.weekdayLabel}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {dates.map((date) => {
          const key = dateKey(date);
          const isToday = key === todayKey;
          const isHovered = key === hoveredKey;
          const isSelected = key === selectedKey;
          const dow = date.getDay();
          const isWeekend = dow === 0 || dow === 6;

          return (
            <View
              key={key}
              ref={(node): void => {
                cellRefs.current.set(key, node);
              }}
              onLayout={handleCellLayout(key, date)}
              style={[
                styles.cell,
                isWeekend && styles.cellWeekend,
                isToday && styles.cellToday,
                isHovered && styles.cellHovered,
                isSelected && styles.cellSelected,
              ]}
              onTouchEnd={(): void => onSelectDate?.(date)}
            >
              <Text
                style={[
                  styles.cellDayName,
                  isWeekend && styles.cellTextMuted,
                  (isToday || isHovered || isSelected) && styles.cellTextActive,
                ]}
              >
                {date.toLocaleDateString(undefined, { weekday: "short" })}
              </Text>
              <Text
                style={[
                  styles.cellDate,
                  isWeekend && styles.cellTextMuted,
                  (isToday || isHovered || isSelected) && styles.cellTextActive,
                ]}
              >
                {date.getDate()}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
  },
  weekdayRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 8,
  },
  weekdayLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
    width: 32,
    textAlign: "center",
    letterSpacing: 1,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  cell: {
    width: 40,
    aspectRatio: 0.85,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  cellWeekend: {
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  cellToday: {
    borderColor: "#22d3ee",
  },
  cellHovered: {
    backgroundColor: "#0891b2",
    borderColor: "#22d3ee",
    transform: [{ scale: 1.06 }],
  },
  cellSelected: {
    backgroundColor: "#06b6d4",
    borderColor: "#22d3ee",
  },
  cellDayName: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cellDate: {
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 2,
  },
  cellTextMuted: {
    color: "#475569",
  },
  cellTextActive: {
    color: "#ffffff",
  },
});
