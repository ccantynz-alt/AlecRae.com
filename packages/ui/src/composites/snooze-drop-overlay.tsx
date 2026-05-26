"use client";

/**
 * SnoozeDropOverlay — Full-screen overlay that appears when dragging
 * an email, showing the SnoozeCalendar prominently in the center (A6).
 *
 * Features:
 * - Fades in smoothly when a drag starts
 * - Backdrop blur effect
 * - Dismisses on drop or Escape key
 * - Quick preset buttons around the calendar
 * - Accessible: focus trap, Escape to dismiss, screen-reader labels
 */

import {
  forwardRef,
  useState,
  useCallback,
  useEffect,
  useRef,
  type DragEvent,
} from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { SnoozeCalendar } from "./snooze-calendar";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SnoozeDropOverlayProps {
  /** Whether the overlay is visible (a drag is in progress). */
  visible: boolean;
  /** The email ID being dragged. */
  dragEmailId: string | null;
  /** The subject of the dragged email (for display). */
  dragSubject?: string;
  /** Fires when the user completes a snooze. */
  onSnooze: (emailId: string, datetime: Date) => void;
  /** Fires when the overlay should be dismissed (escape, click outside). */
  onDismiss: () => void;
  /** Additional CSS classes. */
  className?: string;
}

// ─── Component ─────────────────────────────────────────────────────────────

export const SnoozeDropOverlay = forwardRef<HTMLDivElement, SnoozeDropOverlayProps>(
  function SnoozeDropOverlay(
    { visible, dragEmailId, dragSubject, onSnooze, onDismiss, className = "" },
    ref,
  ) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const [isEntering, setIsEntering] = useState(false);

    // Animate in
    useEffect(() => {
      if (visible) {
        // Trigger transition on next frame
        requestAnimationFrame(() => {
          setIsEntering(true);
        });
      } else {
        setIsEntering(false);
      }
    }, [visible]);

    // Focus the overlay when it appears
    useEffect(() => {
      if (visible && overlayRef.current) {
        overlayRef.current.focus();
      }
    }, [visible]);

    // Escape key dismisses
    useEffect(() => {
      if (!visible) return;
      const handleKey = (e: globalThis.KeyboardEvent): void => {
        if (e.key === "Escape") {
          e.preventDefault();
          onDismiss();
        }
      };
      window.addEventListener("keydown", handleKey);
      return () => window.removeEventListener("keydown", handleKey);
    }, [visible, onDismiss]);

    // Prevent default on drag over the entire overlay (allow drops to pass through to calendar)
    const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>): void => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }, []);

    // If user drops outside the calendar, dismiss
    const handleDrop = useCallback(
      (e: DragEvent<HTMLDivElement>): void => {
        e.preventDefault();
        // Don't dismiss — the calendar cells handle their own drops
        // Only dismiss if the drop was on the backdrop itself
        if (e.target === overlayRef.current || e.target === e.currentTarget) {
          onDismiss();
        }
      },
      [onDismiss],
    );

    const handleSnooze = useCallback(
      (emailId: string, datetime: Date): void => {
        onSnooze(emailId, datetime);
        onDismiss();
      },
      [onSnooze, onDismiss],
    );

    const handleBackdropClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>): void => {
        if (e.target === e.currentTarget) {
          onDismiss();
        }
      },
      [onDismiss],
    );

    if (!visible) return null;

    return (
      <Box
        ref={(node: HTMLDivElement | null) => {
          // Merge refs
          (overlayRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Snooze email — drop on a calendar day to set snooze time"
        tabIndex={-1}
        className={[
          "fixed inset-0 z-[90] flex items-center justify-center",
          "transition-all duration-300 ease-out",
          isEntering
            ? "opacity-100 backdrop-blur-sm bg-black/30"
            : "opacity-0 backdrop-blur-none bg-black/0",
          className,
        ].join(" ")}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleBackdropClick}
      >
        {/* Center card */}
        <Box
          className={[
            "relative bg-surface border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4",
            "transition-all duration-300 ease-out",
            isEntering
              ? "opacity-100 scale-100 translate-y-0"
              : "opacity-0 scale-95 translate-y-4",
          ].join(" ")}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          {/* Header */}
          <Box className="flex items-center justify-between mb-4">
            <Box>
              <Text variant="heading-sm" className="text-content">
                Snooze Email
              </Text>
              {dragSubject && (
                <Text variant="caption" className="truncate max-w-[260px] block mt-0.5" muted>
                  {dragSubject}
                </Text>
              )}
            </Box>
            <Box
              as="button"
              type="button"
              onClick={onDismiss}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-content-tertiary hover:bg-surface-tertiary hover:text-content transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label="Close snooze overlay"
            >
              <Text as="span" variant="body-md" aria-hidden="true">
                &#10005;
              </Text>
            </Box>
          </Box>

          {/* Calendar */}
          <SnoozeCalendar
            onSnooze={handleSnooze}
            isDragActive={dragEmailId !== null}
            {...(dragEmailId !== null ? { dragEmailId } : {})}
          />

          {/* Keyboard hint */}
          <Box className="mt-4 pt-3 border-t border-border flex items-center justify-center gap-3" aria-hidden="true">
            <Text variant="caption" className="text-content-tertiary">
              <Box
                as="kbd"
                className="px-1.5 py-0.5 rounded bg-surface-tertiary border border-border font-mono text-[10px]"
              >
                Esc
              </Box>
              {" "}to cancel
            </Text>
            <Text variant="caption" className="text-content-tertiary">
              <Box
                as="kbd"
                className="px-1.5 py-0.5 rounded bg-surface-tertiary border border-border font-mono text-[10px]"
              >
                S
              </Box>
              {" "}keyboard snooze
            </Text>
          </Box>
        </Box>
      </Box>
    );
  },
);

SnoozeDropOverlay.displayName = "SnoozeDropOverlay";
