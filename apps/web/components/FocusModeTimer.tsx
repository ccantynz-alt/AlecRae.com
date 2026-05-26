"use client";

/**
 * FocusModeTimer — countdown timer for focus sessions.
 *
 * Allows the user to set a timer ("Focus for 30 minutes") that automatically
 * exits focus mode when it expires. Displays a circular progress ring and
 * remaining time in a minimal format.
 *
 * Preset durations: 15, 30, 45, 60, 90 minutes.
 * Timer ticks every second via a `setInterval` that calls `tickTimer` on the store.
 */

import type { JSX } from "react";
import { useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  fadeInUp,
  scalePopIn,
  SPRING_SNAPPY,
  useAlecRaeReducedMotion,
  withReducedMotion,
} from "../lib/animations";
import { FOCUS_TIMER_PRESETS, useFocusMode } from "../lib/focus-mode";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

function formatPresetLabel(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

// ─── Circular Progress Ring ──────────────────────────────────────────────────

interface ProgressRingProps {
  progress: number; // 0-1
  size: number;
  strokeWidth: number;
}

function ProgressRing({ progress, size, strokeWidth }: ProgressRingProps): JSX.Element {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <svg
      width={size}
      height={size}
      className="transform -rotate-90"
      aria-hidden="true"
    >
      {/* Background track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={strokeWidth}
      />
      {/* Progress arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="url(#focus-timer-gradient)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-[stroke-dashoffset] duration-1000 ease-linear"
      />
      <defs>
        <linearGradient id="focus-timer-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─── Timer Component ─────────────────────────────────────────────────────────

export interface FocusModeTimerProps {
  className?: string;
}

export function FocusModeTimer({ className }: FocusModeTimerProps): JSX.Element {
  const reduced = useAlecRaeReducedMotion();
  const timerDuration = useFocusMode((s) => s.timerDuration);
  const timerRemaining = useFocusMode((s) => s.timerRemaining);
  const timerRunning = useFocusMode((s) => s.timerRunning);
  const startTimer = useFocusMode((s) => s.startTimer);
  const stopTimer = useFocusMode((s) => s.stopTimer);
  const tickTimer = useFocusMode((s) => s.tickTimer);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick the timer every second when running
  useEffect(() => {
    if (timerRunning) {
      intervalRef.current = setInterval(() => {
        tickTimer();
      }, 1000);
    }

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [timerRunning, tickTimer]);

  const handlePresetClick = useCallback(
    (minutes: number) => {
      startTimer(minutes);
    },
    [startTimer],
  );

  const handleStopClick = useCallback(() => {
    stopTimer();
  }, [stopTimer]);

  const isActive = timerRunning && timerDuration !== null && timerRemaining !== null;
  const progress = isActive ? timerRemaining / timerDuration : 0;

  const fadeVariants = withReducedMotion(fadeInUp, reduced);
  const popVariants = withReducedMotion(scalePopIn, reduced);

  return (
    <div className={className} role="timer" aria-label="Focus timer">
      <AnimatePresence mode="wait">
        {isActive ? (
          /* Active timer display */
          <motion.div
            key="timer-active"
            variants={popVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex flex-col items-center gap-3"
          >
            {/* Circular progress ring with time inside */}
            <div className="relative">
              <ProgressRing progress={progress} size={80} strokeWidth={4} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className="text-lg font-mono font-medium text-white tabular-nums"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {formatTime(timerRemaining)}
                </span>
              </div>
            </div>

            {/* Stop button */}
            <motion.button
              type="button"
              onClick={handleStopClick}
              className={[
                "text-xs text-blue-200/60 hover:text-white transition-colors",
                "px-3 py-1 rounded-full border border-white/10 hover:border-white/20",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
              ].join(" ")}
              {...(!reduced ? { whileHover: { scale: 1.05 } } : {})}
              {...(!reduced ? { whileTap: { scale: 0.95 } } : {})}
              transition={SPRING_SNAPPY}
              aria-label="Stop focus timer"
            >
              Stop timer
            </motion.button>
          </motion.div>
        ) : (
          /* Preset selection */
          <motion.div
            key="timer-presets"
            variants={fadeVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex flex-col items-center gap-3"
          >
            <span className="text-xs text-blue-200/50 uppercase tracking-wider font-medium">
              Focus for
            </span>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {FOCUS_TIMER_PRESETS.map((minutes) => (
                <motion.button
                  key={minutes}
                  type="button"
                  onClick={() => handlePresetClick(minutes)}
                  className={[
                    "text-xs font-medium px-3 py-1.5 rounded-full",
                    "bg-white/[0.06] border border-white/10 text-blue-100/80",
                    "hover:bg-white/10 hover:text-white hover:border-white/20",
                    "transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
                  ].join(" ")}
                  {...(!reduced ? { whileHover: { scale: 1.06 } } : {})}
                  {...(!reduced ? { whileTap: { scale: 0.94 } } : {})}
                  transition={SPRING_SNAPPY}
                  aria-label={`Focus for ${minutes} minutes`}
                >
                  {formatPresetLabel(minutes)}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
