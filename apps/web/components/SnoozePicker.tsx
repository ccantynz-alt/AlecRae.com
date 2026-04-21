"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_BOUNCY, useAlecRaeReducedMotion } from "../lib/animations";

export interface SnoozePickerProps {
  open: boolean;
  onSnooze: (until: Date) => void;
  onClose: () => void;
}

function getPresets(): Array<{ label: string; time: Date }> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const laterToday = new Date(today);
  laterToday.setHours(now.getHours() + 3);
  if (laterToday.getHours() >= 20) {
    laterToday.setDate(laterToday.getDate() + 1);
    laterToday.setHours(8, 0, 0, 0);
  }

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);

  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + ((8 - nextWeek.getDay()) % 7 || 7));
  nextWeek.setHours(8, 0, 0, 0);

  const weekend = new Date(today);
  const daysUntilSat = (6 - weekend.getDay() + 7) % 7 || 7;
  weekend.setDate(weekend.getDate() + daysUntilSat);
  weekend.setHours(9, 0, 0, 0);

  return [
    { label: "Later today", time: laterToday },
    { label: "Tomorrow morning", time: tomorrow },
    { label: "This weekend", time: weekend },
    { label: "Next week", time: nextWeek },
  ];
}

function formatPresetTime(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SnoozePicker({
  open,
  onSnooze,
  onClose,
}: SnoozePickerProps): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("08:00");
  const presets = getPresets();

  const handleCustomSnooze = (): void => {
    if (!customDate) return;
    const [year, month, day] = customDate.split("-").map(Number);
    const [hours, minutes] = customTime.split(":").map(Number);
    if (year === undefined || month === undefined || day === undefined) return;
    const date = new Date(year, month - 1, day, hours ?? 8, minutes ?? 0);
    if (date > new Date()) {
      onSnooze(date);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] bg-black/20"
            onClick={onClose}
          />
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -8 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -8 }}
            transition={SPRING_BOUNCY}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[151] w-80 bg-surface rounded-xl border border-border shadow-2xl overflow-hidden"
            role="dialog"
            aria-label="Snooze email"
          >
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold text-content">Snooze until...</p>
            </div>

            <div className="p-2">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onSnooze(preset.time)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left hover:bg-surface-secondary transition-colors"
                >
                  <span className="text-sm font-medium text-content">{preset.label}</span>
                  <span className="text-xs text-content-tertiary">{formatPresetTime(preset.time)}</span>
                </button>
              ))}
            </div>

            <div className="border-t border-border p-3">
              <p className="text-xs font-medium text-content-secondary mb-2">Custom date & time</p>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="flex-1 px-2 py-1.5 text-xs rounded-md border border-border bg-surface text-content focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
                <input
                  type="time"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  className="w-24 px-2 py-1.5 text-xs rounded-md border border-border bg-surface text-content focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCustomSnooze}
                  disabled={!customDate}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-brand-600 rounded-md hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Set
                </button>
              </div>
            </div>

            <div className="border-t border-border px-4 py-2">
              <button
                type="button"
                onClick={onClose}
                className="w-full text-center text-xs text-content-tertiary hover:text-content transition-colors py-1"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
