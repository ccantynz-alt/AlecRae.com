"use client";

/**
 * AnimatedToast — notification slide-in with elastic bounce.
 *
 * A self-dismissing toast component with spring-based entrance animations.
 * Supports multiple positions (top-right, top-center, bottom-right, bottom-center).
 * Auto-dismisses after a configurable duration. Includes a progress bar that
 * counts down the dismiss timer.
 *
 * Toast variants: "info" | "success" | "warning" | "error"
 */

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  toastEnterBottom,
  toastEnterRight,
  toastEnterTop,
  useAlecRaeReducedMotion,
  withReducedMotion,
} from "../lib/animations";

export type ToastVariant = "info" | "success" | "warning" | "error";
export type ToastPosition = "top-right" | "top-center" | "bottom-right" | "bottom-center";

export interface ToastData {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

export interface AnimatedToastProps {
  toast: ToastData;
  position?: ToastPosition;
  onDismiss: (id: string) => void;
}

const variantStyles: Record<ToastVariant, string> = {
  info: "border-brand-400/30 bg-brand-50/90",
  success: "border-green-400/30 bg-green-50/90",
  warning: "border-yellow-400/30 bg-yellow-50/90",
  error: "border-red-400/30 bg-red-50/90",
};

const variantIcons: Record<ToastVariant, string> = {
  info: "\u2139\uFE0F",
  success: "\u2705",
  warning: "\u26A0\uFE0F",
  error: "\u274C",
};

function getVariantsForPosition(position: ToastPosition): typeof toastEnterRight {
  if (position === "top-right" || position === "bottom-right") {
    return toastEnterRight;
  }
  if (position === "top-center") {
    return toastEnterTop;
  }
  return toastEnterBottom;
}

export function AnimatedToast({
  toast,
  position = "bottom-right",
  onDismiss,
}: AnimatedToastProps): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const baseVariants = getVariantsForPosition(position);
  const variants = withReducedMotion(baseVariants, reduced);
  const duration = toast.duration ?? 4000;
  const [progress, setProgress] = useState(100);
  const startTimeRef = useRef<number>(Date.now());
  const rafRef = useRef<number>(0);

  const dismiss = useCallback((): void => {
    onDismiss(toast.id);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    startTimeRef.current = Date.now();

    const tick = (): void => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        dismiss();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return (): void => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [duration, dismiss]);

  const variant = toast.variant ?? "info";

  return (
    <motion.div
      layout
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={`relative overflow-hidden rounded-lg border backdrop-blur-sm shadow-lg max-w-sm w-full ${variantStyles[variant]}`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 p-4">
        <span className="flex-shrink-0 text-base" aria-hidden="true">
          {variantIcons[variant]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-content">
            {toast.title}
          </p>
          {toast.description && (
            <p className="mt-1 text-xs text-content-secondary">
              {toast.description}
            </p>
          )}
        </div>
        <button
          type="button"
          className="flex-shrink-0 text-content-tertiary hover:text-content transition-colors p-0.5"
          onClick={dismiss}
          aria-label="Dismiss notification"
        >
          <span aria-hidden="true" className="text-sm">{"\u2715"}</span>
        </button>
      </div>
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/5">
        <motion.div
          className="h-full bg-current opacity-30"
          style={{ width: `${progress}%` }}
          transition={{ duration: 0 }}
        />
      </div>
    </motion.div>
  );
}

/**
 * AnimatedToastContainer — positioned container for stacking multiple toasts.
 */
export interface AnimatedToastContainerProps {
  toasts: ToastData[];
  position?: ToastPosition;
  onDismiss: (id: string) => void;
}

const positionClasses: Record<ToastPosition, string> = {
  "top-right": "fixed top-4 right-4 z-[200] flex flex-col gap-2 items-end",
  "top-center": "fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-center",
  "bottom-right": "fixed bottom-4 right-4 z-[200] flex flex-col-reverse gap-2 items-end",
  "bottom-center": "fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col-reverse gap-2 items-center",
};

export function AnimatedToastContainer({
  toasts,
  position = "bottom-right",
  onDismiss,
}: AnimatedToastContainerProps): React.ReactNode {
  return (
    <div className={positionClasses[position]} aria-label="Notifications">
      <AnimatePresence>
        {toasts.map((toast) => (
          <AnimatedToast
            key={toast.id}
            toast={toast}
            position={position}
            onDismiss={onDismiss}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
