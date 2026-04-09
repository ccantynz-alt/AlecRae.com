"use client";

/**
 * AnimatedCompose — compose window with slide-up entrance animation.
 *
 * Wraps the compose editor in a full-height motion.div that slides up from
 * the bottom with spring physics. Includes a semi-transparent backdrop
 * when used as a modal overlay. Can also be used inline (no backdrop).
 */

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import {
  composeBackdrop,
  composeEnter,
  useViennaReducedMotion,
  withReducedMotion,
} from "../lib/animations";

export interface AnimatedComposeProps {
  children: ReactNode;
  /** Whether the compose window is visible. */
  show: boolean;
  /** Render as a modal overlay with backdrop. Default: false. */
  asModal?: boolean;
  /** Called when the backdrop is clicked (modal mode only). */
  onClose?: () => void;
  /** Extra CSS classes on the compose container. */
  className?: string;
}

export function AnimatedCompose({
  children,
  show,
  asModal = false,
  onClose,
  className,
}: AnimatedComposeProps): React.ReactNode {
  const reduced = useViennaReducedMotion();
  const contentVariants = withReducedMotion(composeEnter, reduced);
  const backdropVariants = withReducedMotion(composeBackdrop, reduced);

  if (!asModal) {
    return (
      <AnimatePresence>
        {show && (
          <motion.div
            key="compose-inline"
            className={`flex flex-col flex-1 min-h-0 ${className ?? ""}`}
            variants={contentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {show && (
        <>
          {/* Backdrop */}
          <motion.div
            key="compose-backdrop"
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm"
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Compose panel */}
          <motion.div
            key="compose-modal"
            className={`fixed inset-x-0 bottom-0 z-[91] max-h-[85vh] flex flex-col rounded-t-2xl bg-surface shadow-2xl overflow-hidden ${className ?? ""}`}
            variants={contentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-label="Compose email"
          >
            {/* Drag handle indicator */}
            <div className="flex justify-center py-2">
              <div className="w-10 h-1 rounded-full bg-content-tertiary/30" />
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
