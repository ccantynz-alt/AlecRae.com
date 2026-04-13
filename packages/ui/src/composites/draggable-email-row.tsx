"use client";

/**
 * DraggableEmailRow — Email list row with HTML5 drag support (A6).
 *
 * Wraps an email list item to make it draggable. Sets drag data
 * (emailId, threadId, subject) so drop targets can identify what
 * was dropped. Shows a ghost preview during drag and visual state
 * changes (opacity, outline) when actively dragging.
 *
 * Accessible: keyboard alternative via onSnoozeShortcut (S key).
 * Touch-friendly: long-press triggers drag on mobile via touch events.
 */

import {
  forwardRef,
  useState,
  useCallback,
  useRef,
  useEffect,
  type DragEvent,
  type TouchEvent,
  type KeyboardEvent,
} from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DraggableEmailData {
  emailId: string;
  threadId?: string;
  subject: string;
  senderName: string;
  preview?: string;
}

export interface DraggableEmailRowProps {
  /** Email data to set on the drag transfer. */
  email: DraggableEmailData;
  /** Whether this row is currently selected in the list. */
  selected?: boolean;
  /** Whether the row is read. */
  read?: boolean;
  /** Timestamp to display. */
  timestamp?: string;
  /** Priority indicator. */
  priority?: "high" | "normal" | "low";
  /** Whether the email is starred. */
  starred?: boolean;
  /** Click handler. */
  onClick?: () => void;
  /** Star toggle handler. */
  onStar?: () => void;
  /** Fires when drag starts — parent can show the snooze overlay. */
  onDragStart?: (email: DraggableEmailData) => void;
  /** Fires when drag ends (drop or cancel). */
  onDragEnd?: () => void;
  /** Keyboard snooze shortcut handler (S key). */
  onSnoozeShortcut?: (email: DraggableEmailData) => void;
  /** Additional CSS classes. */
  className?: string;
  /** Children to render inside the row (override default rendering). */
  children?: React.ReactNode;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const LONG_PRESS_DELAY_MS = 500;
const DRAG_MIME = "application/x-alecrae-email-id";
const DRAG_THREAD_MIME = "application/x-alecrae-thread-id";
const DRAG_SUBJECT_MIME = "application/x-alecrae-subject";

const priorityIndicator = {
  high: "bg-status-error",
  normal: "bg-brand-400",
  low: "bg-content-tertiary",
} as const;

// ─── Component ─────────────────────────────────────────────────────────────

export const DraggableEmailRow = forwardRef<HTMLDivElement, DraggableEmailRowProps>(
  function DraggableEmailRow(
    {
      email,
      selected = false,
      read = false,
      timestamp,
      priority = "normal",
      starred = false,
      onClick,
      onStar,
      onDragStart,
      onDragEnd,
      onSnoozeShortcut,
      className = "",
      children,
    },
    ref,
  ) {
    const [isDragging, setIsDragging] = useState(false);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);
    const rowRef = useRef<HTMLDivElement>(null);

    // Cleanup long press timer on unmount
    useEffect(() => {
      return () => {
        if (longPressTimerRef.current !== null) {
          clearTimeout(longPressTimerRef.current);
        }
      };
    }, []);

    // ─── HTML5 Drag Events ─────────────────────────────────────────────

    const handleDragStart = useCallback(
      (e: DragEvent<HTMLDivElement>): void => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(DRAG_MIME, email.emailId);
        if (email.threadId) {
          e.dataTransfer.setData(DRAG_THREAD_MIME, email.threadId);
        }
        e.dataTransfer.setData(DRAG_SUBJECT_MIME, email.subject);
        e.dataTransfer.setData("text/plain", email.subject);

        // Create a custom drag ghost
        const ghost = document.createElement("div");
        ghost.textContent = email.subject;
        ghost.style.cssText = [
          "position: absolute",
          "top: -1000px",
          "left: -1000px",
          "padding: 8px 16px",
          "background: rgba(59, 130, 246, 0.9)",
          "color: white",
          "border-radius: 8px",
          "font-size: 13px",
          "font-weight: 500",
          "max-width: 280px",
          "white-space: nowrap",
          "overflow: hidden",
          "text-overflow: ellipsis",
          "box-shadow: 0 8px 32px rgba(0,0,0,0.2)",
        ].join(";");
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 140, 20);

        // Clean up ghost after a frame
        requestAnimationFrame(() => {
          document.body.removeChild(ghost);
        });

        setIsDragging(true);
        onDragStart?.(email);
      },
      [email, onDragStart],
    );

    const handleDragEnd = useCallback((): void => {
      setIsDragging(false);
      onDragEnd?.();
    }, [onDragEnd]);

    // ─── Touch Events (long-press to drag on mobile) ───────────────────

    const handleTouchStart = useCallback(
      (e: TouchEvent<HTMLDivElement>): void => {
        const touch = e.touches[0];
        if (!touch) return;
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };

        longPressTimerRef.current = setTimeout(() => {
          setIsDragging(true);
          onDragStart?.(email);
          // Haptic feedback if available
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            navigator.vibrate(30);
          }
        }, LONG_PRESS_DELAY_MS);
      },
      [email, onDragStart],
    );

    const handleTouchMove = useCallback(
      (e: TouchEvent<HTMLDivElement>): void => {
        const touch = e.touches[0];
        if (!touch || !touchStartRef.current) return;

        const dx = Math.abs(touch.clientX - touchStartRef.current.x);
        const dy = Math.abs(touch.clientY - touchStartRef.current.y);

        // If moved more than 10px, cancel the long press (it's a scroll)
        if (dx > 10 || dy > 10) {
          if (longPressTimerRef.current !== null) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
        }
      },
      [],
    );

    const handleTouchEnd = useCallback((): void => {
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      touchStartRef.current = null;
      if (isDragging) {
        setIsDragging(false);
        onDragEnd?.();
      }
    }, [isDragging, onDragEnd]);

    // ─── Keyboard ──────────────────────────────────────────────────────

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLDivElement>): void => {
        if (e.key === "s" || e.key === "S") {
          e.preventDefault();
          onSnoozeShortcut?.(email);
        }
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      },
      [email, onClick, onSnoozeShortcut],
    );

    // ─── Render ────────────────────────────────────────────────────────

    const dragClasses = isDragging
      ? "opacity-50 ring-2 ring-brand-500 ring-offset-2 scale-[0.98]"
      : "";

    const selectionClasses = selected
      ? "bg-brand-50"
      : read
        ? "bg-surface"
        : "bg-surface-secondary";

    return (
      <Box
        ref={ref ?? rowRef}
        as="div"
        role="listitem"
        tabIndex={0}
        draggable
        aria-label={`Email from ${email.senderName}: ${email.subject}. Press S to snooze.`}
        aria-grabbed={isDragging}
        className={[
          "flex items-start gap-3 px-4 py-3 cursor-grab transition-all duration-150",
          selectionClasses,
          "hover:bg-surface-tertiary",
          dragClasses,
          className,
        ].join(" ")}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={onClick}
        onKeyDown={handleKeyDown}
      >
        {children ?? (
          <>
            <Box className={`mt-2 w-2 h-2 rounded-full flex-shrink-0 ${priorityIndicator[priority]}`} />
            <Box className="flex-1 min-w-0">
              <Box className="flex items-center justify-between gap-2">
                <Text
                  variant="body-sm"
                  className={`truncate ${!read ? "font-semibold" : ""}`}
                >
                  {email.senderName}
                </Text>
                {timestamp && (
                  <Text variant="caption" className="flex-shrink-0">
                    {timestamp}
                  </Text>
                )}
              </Box>
              <Text
                variant="body-sm"
                className={`truncate ${!read ? "font-semibold text-content" : "text-content-secondary"}`}
              >
                {email.subject}
              </Text>
              {email.preview && (
                <Text variant="caption" className="truncate text-content-tertiary">
                  {email.preview}
                </Text>
              )}
            </Box>
            {onStar && (
              <Box
                as="button"
                className={`mt-1 flex-shrink-0 transition-colors ${
                  starred ? "text-yellow-400" : "text-content-tertiary hover:text-yellow-400"
                }`}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onStar();
                }}
                aria-label={starred ? "Unstar email" : "Star email"}
              >
                <Text as="span" variant="body-md">
                  {starred ? "\u2605" : "\u2606"}
                </Text>
              </Box>
            )}
          </>
        )}
      </Box>
    );
  },
);

DraggableEmailRow.displayName = "DraggableEmailRow";
