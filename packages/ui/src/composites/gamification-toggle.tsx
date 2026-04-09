"use client";

import React, { forwardRef, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GamificationToggleProps extends Omit<HTMLAttributes<HTMLDivElement>, "onToggle"> {
  /** Whether gamification is currently enabled. */
  enabled: boolean;
  /** Callback when the toggle is changed. */
  onToggle: (enabled: boolean) => void;
  /** Whether the toggle is in a loading state. */
  loading?: boolean;
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const GamificationToggle = forwardRef<
  HTMLDivElement,
  GamificationToggleProps
>(function GamificationToggle(
  { enabled, onToggle, loading = false, className = "", ...props },
  ref,
) {
  const handleClick = (): void => {
    if (!loading) {
      onToggle(!enabled);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <Box
      ref={ref}
      className={`flex items-center justify-between p-4 rounded-lg border border-border bg-surface ${className}`}
      {...props}
    >
      <Box className="flex-1 min-w-0 mr-4">
        <Text variant="body-md" className="font-medium">
          Inbox Zero Rituals
        </Text>
        <Text variant="body-sm" muted>
          Track streaks, earn achievements, and celebrate clearing your inbox.
          This is optional and can be turned off at any time.
        </Text>
      </Box>
      <Box
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
          loading ? "opacity-50 pointer-events-none" : ""
        } ${enabled ? "bg-brand-600" : "bg-surface-tertiary"}`}
        role="switch"
        aria-checked={enabled}
        aria-label="Toggle inbox zero gamification"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <Box
          as="span"
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            enabled ? "translate-x-5" : "translate-x-0"
          }`}
          aria-hidden="true"
        />
      </Box>
    </Box>
  );
});

GamificationToggle.displayName = "GamificationToggle";
