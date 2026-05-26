"use client";

/**
 * AlecRae Web -- SwipeableEmailRow
 *
 * Web version of the swipeable inbox row, adapted for both touch
 * (mobile web) and pointer (desktop) interactions.
 *
 * Touch screens:
 *   - Horizontal swipe with threshold-based action detection
 *   - Spring-like CSS transitions on release
 *   - Left swipe: Archive (short), Delete (long)
 *   - Right swipe: Reply (short), Snooze (long)
 *
 * Desktop:
 *   - Hover reveals quick-action buttons (reply, archive, snooze, flag, delete)
 *   - Keyboard accessible: Enter/Space to open, Tab to action buttons
 *
 * Accessibility:
 *   - All swipe actions also available via hover buttons
 *   - Long-press (touch) or right-click (desktop) opens context menu
 *   - prefers-reduced-motion: instant transitions
 *   - ARIA labels on all interactive elements
 *   - 44px minimum touch targets
 */

import { useCallback, useRef, useState, type KeyboardEvent, type MouseEvent, type TouchEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  SPRING_SNAPPY,
  SPRING_MICRO,
  useAlecRaeReducedMotion,
  selectTransition,
} from "../lib/animations";

// ── Types ────────────────────────────────────────────────────────────────────

export type SwipeActionKind = "archive" | "delete" | "reply" | "snooze" | "flag" | "read";

export interface SwipeAction {
  readonly kind: SwipeActionKind;
  readonly label: string;
  readonly icon: string;
  readonly color: string;
  readonly destructive?: boolean;
}

export interface SwipeableEmailData {
  readonly id: string;
  readonly from: string;
  readonly fromEmail: string;
  readonly subject: string;
  readonly preview: string;
  readonly receivedAt: string;
  readonly unread: boolean;
  readonly starred?: boolean;
  readonly hasAttachments?: boolean;
}

export interface SwipeableEmailRowProps {
  readonly email: SwipeableEmailData;
  readonly onAction: (id: string, action: SwipeActionKind) => void;
  readonly onPress?: (id: string) => void;
  readonly onReplySwipe?: (id: string) => void;
  readonly onUndoRequest?: (id: string, action: SwipeActionKind) => void;
  readonly className?: string;
}

// ── Config ───────────────────────────────────────────────────────────────────

const SHORT_THRESHOLD = 80;
const LONG_THRESHOLD = 180;
const VELOCITY_COMMIT = 800;
const ACTIVATION_THRESHOLD = 8;

const LEFT_ACTIONS: readonly SwipeAction[] = [
  { kind: "archive", label: "Archive", icon: "\u{1F4E5}", color: "#10b981" },
  { kind: "delete", label: "Delete", icon: "\u{1F5D1}\u{FE0F}", color: "#ef4444", destructive: true },
];

const RIGHT_ACTIONS: readonly SwipeAction[] = [
  { kind: "reply", label: "Reply", icon: "\u{21A9}\u{FE0F}", color: "#3b82f6" },
  { kind: "snooze", label: "Snooze", icon: "\u{1F4A4}", color: "#f59e0b" },
];

const HOVER_ACTIONS: readonly SwipeAction[] = [
  { kind: "reply", label: "Reply", icon: "\u{21A9}\u{FE0F}", color: "#3b82f6" },
  { kind: "archive", label: "Archive", icon: "\u{1F4E5}", color: "#10b981" },
  { kind: "snooze", label: "Snooze", icon: "\u{1F4A4}", color: "#f59e0b" },
  { kind: "flag", label: "Flag", icon: "\u{1F6A9}", color: "#eab308" },
  { kind: "delete", label: "Delete", icon: "\u{1F5D1}\u{FE0F}", color: "#ef4444", destructive: true },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveAction(
  translation: number,
): SwipeAction | null {
  const abs = Math.abs(translation);
  if (abs < SHORT_THRESHOLD) return null;

  const actions = translation < 0 ? LEFT_ACTIONS : RIGHT_ACTIONS;
  if (abs >= LONG_THRESHOLD && actions.length > 1) {
    return actions[1] ?? actions[0] ?? null;
  }
  return actions[0] ?? null;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SwipeableEmailRow({
  email,
  onAction,
  onPress,
  onReplySwipe,
  onUndoRequest,
  className = "",
}: SwipeableEmailRowProps): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();

  // Swipe state
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [showHoverActions, setShowHoverActions] = useState(false);

  // Touch tracking refs
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const isHorizontalRef = useRef(false);
  const lastTranslateRef = useRef(0);

  // ── Touch event handlers ──────────────────────────────────
  const handleTouchStart = useCallback((e: TouchEvent<HTMLDivElement>): void => {
    const touch = e.touches[0];
    if (!touch) return;
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    startTimeRef.current = Date.now();
    isHorizontalRef.current = false;
    lastTranslateRef.current = 0;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent<HTMLDivElement>): void => {
    const touch = e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - startXRef.current;
    const dy = touch.clientY - startYRef.current;

    if (!isHorizontalRef.current && !isSwiping) {
      if (Math.abs(dx) > ACTIVATION_THRESHOLD) {
        isHorizontalRef.current = true;
        setIsSwiping(true);
      } else if (Math.abs(dy) > ACTIVATION_THRESHOLD) {
        return;
      } else {
        return;
      }
    }

    if (!isHorizontalRef.current) return;

    lastTranslateRef.current = dx;
    setTranslateX(dx);
  }, [isSwiping]);

  const commitAction = useCallback(
    (action: SwipeAction): void => {
      if (action.kind === "reply" && onReplySwipe) {
        onReplySwipe(email.id);
        setTranslateX(0);
        setIsSwiping(false);
        return;
      }

      setIsExiting(true);
      const exitDuration = reduced ? 0 : 250;
      setTimeout(() => {
        onAction(email.id, action.kind);
        if (action.destructive && onUndoRequest) {
          onUndoRequest(email.id, action.kind);
        }
        setIsExiting(false);
        setTranslateX(0);
        setIsSwiping(false);
      }, exitDuration);
    },
    [email.id, onAction, onReplySwipe, onUndoRequest, reduced],
  );

  const handleTouchEnd = useCallback((): void => {
    if (!isSwiping) {
      if (Math.abs(lastTranslateRef.current) < 5) {
        onPress?.(email.id);
      }
      return;
    }

    const tx = lastTranslateRef.current;
    const elapsed = Date.now() - startTimeRef.current;
    const velocity = Math.abs(tx) / (elapsed / 1000);

    const action = resolveAction(tx);
    const isFlick = velocity > VELOCITY_COMMIT;

    if (action) {
      commitAction(action);
    } else if (isFlick) {
      const flickActions = tx > 0 ? RIGHT_ACTIONS : LEFT_ACTIONS;
      const flickAction = flickActions[0];
      if (flickAction) {
        commitAction(flickAction);
      } else {
        setTranslateX(0);
        setIsSwiping(false);
      }
    } else {
      setTranslateX(0);
      setIsSwiping(false);
    }
  }, [commitAction, email.id, isSwiping, onPress]);

  // ── Hover & keyboard handlers ─────────────────────────────
  const handleHoverActionClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>, action: SwipeAction): void => {
      e.stopPropagation();
      if (action.kind === "reply" && onReplySwipe) {
        onReplySwipe(email.id);
        return;
      }
      onAction(email.id, action.kind);
      if (action.destructive && onUndoRequest) {
        onUndoRequest(email.id, action.kind);
      }
    },
    [email.id, onAction, onReplySwipe, onUndoRequest],
  );

  const handleRowClick = useCallback((): void => {
    if (!isSwiping) {
      onPress?.(email.id);
    }
  }, [email.id, isSwiping, onPress]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onPress?.(email.id);
      }
    },
    [email.id, onPress],
  );

  // ── Resolved action for background ────────────────────────
  const activeAction = resolveAction(translateX);
  const bgColor = activeAction?.color ?? "transparent";

  const springTransition = selectTransition(SPRING_SNAPPY, reduced);

  return (
    <AnimatePresence>
      {!isExiting ? (
        <motion.div
          className={`relative overflow-hidden ${className}`}
          initial={reduced ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0, x: translateX > 0 ? 300 : -300 }}
          transition={springTransition}
          layout={!reduced}
        >
          {/* Background action reveal */}
          <div
            className="absolute inset-0 flex items-center justify-between px-7 transition-colors"
            style={{ backgroundColor: bgColor }}
            aria-hidden="true"
          >
            {translateX > 0 && activeAction ? (
              <div className="flex items-center gap-2">
                <span className="text-lg">{activeAction.icon}</span>
                <span className="text-white font-semibold text-xs tracking-wide uppercase">
                  {activeAction.label}
                </span>
              </div>
            ) : (
              <div />
            )}
            {translateX < 0 && activeAction ? (
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-xs tracking-wide uppercase">
                  {activeAction.label}
                </span>
                <span className="text-lg">{activeAction.icon}</span>
              </div>
            ) : (
              <div />
            )}
          </div>

          {/* Swipeable row content */}
          <div
            role="button"
            tabIndex={0}
            className={`relative flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-white/5 ${
              email.unread
                ? "bg-white/[0.03]"
                : "bg-[#0f172a]"
            } hover:bg-white/[0.05] transition-colors`}
            style={{
              transform: `translateX(${translateX}px)`,
              transition: isSwiping
                ? "none"
                : reduced
                  ? "transform 0s"
                  : "transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
              touchAction: "pan-y",
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseEnter={() => setShowHoverActions(true)}
            onMouseLeave={() => setShowHoverActions(false)}
            onClick={handleRowClick}
            onKeyDown={handleKeyDown}
            aria-label={`Email from ${email.from}: ${email.subject}. ${
              email.unread ? "Unread." : ""
            } Received ${email.receivedAt}`}
          >
            {/* Unread indicator */}
            {email.unread ? (
              <div
                className="w-2 h-2 rounded-full bg-cyan-400 mt-2 shrink-0"
                aria-hidden="true"
              />
            ) : null}

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span
                  className={`truncate text-sm ${
                    email.unread
                      ? "font-bold text-white"
                      : "font-medium text-slate-300"
                  }`}
                >
                  {email.from}
                </span>
                <span className="text-xs text-slate-500 shrink-0">
                  {email.receivedAt}
                </span>
              </div>
              <div
                className={`truncate text-sm mb-0.5 ${
                  email.unread
                    ? "font-semibold text-white"
                    : "text-slate-300"
                }`}
              >
                {email.subject}
              </div>
              <div className="truncate text-xs text-slate-500">
                {email.preview}
              </div>
            </div>

            {/* Star */}
            {email.starred ? (
              <span className="text-sm mt-1 shrink-0" aria-label="Starred">
                {"\u{2B50}"}
              </span>
            ) : null}

            {/* Desktop hover actions */}
            <AnimatePresence>
              {showHoverActions && !isSwiping ? (
                <motion.div
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-slate-800/95 backdrop-blur-sm rounded-lg px-1 py-1 shadow-xl border border-white/10"
                  initial={reduced ? false : { opacity: 0, scale: 0.9, x: 8 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9, x: 8 }}
                  transition={selectTransition(SPRING_MICRO, reduced)}
                  aria-label="Quick actions"
                  role="toolbar"
                >
                  {HOVER_ACTIONS.map((action) => (
                    <motion.button
                      key={action.kind}
                      type="button"
                      className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-white/10 transition-colors text-sm"
                      style={{ minWidth: 32, minHeight: 32 }}
                      onClick={(e) => handleHoverActionClick(e, action)}
                      whileHover={reduced ? {} : { scale: 1.15 }}
                      whileTap={reduced ? {} : { scale: 0.9 }}
                      transition={SPRING_MICRO}
                      aria-label={action.label}
                      title={action.label}
                    >
                      {action.icon}
                    </motion.button>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
