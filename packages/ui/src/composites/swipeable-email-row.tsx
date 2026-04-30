"use client";

/**
 * AlecRae UI — SwipeableEmailRow
 *
 * A platform-agnostic email list row with swipe gesture support for
 * quick actions. On touch devices it responds to horizontal swipe gestures;
 * on desktop it falls back to hover-revealed action buttons.
 *
 * Behaviour:
 *   - Left swipe reveals: Archive (green), Delete (red)
 *   - Right swipe reveals: Reply (blue), Snooze (orange), Flag (yellow)
 *   - Partial swipe shows action preview, full swipe triggers action
 *   - Spring animation on release (snap back or complete)
 *   - Configurable actions per direction
 *   - Undo toast callback after destructive actions
 *   - Long-press context menu for accessibility
 *
 * Respects prefers-reduced-motion: springs become instant transitions.
 */

import { forwardRef, useCallback, useRef, useState, type HTMLAttributes, type TouchEvent, type MouseEvent } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SwipeActionKind = "archive" | "delete" | "reply" | "snooze" | "flag" | "read";

export interface SwipeAction {
  readonly kind: SwipeActionKind;
  readonly label: string;
  readonly icon: string;
  readonly color: string;
  readonly destructive?: boolean;
}

export interface SwipeableEmailRowData {
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

export interface SwipeConfig {
  readonly leftActions: readonly SwipeAction[];
  readonly rightActions: readonly SwipeAction[];
  readonly shortThreshold: number;
  readonly longThreshold: number;
  readonly velocityCommit: number;
}

export interface SwipeableEmailRowProps extends Omit<HTMLAttributes<HTMLDivElement>, "onSelect"> {
  readonly email: SwipeableEmailRowData;
  readonly onAction: (id: string, action: SwipeActionKind) => void;
  readonly onPress?: (id: string) => void;
  readonly onLongPress?: (id: string, actions: readonly SwipeAction[]) => void;
  readonly onUndoRequest?: (id: string, action: SwipeActionKind) => void;
  readonly onHapticFeedback?: (style: "light" | "medium" | "success") => void;
  readonly config?: Partial<SwipeConfig>;
  readonly className?: string;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_LEFT_ACTIONS: readonly SwipeAction[] = [
  { kind: "archive", label: "Archive", icon: "\u{1F4E5}", color: "#10b981", destructive: false },
  { kind: "delete", label: "Delete", icon: "\u{1F5D1}\u{FE0F}", color: "#ef4444", destructive: true },
] as const;

const DEFAULT_RIGHT_ACTIONS: readonly SwipeAction[] = [
  { kind: "reply", label: "Reply", icon: "\u{21A9}\u{FE0F}", color: "#3b82f6", destructive: false },
  { kind: "snooze", label: "Snooze", icon: "\u{1F4A4}", color: "#f59e0b", destructive: false },
  { kind: "flag", label: "Flag", icon: "\u{1F6A9}", color: "#eab308", destructive: false },
] as const;

const DEFAULT_CONFIG: SwipeConfig = {
  leftActions: DEFAULT_LEFT_ACTIONS,
  rightActions: DEFAULT_RIGHT_ACTIONS,
  shortThreshold: 80,
  longThreshold: 180,
  velocityCommit: 800,
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mergeConfig(partial?: Partial<SwipeConfig>): SwipeConfig {
  if (!partial) return DEFAULT_CONFIG;
  return {
    leftActions: partial.leftActions ?? DEFAULT_CONFIG.leftActions,
    rightActions: partial.rightActions ?? DEFAULT_CONFIG.rightActions,
    shortThreshold: partial.shortThreshold ?? DEFAULT_CONFIG.shortThreshold,
    longThreshold: partial.longThreshold ?? DEFAULT_CONFIG.longThreshold,
    velocityCommit: partial.velocityCommit ?? DEFAULT_CONFIG.velocityCommit,
  };
}

function resolveAction(
  translation: number,
  config: SwipeConfig,
): SwipeAction | null {
  const abs = Math.abs(translation);
  if (abs < config.shortThreshold) return null;

  // Left swipe (negative translation) -> left actions
  // Right swipe (positive translation) -> right actions
  const actions = translation < 0 ? config.leftActions : config.rightActions;
  if (actions.length === 0) return null;

  if (abs >= config.longThreshold && actions.length > 1) {
    return actions[1] ?? actions[0] ?? null;
  }
  return actions[0] ?? null;
}

function getActionColor(action: SwipeAction | null): string {
  return action?.color ?? "transparent";
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const SwipeableEmailRow = forwardRef<HTMLDivElement, SwipeableEmailRowProps>(
  function SwipeableEmailRow(
    {
      email,
      onAction,
      onPress,
      onLongPress,
      onUndoRequest,
      onHapticFeedback,
      config: configProp,
      className = "",
      ...props
    },
    ref,
  ) {
    const config = mergeConfig(configProp);
    const allActions = [...config.rightActions, ...config.leftActions];

    // ── Touch tracking state ────────────────────────────────────
    const [translateX, setTranslateX] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    const [showContextMenu, setShowContextMenu] = useState(false);
    const [hoverActions, setHoverActions] = useState(false);

    const startXRef = useRef(0);
    const startYRef = useRef(0);
    const startTimeRef = useRef(0);
    const lastTranslateRef = useRef(0);
    const isHorizontalRef = useRef(false);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastZoneRef = useRef(0);

    const reduced = prefersReducedMotion();

    // ── Haptic callback helper ──────────────────────────────────
    const haptic = useCallback(
      (style: "light" | "medium" | "success"): void => {
        onHapticFeedback?.(style);
      },
      [onHapticFeedback],
    );

    // ── Zone tracking for haptic edges ──────────────────────────
    const updateZone = useCallback(
      (tx: number): void => {
        const abs = Math.abs(tx);
        let zone = 0;
        if (abs >= config.longThreshold) zone = tx > 0 ? 2 : -2;
        else if (abs >= config.shortThreshold) zone = tx > 0 ? 1 : -1;

        if (zone !== lastZoneRef.current) {
          lastZoneRef.current = zone;
          if (Math.abs(zone) === 1) haptic("light");
          else if (Math.abs(zone) === 2) haptic("medium");
        }
      },
      [config.longThreshold, config.shortThreshold, haptic],
    );

    // ── Commit action ───────────────────────────────────────────
    const commitAction = useCallback(
      (action: SwipeAction): void => {
        haptic("success");
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
          lastZoneRef.current = 0;
        }, exitDuration);
      },
      [email.id, haptic, onAction, onUndoRequest, reduced],
    );

    // ── Touch handlers ──────────────────────────────────────────
    const handleTouchStart = useCallback(
      (e: TouchEvent<HTMLDivElement>): void => {
        const touch = e.touches[0];
        if (!touch) return;
        startXRef.current = touch.clientX;
        startYRef.current = touch.clientY;
        startTimeRef.current = Date.now();
        isHorizontalRef.current = false;
        lastTranslateRef.current = 0;
        lastZoneRef.current = 0;

        // Long press detection for accessibility context menu
        longPressTimerRef.current = setTimeout(() => {
          if (onLongPress) {
            onLongPress(email.id, allActions);
            setShowContextMenu(true);
          }
        }, 500);
      },
      [allActions, email.id, onLongPress],
    );

    const handleTouchMove = useCallback(
      (e: TouchEvent<HTMLDivElement>): void => {
        const touch = e.touches[0];
        if (!touch) return;

        // Cancel long press on movement
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }

        const dx = touch.clientX - startXRef.current;
        const dy = touch.clientY - startYRef.current;

        // Determine direction on first movement
        if (!isHorizontalRef.current && !isSwiping) {
          if (Math.abs(dx) > 8) {
            isHorizontalRef.current = true;
            setIsSwiping(true);
          } else if (Math.abs(dy) > 8) {
            return; // vertical scroll — do not capture
          } else {
            return; // not enough movement yet
          }
        }

        if (!isHorizontalRef.current) return;

        lastTranslateRef.current = dx;
        setTranslateX(dx);
        updateZone(dx);
      },
      [isSwiping, updateZone],
    );

    const handleTouchEnd = useCallback((): void => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      if (!isSwiping) {
        // Tap
        if (Math.abs(lastTranslateRef.current) < 5) {
          onPress?.(email.id);
        }
        return;
      }

      const tx = lastTranslateRef.current;
      const elapsed = Date.now() - startTimeRef.current;
      const velocity = Math.abs(tx) / (elapsed / 1000);

      const action = resolveAction(tx, config);
      const isFlick = velocity > config.velocityCommit;

      if (action) {
        commitAction(action);
      } else if (isFlick) {
        // Flick commit: pick first action in swipe direction
        const flickActions = tx > 0 ? config.rightActions : config.leftActions;
        const flickAction = flickActions[0];
        if (flickAction) {
          commitAction(flickAction);
        } else {
          setTranslateX(0);
          setIsSwiping(false);
          lastZoneRef.current = 0;
        }
      } else {
        // Snap back
        setTranslateX(0);
        setIsSwiping(false);
        lastZoneRef.current = 0;
      }
    }, [commitAction, config, email.id, isSwiping, onPress]);

    // ── Hover action buttons (desktop fallback) ─────────────────
    const handleMouseEnter = useCallback((): void => {
      setHoverActions(true);
    }, []);

    const handleMouseLeave = useCallback((): void => {
      setHoverActions(false);
    }, []);

    const handleActionClick = useCallback(
      (e: MouseEvent<HTMLButtonElement>, action: SwipeAction): void => {
        e.stopPropagation();
        onAction(email.id, action.kind);
        if (action.destructive && onUndoRequest) {
          onUndoRequest(email.id, action.kind);
        }
      },
      [email.id, onAction, onUndoRequest],
    );

    const handleRowClick = useCallback((): void => {
      if (!isSwiping) {
        onPress?.(email.id);
      }
    }, [email.id, isSwiping, onPress]);

    // ── Context menu action handler ────────────────────────────
    const handleContextAction = useCallback(
      (action: SwipeAction): void => {
        setShowContextMenu(false);
        onAction(email.id, action.kind);
        if (action.destructive && onUndoRequest) {
          onUndoRequest(email.id, action.kind);
        }
      },
      [email.id, onAction, onUndoRequest],
    );

    // ── Resolved active action for background color ─────────────
    const activeAction = resolveAction(translateX, config);

    // ── Transition styling ──────────────────────────────────────
    const transitionStyle = isSwiping
      ? "none"
      : reduced
        ? "transform 0s, opacity 0s, height 0s"
        : "transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.25s ease, height 0.25s ease";

    return (
      <Box
        ref={ref}
        className={`relative overflow-hidden ${isExiting ? "h-0 opacity-0" : ""} ${className}`}
        style={{
          transition: isExiting
            ? reduced
              ? "height 0s, opacity 0s"
              : "height 0.25s ease, opacity 0.22s ease"
            : undefined,
        }}
        {...props}
      >
        {/* Background action indicator */}
        <Box
          className="absolute inset-0 flex items-center justify-between px-7"
          style={{
            backgroundColor: getActionColor(activeAction),
            transition: reduced ? "none" : "background-color 0.15s ease",
          }}
          aria-hidden="true"
        >
          {/* Right-side actions preview (shown when swiping right) */}
          {translateX > 0 && activeAction ? (
            <Box className="flex items-center gap-2">
              <Text variant="body-sm" className="text-white text-lg">{activeAction.icon}</Text>
              <Text variant="body-sm" className="text-white font-semibold text-xs tracking-wide uppercase">
                {activeAction.label}
              </Text>
            </Box>
          ) : (
            <Box />
          )}

          {/* Left-side actions preview (shown when swiping left) */}
          {translateX < 0 && activeAction ? (
            <Box className="flex items-center gap-2">
              <Text variant="body-sm" className="text-white font-semibold text-xs tracking-wide uppercase">
                {activeAction.label}
              </Text>
              <Text variant="body-sm" className="text-white text-lg">{activeAction.icon}</Text>
            </Box>
          ) : (
            <Box />
          )}
        </Box>

        {/* Swipeable row */}
        <Box
          role="button"
          tabIndex={0}
          className={`relative flex items-start gap-3 px-4 py-3 cursor-pointer bg-surface border-b border-border ${
            email.unread ? "bg-surface-active" : ""
          }`}
          style={{
            transform: `translateX(${translateX}px)`,
            transition: transitionStyle,
            touchAction: "pan-y",
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={handleRowClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onPress?.(email.id);
            }
          }}
          aria-label={`Email from ${email.from}: ${email.subject}. ${
            email.unread ? "Unread." : ""
          } Received ${email.receivedAt}`}
        >
          {/* Unread indicator */}
          {email.unread ? (
            <Box
              className="w-2 h-2 rounded-full bg-brand-400 mt-2 shrink-0"
              aria-hidden="true"
            />
          ) : null}

          {/* Content */}
          <Box className="flex-1 min-w-0">
            <Box className="flex items-center justify-between gap-2 mb-0.5">
              <Text
                variant="body-sm"
                className={`truncate ${email.unread ? "font-bold text-content-primary" : "font-medium text-content-secondary"}`}
              >
                {email.from}
              </Text>
              <Text variant="body-sm" muted className="shrink-0">
                {email.receivedAt}
              </Text>
            </Box>
            <Text
              variant="body-sm"
              className={`truncate mb-0.5 ${email.unread ? "font-semibold text-content-primary" : "text-content-secondary"}`}
            >
              {email.subject}
            </Text>
            <Text variant="body-sm" muted className="truncate">
              {email.preview}
            </Text>
          </Box>

          {/* Desktop hover actions */}
          {hoverActions && !isSwiping ? (
            <Box
              className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-surface rounded-lg px-1 py-1 shadow-md border border-border"
              aria-label="Quick actions"
            >
              {allActions.map((action) => (
                <button
                  key={action.kind}
                  type="button"
                  className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-surface-hover transition-colors text-sm"
                  style={{ minWidth: 32, minHeight: 32 }}
                  onClick={(e) => handleActionClick(e, action)}
                  aria-label={action.label}
                  title={action.label}
                >
                  {action.icon}
                </button>
              ))}
            </Box>
          ) : null}
        </Box>

        {/* Accessibility context menu (triggered by long press) */}
        {showContextMenu ? (
          <Box className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
            <Box className="bg-surface rounded-xl p-2 shadow-xl border border-border min-w-48">
              <Text variant="body-sm" muted className="px-3 py-2 font-semibold uppercase tracking-wide">
                Actions
              </Text>
              {allActions.map((action) => (
                <button
                  key={action.kind}
                  type="button"
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-surface-hover transition-colors text-left"
                  style={{ minHeight: 44 }}
                  onClick={() => handleContextAction(action)}
                  aria-label={action.label}
                >
                  <span className="text-base">{action.icon}</span>
                  <Text variant="body-sm" className="text-content-primary">
                    {action.label}
                  </Text>
                </button>
              ))}
              <button
                type="button"
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-surface-hover transition-colors text-left mt-1 border-t border-border"
                style={{ minHeight: 44 }}
                onClick={() => setShowContextMenu(false)}
                aria-label="Cancel"
              >
                <Text variant="body-sm" muted>
                  Cancel
                </Text>
              </button>
            </Box>
          </Box>
        ) : null}
      </Box>
    );
  },
);

SwipeableEmailRow.displayName = "SwipeableEmailRow";
