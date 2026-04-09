"use client";

/**
 * AnimatedDragItem — drag-and-drop visual feedback wrapper.
 *
 * Provides lift-on-drag visual feedback using Framer Motion's drag
 * capabilities. The item lifts with a shadow when dragged, and snaps
 * back to position with spring physics when released.
 *
 * Used by email list items (drag to snooze, drag to folder), and
 * any reorderable list content.
 */

import { motion, useMotionValue, useTransform } from "motion/react";
import type { ReactNode } from "react";
import {
  SPRING_HEAVY,
  SPRING_SNAPPY,
  useViennaReducedMotion,
} from "../lib/animations";

export type DragAxis = "x" | "y" | "both" | false;

export interface AnimatedDragItemProps {
  children: ReactNode;
  /** Which axis to allow dragging. Default: "y". */
  dragAxis?: DragAxis;
  /** Extra CSS classes. */
  className?: string;
  /** Called when the item is dropped. Receives the offset. */
  onDragEnd?: (offset: { x: number; y: number }) => void;
  /** Called continuously during drag with offset. */
  onDrag?: (offset: { x: number; y: number }) => void;
  /** Scale factor when lifted. Default: 1.02. */
  liftScale?: number;
  /** Constrain drag within parent. Default: false. */
  dragConstraints?: boolean | { top?: number; right?: number; bottom?: number; left?: number };
  /** Enable layout animation for reordering. Default: true. */
  layoutAnimation?: boolean;
  /** Unique layout ID for AnimatePresence + layout. */
  layoutId?: string;
  /** ARIA label for the draggable item. */
  ariaLabel?: string;
}

export function AnimatedDragItem({
  children,
  dragAxis = "y",
  className,
  onDragEnd,
  onDrag,
  liftScale = 1.02,
  dragConstraints = false,
  layoutAnimation = true,
  layoutId,
  ariaLabel,
}: AnimatedDragItemProps): React.ReactNode {
  const reduced = useViennaReducedMotion();
  const y = useMotionValue(0);
  const x = useMotionValue(0);

  // Shadow intensity increases with drag distance
  const dragDistance = useTransform(
    [x, y],
    ([latestX, latestY]: number[]) =>
      Math.sqrt((latestX ?? 0) ** 2 + (latestY ?? 0) ** 2),
  );
  const boxShadow = useTransform(dragDistance, [0, 100], [
    "0 1px 3px rgba(0,0,0,0.06)",
    "0 20px 40px rgba(0,0,0,0.15)",
  ]);

  const dragProp = dragAxis === "both" ? true : dragAxis === false ? false : dragAxis;

  const constraints =
    typeof dragConstraints === "boolean"
      ? dragConstraints
        ? { top: 0, right: 0, bottom: 0, left: 0 }
        : false
      : dragConstraints;

  const handleDrag = (): void => {
    if (onDrag) {
      onDrag({ x: x.get(), y: y.get() });
    }
  };

  const handleDragEnd = (): void => {
    if (onDragEnd) {
      onDragEnd({ x: x.get(), y: y.get() });
    }
  };

  return (
    <motion.div
      className={`${className ?? ""} touch-none`}
      drag={reduced ? false : dragProp}
      dragConstraints={constraints}
      dragElastic={0.1}
      dragSnapToOrigin
      style={{ x, y, boxShadow, cursor: reduced ? "default" : "grab", zIndex: 0 }}
      whileDrag={
        reduced
          ? { scale: 1 }
          : {
              scale: liftScale,
              cursor: "grabbing",
              zIndex: 50,
            }
      }
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      transition={SPRING_SNAPPY}
      layout={layoutAnimation ? true : false}
      {...(layoutId !== undefined ? { layoutId } : {})}
      role="listitem"
      aria-label={ariaLabel}
      aria-roledescription="Draggable item"
    >
      {children}
    </motion.div>
  );
}

/**
 * AnimatedDropZone — visual feedback for drop target areas.
 */
export interface AnimatedDropZoneProps {
  children: ReactNode;
  /** Whether an item is currently being dragged over this zone. */
  active: boolean;
  /** Extra CSS classes. */
  className?: string;
  /** ARIA label for the drop zone. */
  ariaLabel?: string;
}

export function AnimatedDropZone({
  children,
  active,
  className,
  ariaLabel,
}: AnimatedDropZoneProps): React.ReactNode {
  const reduced = useViennaReducedMotion();

  return (
    <motion.div
      className={`rounded-lg border-2 border-dashed transition-colors ${className ?? ""}`}
      animate={
        reduced
          ? { opacity: 1 }
          : {
              borderColor: active ? "rgba(59,130,246,0.5)" : "rgba(0,0,0,0.1)",
              backgroundColor: active ? "rgba(59,130,246,0.04)" : "rgba(0,0,0,0)",
              scale: active ? 1.01 : 1,
            }
      }
      transition={SPRING_HEAVY}
      role="region"
      aria-label={ariaLabel}
      aria-dropeffect={active ? "move" : "none"}
    >
      {children}
    </motion.div>
  );
}
