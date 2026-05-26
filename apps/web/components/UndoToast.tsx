"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  SPRING_BOUNCY,
  useAlecRaeReducedMotion,
} from "../lib/animations";

export interface UndoAction {
  id: string;
  label: string;
  onUndo: () => void;
  duration?: number;
}

interface ActiveToast extends UndoAction {
  createdAt: number;
  progress: number;
}

export interface UndoToastManagerProps {
  actions: UndoAction[];
  onExpire: (id: string) => void;
  onDismiss: (id: string) => void;
}

function UndoToastItem({
  toast,
  onUndo,
  onDismiss,
}: {
  toast: ActiveToast;
  onUndo: () => void;
  onDismiss: () => void;
}): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const duration = toast.duration ?? 5000;
  const [progress, setProgress] = useState(100);
  const startRef = useRef(toast.createdAt);
  const rafRef = useRef(0);

  useEffect(() => {
    startRef.current = toast.createdAt;
    const tick = (): void => {
      const elapsed = Date.now() - startRef.current;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [duration, toast.createdAt]);

  return (
    <motion.div
      layout
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.95 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.95 }}
      transition={SPRING_BOUNCY}
      className="relative overflow-hidden rounded-xl border border-border bg-surface shadow-xl max-w-sm w-full backdrop-blur-sm"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex-1 text-sm font-medium text-content truncate">
          {toast.label}
        </span>
        <button
          type="button"
          onClick={onUndo}
          className="flex-shrink-0 px-3 py-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label="Undo action"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-content-tertiary hover:text-content rounded transition-colors"
          aria-label="Dismiss"
        >
          &#10005;
        </button>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/5">
        <div
          className="h-full bg-brand-500/40 transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
    </motion.div>
  );
}

export function UndoToastManager({
  actions,
  onExpire,
  onDismiss,
}: UndoToastManagerProps): React.ReactNode {
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    for (const action of actions) {
      if (!timersRef.current.has(action.id)) {
        const timer = setTimeout(() => {
          timersRef.current.delete(action.id);
          onExpire(action.id);
        }, action.duration ?? 5000);
        timersRef.current.set(action.id, timer);
      }
    }

    const activeIds = new Set(actions.map((a) => a.id));
    for (const [id, timer] of timersRef.current.entries()) {
      if (!activeIds.has(id)) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
    }
  }, [actions, onExpire]);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  const handleUndo = useCallback(
    (action: UndoAction) => {
      const timer = timersRef.current.get(action.id);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(action.id);
      }
      action.onUndo();
      onDismiss(action.id);
    },
    [onDismiss],
  );

  const handleDismiss = useCallback(
    (id: string) => {
      const timer = timersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
      onDismiss(id);
    },
    [onDismiss],
  );

  const toasts: ActiveToast[] = actions.map((a) => ({
    ...a,
    createdAt: Date.now(),
    progress: 100,
  }));

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex flex-col-reverse gap-2 items-center pointer-events-none"
      aria-label="Undo actions"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <UndoToastItem
              toast={toast}
              onUndo={() => handleUndo(toast)}
              onDismiss={() => handleDismiss(toast.id)}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
