"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useAlecRaeReducedMotion } from "../lib/animations";

export function OfflineComposeBanner(): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const [isOnline, setIsOnline] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    const handleOnline = (): void => { setIsOnline(true); setDismissed(false); };
    const handleOffline = (): void => { setIsOnline(false); setDismissed(false); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
        className="flex items-center gap-3 px-4 py-2.5 bg-yellow-50 border-b border-yellow-200 text-sm text-yellow-800"
        role="status"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0" aria-hidden="true">
          <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="flex-1">
          You are offline. Your email will be queued and sent automatically when you reconnect.
        </span>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="flex-shrink-0 text-yellow-600 hover:text-yellow-800 transition-colors"
          aria-label="Dismiss"
        >
          &#10005;
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

export function useOnlineStatus(): boolean {
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

  return isOnline;
}
