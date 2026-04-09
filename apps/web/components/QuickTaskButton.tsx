"use client";

/**
 * QuickTaskButton — One-click "Extract Tasks" button for thread view (S8).
 *
 * A compact button that lives in the thread toolbar. When clicked, it opens
 * the ActionItemExtractor panel (or triggers extraction inline).
 *
 * Provides two modes:
 *   - "button" — just the trigger button (parent manages panel)
 *   - "inline" — button + inline extraction panel below
 */

import type { ReactElement } from "react";
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Box, Button, Text } from "@emailed/ui";
import { ActionItemExtractor, type ThreadEmail } from "./ActionItemExtractor";
import {
  SPRING_SNAPPY,
  useViennaReducedMotion,
} from "../lib/animations";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface QuickTaskButtonProps {
  /** Thread ID. */
  threadId: string;
  /** Emails in the thread. */
  emails: readonly ThreadEmail[];
  /** Display mode: "button" (trigger only) or "inline" (button + panel). */
  mode?: "button" | "inline";
  /** Called when the button is clicked (for "button" mode). */
  onOpen?: () => void;
  /** Called when tasks are created (for "inline" mode). */
  onTasksCreated?: (count: number) => void;
  /** Extra Tailwind classes. */
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function QuickTaskButton({
  threadId,
  emails,
  mode = "inline",
  onOpen,
  onTasksCreated,
  className,
}: QuickTaskButtonProps): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const reduced = useViennaReducedMotion();

  const handleClick = useCallback((): void => {
    if (mode === "button" && onOpen !== undefined) {
      onOpen();
      return;
    }
    setIsOpen((prev) => !prev);
  }, [mode, onOpen]);

  const handleTasksCreated = useCallback(
    (count: number): void => {
      if (onTasksCreated !== undefined) {
        onTasksCreated(count);
      }
    },
    [onTasksCreated],
  );

  return (
    <Box className={`${className ?? ""}`}>
      {/* Trigger button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleClick}
        aria-label="Extract action items from this thread"
        aria-expanded={isOpen}
      >
        <Box className="flex items-center gap-1.5">
          {/* Checklist icon */}
          <Box className="w-4 h-4 text-violet-400" role="presentation">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4l2 2 4-4" />
              <path d="M10 3h4" />
              <path d="M10 7h4" />
              <path d="M2 10l2 2 4-4" />
              <path d="M10 11h4" />
            </svg>
          </Box>
          <Text variant="body-sm" className="text-xs text-white/70">
            Extract Tasks
          </Text>
        </Box>
      </Button>

      {/* Inline panel */}
      {mode === "inline" && (
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, height: "auto" }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={SPRING_SNAPPY}
              className="overflow-hidden"
            >
              <Box className="pt-3 border-t border-white/10 mt-3">
                <ActionItemExtractor
                  threadId={threadId}
                  emails={emails}
                  autoExtract
                  onTasksCreated={handleTasksCreated}
                />
              </Box>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </Box>
  );
}
