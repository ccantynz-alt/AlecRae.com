"use client";

/**
 * DragToSnooze — Integration component wiring drag events to the snooze API (A6).
 *
 * Manages the full drag-to-snooze lifecycle:
 * 1. Listens for drag start from DraggableEmailRow
 * 2. Shows SnoozeDropOverlay with mini-calendar
 * 3. On drop + time selection, calls POST /v1/snooze/:emailId
 * 4. Shows toast notification on success
 * 5. Supports undo via DELETE /v1/snooze/:emailId
 * 6. Keyboard alternative: select email + press S to open snooze picker
 */

import { useCallback, useState, useRef, useEffect } from "react";
import {
  SnoozeDropOverlay,
  type DraggableEmailData,
} from "@emailed/ui";

// ─── Types ─────────────────────────────────────────────────────────────────

interface SnoozeToast {
  id: string;
  emailId: string;
  subject: string;
  snoozedUntil: string;
  visible: boolean;
}

export interface DragToSnoozeProps {
  /** Base API URL for the snooze endpoints. */
  apiBaseUrl?: string;
  /** Auth token to include in API calls. */
  authToken?: string;
  /** Called after a successful snooze (parent can refresh inbox). */
  onSnoozeComplete?: (emailId: string, snoozedUntil: Date) => void;
  /** Called after a successful undo. */
  onUndoComplete?: (emailId: string) => void;
  /** Children receive drag handlers to wire into email rows. */
  children: (handlers: DragToSnoozeHandlers) => React.ReactNode;
}

export interface DragToSnoozeHandlers {
  /** Pass to DraggableEmailRow's onDragStart. */
  onDragStart: (email: DraggableEmailData) => void;
  /** Pass to DraggableEmailRow's onDragEnd. */
  onDragEnd: () => void;
  /** Pass to DraggableEmailRow's onSnoozeShortcut. */
  onSnoozeShortcut: (email: DraggableEmailData) => void;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const TOAST_DURATION_MS = 6000;
const DEFAULT_API_BASE = "/api/v1";

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatSnoozeTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `today at ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  if (diffDays === 1) {
    return `tomorrow at ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Component ─────────────────────────────────────────────────────────────

export function DragToSnooze({
  apiBaseUrl = DEFAULT_API_BASE,
  authToken,
  onSnoozeComplete,
  onUndoComplete,
  children,
}: DragToSnoozeProps): React.ReactNode {
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [dragEmail, setDragEmail] = useState<DraggableEmailData | null>(null);
  const [toasts, setToasts] = useState<SnoozeToast[]>([]);
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cleanup toast timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of toastTimersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  // ─── API Calls ─────────────────────────────────────────────────────

  const callSnoozeApi = useCallback(
    async (emailId: string, until: Date): Promise<boolean> => {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (authToken) {
          headers["Authorization"] = `Bearer ${authToken}`;
        }

        const response = await fetch(`${apiBaseUrl}/snooze/${emailId}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ until: until.toISOString() }),
        });

        return response.ok;
      } catch {
        return false;
      }
    },
    [apiBaseUrl, authToken],
  );

  const callUnsnoozeApi = useCallback(
    async (emailId: string): Promise<boolean> => {
      try {
        const headers: Record<string, string> = {};
        if (authToken) {
          headers["Authorization"] = `Bearer ${authToken}`;
        }

        const response = await fetch(`${apiBaseUrl}/snooze/${emailId}`, {
          method: "DELETE",
          headers,
        });

        return response.ok;
      } catch {
        return false;
      }
    },
    [apiBaseUrl, authToken],
  );

  // ─── Toast Management ──────────────────────────────────────────────

  const showToast = useCallback((emailId: string, subject: string, snoozedUntil: Date): void => {
    const id = `snooze-toast-${Date.now()}`;
    const toast: SnoozeToast = {
      id,
      emailId,
      subject,
      snoozedUntil: formatSnoozeTime(snoozedUntil),
      visible: true,
    };

    setToasts((prev) => [...prev, toast]);

    const timer = setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, visible: false } : t)),
      );
      // Remove from DOM after fade out
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, TOAST_DURATION_MS);

    toastTimersRef.current.set(id, timer);
  }, []);

  const dismissToast = useCallback((toastId: string): void => {
    const timer = toastTimersRef.current.get(toastId);
    if (timer) {
      clearTimeout(timer);
      toastTimersRef.current.delete(toastId);
    }
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  }, []);

  // ─── Snooze Handler ────────────────────────────────────────────────

  const handleSnooze = useCallback(
    async (emailId: string, datetime: Date): Promise<void> => {
      const subject = dragEmail?.subject ?? "Email";
      const success = await callSnoozeApi(emailId, datetime);

      if (success) {
        showToast(emailId, subject, datetime);
        onSnoozeComplete?.(emailId, datetime);
      } else {
        // Error toast
        showToast(emailId, `Failed to snooze "${subject}"`, datetime);
      }
    },
    [dragEmail, callSnoozeApi, showToast, onSnoozeComplete],
  );

  const handleUndo = useCallback(
    async (toastId: string, emailId: string): Promise<void> => {
      dismissToast(toastId);
      const success = await callUnsnoozeApi(emailId);
      if (success) {
        onUndoComplete?.(emailId);
      }
    },
    [callUnsnoozeApi, dismissToast, onUndoComplete],
  );

  // ─── Drag Handlers (passed to children) ────────────────────────────

  const handleDragStart = useCallback((email: DraggableEmailData): void => {
    setDragEmail(email);
    setOverlayVisible(true);
  }, []);

  const handleDragEnd = useCallback((): void => {
    // Don't immediately dismiss — let the drop handler or calendar handle it
    // Only dismiss if no date was selected (pure cancel)
    setTimeout(() => {
      setOverlayVisible((prev) => {
        if (prev) {
          setDragEmail(null);
          return false;
        }
        return prev;
      });
    }, 200);
  }, []);

  const handleSnoozeShortcut = useCallback((email: DraggableEmailData): void => {
    setDragEmail(email);
    setOverlayVisible(true);
  }, []);

  const handleOverlayDismiss = useCallback((): void => {
    setOverlayVisible(false);
    setDragEmail(null);
  }, []);

  const handleOverlaySnooze = useCallback(
    (emailId: string, datetime: Date): void => {
      setOverlayVisible(false);
      setDragEmail(null);
      void handleSnooze(emailId, datetime);
    },
    [handleSnooze],
  );

  // ─── Handlers object for children ──────────────────────────────────

  const handlers: DragToSnoozeHandlers = {
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onSnoozeShortcut: handleSnoozeShortcut,
  };

  return (
    <>
      {children(handlers)}

      {/* Snooze overlay */}
      <SnoozeDropOverlay
        visible={overlayVisible}
        dragEmailId={dragEmail?.emailId ?? null}
        dragSubject={dragEmail?.subject}
        onSnooze={handleOverlaySnooze}
        onDismiss={handleOverlayDismiss}
      />

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div
          className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none"
          aria-live="polite"
          aria-label="Snooze notifications"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={[
                "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl",
                "bg-surface border border-border shadow-lg max-w-sm",
                "transition-all duration-300",
                toast.visible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-2",
              ].join(" ")}
              role="status"
              aria-label={`Email snoozed until ${toast.snoozedUntil}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-content truncate">
                  Snoozed
                </p>
                <p className="text-xs text-content-secondary truncate">
                  Until {toast.snoozedUntil}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleUndo(toast.id, toast.emailId)}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label="Undo snooze"
              >
                Undo
              </button>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-content-tertiary hover:text-content rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label="Dismiss notification"
              >
                &#10005;
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
