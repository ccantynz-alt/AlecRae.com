"use client";

/**
 * SnoozeCalendar — Mini calendar drop-target for drag-to-snooze (A6).
 *
 * Shows a compact month-view calendar where each day cell is a drop zone.
 * Dropping an email on a day opens a time-slot picker (morning, noon,
 * afternoon, evening, custom). Quick presets above the calendar cover
 * common snooze patterns.
 *
 * Fully accessible: keyboard navigable, ARIA grid semantics, screen-reader
 * labels, reduced-motion support, disabled past dates.
 */

import {
  forwardRef,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";

// ─── Types ─────────────────────────────────────────────────────────────────

export type SnoozeTimeSlot = "morning" | "noon" | "afternoon" | "evening" | "custom";

export interface SnoozePreset {
  label: string;
  getDatetime: () => Date;
}

export interface SnoozeCalendarProps {
  /** Fires when the user completes a snooze action (drop + time pick). */
  onSnooze: (emailId: string, datetime: Date) => void;
  /** Whether the calendar is in "receiving drag" state. */
  isDragActive?: boolean;
  /** Currently dragged email ID (set via drag data). */
  dragEmailId?: string;
  /** Additional CSS classes. */
  className?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

const TIME_SLOTS: ReadonlyArray<{ slot: SnoozeTimeSlot; label: string; hour: number; minute: number }> = [
  { slot: "morning", label: "Morning (8:00 AM)", hour: 8, minute: 0 },
  { slot: "noon", label: "Noon (12:00 PM)", hour: 12, minute: 0 },
  { slot: "afternoon", label: "Afternoon (3:00 PM)", hour: 15, minute: 0 },
  { slot: "evening", label: "Evening (6:00 PM)", hour: 18, minute: 0 },
] as const;

// ─── Helpers ───────────────────────────────────────────────────────────────

function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Pad start of month to align with weekday grid
  const startPad = firstDay.getDay();
  for (let i = startPad - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push(d);
  }

  // Days of the month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }

  // Pad end to complete the last week row
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i));
    }
  }

  return days;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isPast(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const check = new Date(date);
  check.setHours(0, 0, 0, 0);
  return check < today;
}

function formatMonthYear(year: number, month: number): string {
  const d = new Date(year, month, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getQuickPresets(): SnoozePreset[] {
  const now = new Date();
  const presets: SnoozePreset[] = [];

  // Later today (6 PM or +3h if after 3 PM)
  const laterToday = new Date(now);
  if (now.getHours() < 15) {
    laterToday.setHours(18, 0, 0, 0);
  } else {
    laterToday.setHours(laterToday.getHours() + 3, 0, 0, 0);
  }
  if (laterToday.getDate() === now.getDate()) {
    presets.push({ label: "Later today", getDatetime: () => laterToday });
  }

  // Tomorrow morning 8 AM
  const tomorrowMorning = new Date(now);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(8, 0, 0, 0);
  presets.push({ label: "Tomorrow morning", getDatetime: () => tomorrowMorning });

  // Next Monday 8 AM
  const nextMonday = new Date(now);
  const daysUntilMonday = ((1 - nextMonday.getDay()) + 7) % 7 || 7;
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
  nextMonday.setHours(8, 0, 0, 0);
  presets.push({ label: "Next Monday", getDatetime: () => nextMonday });

  // Next week (7 days) 8 AM
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(8, 0, 0, 0);
  presets.push({ label: "Next week", getDatetime: () => nextWeek });

  return presets;
}

// ─── DayCell sub-component ─────────────────────────────────────────────────

interface DayCellProps {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isDisabled: boolean;
  isDragOver: boolean;
  onDragOver: (e: DragEvent<HTMLButtonElement>) => void;
  onDragEnter: (e: DragEvent<HTMLButtonElement>) => void;
  onDragLeave: (e: DragEvent<HTMLButtonElement>) => void;
  onDrop: (e: DragEvent<HTMLButtonElement>) => void;
  onClick: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}

function DayCell({
  date,
  isCurrentMonth,
  isToday,
  isDisabled,
  isDragOver,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onClick,
  onKeyDown,
}: DayCellProps): React.ReactNode {
  const dayNum = date.getDate();

  const baseClasses = [
    "w-9 h-9 rounded-lg text-center text-sm font-medium",
    "transition-all duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1",
  ].join(" ");

  const stateClasses = isDisabled
    ? "text-content-tertiary/40 cursor-not-allowed"
    : isDragOver
      ? "bg-brand-500 text-white scale-110 shadow-lg ring-2 ring-brand-300"
      : isToday
        ? "bg-brand-100 text-brand-700 font-bold ring-1 ring-brand-300"
        : isCurrentMonth
          ? "text-content hover:bg-surface-tertiary cursor-pointer"
          : "text-content-tertiary/50 hover:bg-surface-tertiary/50 cursor-pointer";

  return (
    <Box
      as="button"
      type="button"
      role="gridcell"
      aria-label={date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      aria-disabled={isDisabled}
      aria-current={isToday ? "date" : undefined}
      className={`${baseClasses} ${stateClasses}`}
      disabled={isDisabled}
      onDragOver={isDisabled ? undefined : onDragOver}
      onDragEnter={isDisabled ? undefined : onDragEnter}
      onDragLeave={isDisabled ? undefined : onDragLeave}
      onDrop={isDisabled ? undefined : onDrop}
      onClick={isDisabled ? undefined : onClick}
      onKeyDown={isDisabled ? undefined : onKeyDown}
    >
      {dayNum}
    </Box>
  );
}

// ─── TimePicker sub-component ──────────────────────────────────────────────

interface TimePickerProps {
  selectedDate: Date;
  onSelectTime: (datetime: Date) => void;
  onCancel: () => void;
}

function TimePicker({ selectedDate, onSelectTime, onCancel }: TimePickerProps): React.ReactNode {
  const [customHour, setCustomHour] = useState("09");
  const [customMinute, setCustomMinute] = useState("00");
  const firstBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstBtnRef.current?.focus();
  }, []);

  const handleSlotClick = useCallback(
    (hour: number, minute: number): void => {
      const dt = new Date(selectedDate);
      dt.setHours(hour, minute, 0, 0);
      onSelectTime(dt);
    },
    [selectedDate, onSelectTime],
  );

  const handleCustomSubmit = useCallback((): void => {
    const h = parseInt(customHour, 10);
    const m = parseInt(customMinute, 10);
    if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return;
    const dt = new Date(selectedDate);
    dt.setHours(h, m, 0, 0);
    onSelectTime(dt);
  }, [selectedDate, customHour, customMinute, onSelectTime]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [onCancel],
  );

  const dateLabel = selectedDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <Box
      role="dialog"
      aria-label={`Pick snooze time for ${dateLabel}`}
      onKeyDown={handleKeyDown}
      className="p-3 border border-brand-200 bg-surface rounded-lg shadow-lg space-y-2"
    >
      <Box className="flex items-center justify-between mb-1">
        <Text variant="label" className="text-brand-700">
          Snooze until {dateLabel}
        </Text>
        <Button variant="ghost" size="sm" onClick={onCancel} aria-label="Cancel time selection">
          Cancel
        </Button>
      </Box>

      <Box className="space-y-1">
        {TIME_SLOTS.map((ts, i) => (
          <Button
            key={ts.slot}
            ref={i === 0 ? firstBtnRef : undefined}
            variant="ghost"
            size="sm"
            className="w-full justify-start text-left"
            onClick={() => handleSlotClick(ts.hour, ts.minute)}
            aria-label={`Snooze until ${dateLabel} at ${ts.label}`}
          >
            {ts.label}
          </Button>
        ))}
      </Box>

      <Box className="border-t border-border pt-2">
        <Text variant="caption" className="mb-1 block">
          Custom time
        </Text>
        <Box className="flex items-center gap-2">
          <Box
            as="input"
            type="number"
            min={0}
            max={23}
            value={customHour}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomHour(e.target.value)}
            className="w-14 h-8 px-2 text-sm border border-border rounded-md bg-surface text-content text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
            aria-label="Hour (0-23)"
          />
          <Text as="span" variant="body-sm" className="font-bold">
            :
          </Text>
          <Box
            as="input"
            type="number"
            min={0}
            max={59}
            value={customMinute}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomMinute(e.target.value)}
            className="w-14 h-8 px-2 text-sm border border-border rounded-md bg-surface text-content text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
            aria-label="Minute (0-59)"
          />
          <Button variant="primary" size="sm" onClick={handleCustomSubmit} aria-label="Confirm custom snooze time">
            Set
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export const SnoozeCalendar = forwardRef<HTMLDivElement, SnoozeCalendarProps>(
  function SnoozeCalendar({ onSnooze, isDragActive = false, dragEmailId, className = "" }, ref) {
    const today = useMemo(() => new Date(), []);
    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [dragOverDate, setDragOverDate] = useState<Date | null>(null);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [pendingEmailId, setPendingEmailId] = useState<string | null>(null);

    const days = useMemo(() => getMonthDays(viewYear, viewMonth), [viewYear, viewMonth]);
    const presets = useMemo(() => getQuickPresets(), []);

    const navigateMonth = useCallback((delta: number): void => {
      setViewMonth((prev) => {
        const newMonth = prev + delta;
        if (newMonth < 0) {
          setViewYear((y) => y - 1);
          return 11;
        }
        if (newMonth > 11) {
          setViewYear((y) => y + 1);
          return 0;
        }
        return newMonth;
      });
    }, []);

    const handleDragOver = useCallback((e: DragEvent<HTMLButtonElement>): void => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }, []);

    const handleDragEnter = useCallback((date: Date) => (e: DragEvent<HTMLButtonElement>): void => {
      e.preventDefault();
      setDragOverDate(date);
    }, []);

    const handleDragLeave = useCallback((_e: DragEvent<HTMLButtonElement>): void => {
      // Only clear if we're leaving the cell entirely (not entering a child)
      // The next dragEnter will set the correct date
    }, []);

    const handleDrop = useCallback(
      (date: Date) => (e: DragEvent<HTMLButtonElement>): void => {
        e.preventDefault();
        setDragOverDate(null);

        const emailId = e.dataTransfer.getData("application/x-vienna-email-id") || dragEmailId;
        if (!emailId) return;

        setSelectedDate(date);
        setPendingEmailId(emailId);
      },
      [dragEmailId],
    );

    const handleDayClick = useCallback(
      (date: Date): void => {
        if (isDragActive && dragEmailId) {
          setSelectedDate(date);
          setPendingEmailId(dragEmailId);
        }
      },
      [isDragActive, dragEmailId],
    );

    const handleDayKeyDown = useCallback(
      (date: Date) => (e: KeyboardEvent<HTMLButtonElement>): void => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleDayClick(date);
        }
      },
      [handleDayClick],
    );

    const handleTimeSelected = useCallback(
      (datetime: Date): void => {
        if (pendingEmailId) {
          onSnooze(pendingEmailId, datetime);
        }
        setSelectedDate(null);
        setPendingEmailId(null);
      },
      [pendingEmailId, onSnooze],
    );

    const handleTimeCancel = useCallback((): void => {
      setSelectedDate(null);
      setPendingEmailId(null);
    }, []);

    const handlePresetClick = useCallback(
      (preset: SnoozePreset): void => {
        const emailId = dragEmailId;
        if (!emailId) return;
        onSnooze(emailId, preset.getDatetime());
      },
      [dragEmailId, onSnooze],
    );

    // Handle keyboard snooze shortcut: S key opens calendar for selected email
    const handlePresetKeyDown = useCallback(
      (preset: SnoozePreset) => (e: KeyboardEvent<HTMLButtonElement>): void => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handlePresetClick(preset);
        }
      },
      [handlePresetClick],
    );

    return (
      <Box
        ref={ref}
        role="region"
        aria-label="Snooze calendar — drop email on a day to snooze"
        className={`select-none ${className}`}
      >
        {/* Quick presets */}
        {isDragActive && (
          <Box className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Quick snooze presets">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                variant="secondary"
                size="sm"
                onClick={() => handlePresetClick(preset)}
                onKeyDown={handlePresetKeyDown(preset)}
                className="text-xs"
                aria-label={`Snooze until ${preset.label}`}
              >
                {preset.label}
              </Button>
            ))}
          </Box>
        )}

        {/* Month navigation */}
        <Box className="flex items-center justify-between mb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigateMonth(-1)}
            aria-label="Previous month"
          >
            <Text as="span" variant="body-sm" aria-hidden="true">
              &#8249;
            </Text>
          </Button>
          <Text variant="label" aria-live="polite">
            {formatMonthYear(viewYear, viewMonth)}
          </Text>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigateMonth(1)}
            aria-label="Next month"
          >
            <Text as="span" variant="body-sm" aria-hidden="true">
              &#8250;
            </Text>
          </Button>
        </Box>

        {/* Weekday headers */}
        <Box
          className="grid grid-cols-7 gap-0.5 mb-1"
          role="row"
          aria-label="Days of the week"
        >
          {WEEKDAY_LABELS.map((label) => (
            <Box key={label} className="flex items-center justify-center h-8" role="columnheader">
              <Text variant="caption" className="font-semibold text-content-tertiary">
                {label}
              </Text>
            </Box>
          ))}
        </Box>

        {/* Day grid */}
        <Box className="grid grid-cols-7 gap-0.5" role="grid" aria-label="Calendar days">
          {days.map((date, idx) => {
            const isCurrentMonth = date.getMonth() === viewMonth;
            const isToday_ = isSameDay(date, today);
            const isDisabled = isPast(date) && !isToday_;
            const isDragOverThis = dragOverDate !== null && isSameDay(date, dragOverDate);

            return (
              <DayCell
                key={idx}
                date={date}
                isCurrentMonth={isCurrentMonth}
                isToday={isToday_}
                isDisabled={isDisabled}
                isDragOver={isDragOverThis}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter(date)}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop(date)}
                onClick={() => handleDayClick(date)}
                onKeyDown={handleDayKeyDown(date)}
              />
            );
          })}
        </Box>

        {/* Time picker (appears when a day is selected) */}
        {selectedDate !== null && (
          <Box className="mt-3">
            <TimePicker
              selectedDate={selectedDate}
              onSelectTime={handleTimeSelected}
              onCancel={handleTimeCancel}
            />
          </Box>
        )}
      </Box>
    );
  },
);

SnoozeCalendar.displayName = "SnoozeCalendar";
