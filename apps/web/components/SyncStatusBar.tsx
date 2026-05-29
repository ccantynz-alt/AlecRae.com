"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_BOUNCY, useAlecRaeReducedMotion } from "../lib/animations";

export interface SyncStatusBarProps {
  isOnline: boolean;
  isSyncing: boolean;
  pendingOutbox: number;
  lastSyncAt: Date | null;
  error: string | null;
  onSyncNow?: () => void;
}

function formatLastSync(date: Date | null): string {
  if (!date) return "Never synced";
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 10) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function SyncStatusBar({
  isOnline,
  isSyncing,
  pendingOutbox,
  lastSyncAt,
  error,
  onSyncNow,
}: SyncStatusBarProps): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const [lastSyncLabel, setLastSyncLabel] = useState("Never synced");

  useEffect(() => {
    setLastSyncLabel(formatLastSync(lastSyncAt));
    const interval = setInterval(() => {
      setLastSyncLabel(formatLastSync(lastSyncAt));
    }, 10000);
    return () => clearInterval(interval);
  }, [lastSyncAt]);

  return (
    <AnimatePresence>
      {(!isOnline || isSyncing || pendingOutbox > 0 || error) && (
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={SPRING_BOUNCY}
          className={`flex items-center gap-3 px-4 py-2 text-xs font-medium border-b ${
            !isOnline
              ? "bg-yellow-50 text-yellow-800 border-yellow-200"
              : error
                ? "bg-red-50 text-red-800 border-red-200"
                : isSyncing
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-orange-50 text-orange-700 border-orange-200"
          }`}
          role="status"
          aria-live="polite"
        >
          {!isOnline ? (
            <>
              <OfflineIcon />
              <span>You are offline. Changes will sync when you reconnect.</span>
            </>
          ) : error ? (
            <>
              <ErrorIcon />
              <span className="flex-1 truncate">Sync error: {error}</span>
              {onSyncNow && (
                <button
                  type="button"
                  onClick={onSyncNow}
                  className="flex-shrink-0 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 rounded transition-colors"
                >
                  Retry
                </button>
              )}
            </>
          ) : isSyncing ? (
            <>
              <SyncIcon />
              <span>Syncing emails...</span>
            </>
          ) : pendingOutbox > 0 ? (
            <>
              <OutboxIcon />
              <span>
                {pendingOutbox} email{pendingOutbox !== 1 ? "s" : ""} waiting to send
              </span>
              {onSyncNow && (
                <button
                  type="button"
                  onClick={onSyncNow}
                  className="flex-shrink-0 px-2 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-100 rounded transition-colors"
                >
                  Send now
                </button>
              )}
            </>
          ) : null}

          <span className="ml-auto text-xs opacity-70 flex-shrink-0">
            Last sync: {lastSyncLabel}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function OfflineBadge(): React.ReactNode {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    const handleOnline = (): void => setIsOnline(true);
    const handleOffline = (): void => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
      Offline
    </span>
  );
}

function OfflineIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0" aria-hidden="true">
      <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SyncIcon(): React.ReactNode {
  return (
    <motion.svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="flex-shrink-0"
      aria-hidden="true"
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
    >
      <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
    </motion.svg>
  );
}

function ErrorIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
    </svg>
  );
}

function OutboxIcon(): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0" aria-hidden="true">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
