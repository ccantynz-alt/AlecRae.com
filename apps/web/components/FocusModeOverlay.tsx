"use client";

/**
 * FocusModeOverlay — full-screen distraction-free email view.
 *
 * When focus mode is active, this overlay covers the entire app surface
 * (sidebar, search bar, toolbar — all hidden). Only the filtered list of
 * emails is rendered, plus a small "Focus Mode" badge in the corner that
 * the user can click to disable.
 *
 * The aesthetic matches the Vienna landing page: dark gradient, ambient
 * blurred blobs, translucent surfaces, white-on-blue typography.
 */

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import {
  fadeIn,
  modalEnter,
  SPRING_SOFT,
  useViennaReducedMotion,
  withReducedMotion,
} from "../lib/animations";
import { useFocusMode } from "../lib/focus-mode";

export interface FocusModeOverlayProps {
  /** The filtered list of emails to render inside the overlay. */
  children: ReactNode;
  /** Optional label override for the badge. */
  badgeLabel?: string;
}

export function FocusModeOverlay({
  children,
  badgeLabel = "Focus Mode",
}: FocusModeOverlayProps): JSX.Element {
  const active = useFocusMode((s) => s.active);
  const filteredOutCount = useFocusMode((s) => s.filteredOutCount);
  const disable = useFocusMode((s) => s.disableFocusMode);
  const reduced = useViennaReducedMotion();

  const overlayVariants = withReducedMotion(fadeIn, reduced);
  const contentVariants = withReducedMotion(modalEnter, reduced);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="focus-overlay"
          className="fixed inset-0 z-[100] flex flex-col bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white"
          variants={overlayVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          role="dialog"
          aria-modal="true"
          aria-label="Focus Mode"
        >
          {/* Ambient blurred gradient blobs (matches landing page aesthetic) */}
          <div className="fixed inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
            <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
          </div>

          {/* Focus Mode badge — top right corner */}
          <motion.button
            type="button"
            onClick={() => void disable()}
            className="absolute top-6 right-6 z-10 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/15 transition-colors"
            initial={reduced ? false : { opacity: 0, y: -8 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            transition={SPRING_SOFT}
            aria-label="Disable focus mode"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
            </span>
            <span className="text-xs font-medium text-blue-100 tracking-wide uppercase">
              {badgeLabel}
            </span>
            {filteredOutCount > 0 && (
              <span className="text-xs text-blue-200/70 font-light">
                · {filteredOutCount} hidden
              </span>
            )}
          </motion.button>

          {/* Minimal email list area */}
          <motion.div
            className="relative z-[1] flex-1 overflow-y-auto px-6 md:px-12 lg:px-24 pt-24 pb-12"
            variants={contentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="max-w-3xl mx-auto">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
