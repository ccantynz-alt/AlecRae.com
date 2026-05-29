"use client";

import React, { forwardRef, useState, useCallback, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EmailWarning {
  readonly type:
    | "missing_attachment"
    | "reply_all_risk"
    | "empty_subject"
    | "large_recipient_list"
    | "sensitive_content"
    | "missing_greeting"
    | "missing_signoff";
  readonly message: string;
  readonly severity: "info" | "warning" | "error";
}

export interface EmailWarningsBarProps extends HTMLAttributes<HTMLDivElement> {
  /** List of active warnings. */
  warnings: readonly EmailWarning[];
  /** Callback when user dismisses a warning. */
  onDismiss?: (warning: EmailWarning) => void;
  /** Callback when user wants to fix a warning (e.g., add attachment). */
  onFix?: (warning: EmailWarning) => void;
  /** Whether to show the bar even when empty (with "All clear" message). */
  showWhenClear?: boolean;
  className?: string;
}

// ─── Warning messages by type ───────────────────────────────────────────────

const WARNING_MESSAGES: Record<EmailWarning["type"], string> = {
  missing_attachment: "Attachment mentioned but not attached",
  reply_all_risk: "Consider if all recipients need this reply",
  empty_subject: "No subject line — most recipients will deprioritize",
  large_recipient_list: "Large number of recipients",
  sensitive_content: "May contain sensitive information",
  missing_greeting: "No greeting — consider adding one",
  missing_signoff: "No sign-off — consider adding one",
};

// ─── Severity styles ────────────────────────────────────────────────────────

interface SeverityStyles {
  readonly border: string;
  readonly bg: string;
  readonly dot: string;
  readonly text: string;
}

function getSeverityStyles(severity: EmailWarning["severity"]): SeverityStyles {
  switch (severity) {
    case "error":
      return {
        border: "border-l-red-500 dark:border-l-red-400",
        bg: "bg-red-50 dark:bg-red-950/40",
        dot: "bg-red-500 dark:bg-red-400",
        text: "text-red-800 dark:text-red-200",
      };
    case "warning":
      return {
        border: "border-l-amber-500 dark:border-l-amber-400",
        bg: "bg-amber-50 dark:bg-amber-950/40",
        dot: "bg-amber-500 dark:bg-amber-400",
        text: "text-amber-800 dark:text-amber-200",
      };
    case "info":
      return {
        border: "border-l-blue-500 dark:border-l-blue-400",
        bg: "bg-blue-50 dark:bg-blue-950/40",
        dot: "bg-blue-500 dark:bg-blue-400",
        text: "text-blue-800 dark:text-blue-200",
      };
  }
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function CloseIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-3 h-3"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <Box
        as="path"
        d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"
      />
    </Box>
  );
}

CloseIcon.displayName = "CloseIcon";

function CheckCircleIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-3.5 h-3.5 flex-shrink-0"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <Box
        as="path"
        fillRule="evenodd"
        d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.844-8.791a.75.75 0 00-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 10-1.114 1.004l2.25 2.5a.75.75 0 001.15-.043l4.25-5.5z"
        clipRule="evenodd"
      />
    </Box>
  );
}

CheckCircleIcon.displayName = "CheckCircleIcon";

// ─── Fixable warning types ──────────────────────────────────────────────────

const FIXABLE_TYPES: ReadonlySet<EmailWarning["type"]> = new Set([
  "missing_attachment",
  "empty_subject",
  "missing_greeting",
  "missing_signoff",
]);

// ─── Warning pill ───────────────────────────────────────────────────────────

interface WarningPillProps {
  readonly warning: EmailWarning;
  readonly onDismiss?: ((warning: EmailWarning) => void) | undefined;
  readonly onFix?: ((warning: EmailWarning) => void) | undefined;
}

function WarningPill({ warning, onDismiss, onFix }: WarningPillProps): React.ReactElement {
  const styles = getSeverityStyles(warning.severity);
  const canFix = FIXABLE_TYPES.has(warning.type) && onFix !== undefined;

  return (
    <Box
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border-l-2 ${styles.border} ${styles.bg} transition-opacity duration-200`}
      role="status"
    >
      <Box className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${styles.dot}`} aria-hidden="true" />
      <Text as="span" variant="caption" className={`${styles.text} whitespace-nowrap`}>
        {warning.message}
      </Text>
      {canFix && (
        <Button
          variant="ghost"
          size="sm"
          onClick={(): void => onFix(warning)}
          className="h-5 px-1.5 text-[10px] font-semibold"
          aria-label={`Fix: ${warning.message}`}
        >
          Fix
        </Button>
      )}
      {onDismiss && (
        <Button
          variant="ghost"
          size="sm"
          onClick={(): void => onDismiss(warning)}
          className="h-4 w-4 p-0 flex-shrink-0"
          aria-label={`Dismiss: ${warning.message}`}
        >
          <CloseIcon />
        </Button>
      )}
    </Box>
  );
}

WarningPill.displayName = "WarningPill";

// ─── Client-side warning detection ──────────────────────────────────────────

const ATTACHMENT_PATTERNS =
  /\b(attach(ed|ment|ing|ments)?|enclos(ed|ing|ure)|find attached|see attached|attached (is|are|file|document|here))\b/i;

const GREETING_PATTERNS =
  /^(hi|hello|hey|dear|good\s+(morning|afternoon|evening)|greetings|to whom)\b/im;

const SIGNOFF_PATTERNS =
  /(regards|sincerely|cheers|thanks|thank you|best|kind regards|warm regards|yours|respectfully|take care)\s*[,.]?\s*$/im;

const SENSITIVE_PATTERNS =
  /\b(ssn|social security|credit card|password|bank account|routing number|account number|passport|confidential)\b/i;

export function detectEmailWarnings(params: {
  body: string;
  subject?: string;
  recipientCount?: number;
  hasAttachments?: boolean;
}): EmailWarning[] {
  const { body, subject, recipientCount, hasAttachments } = params;
  const warnings: EmailWarning[] = [];
  const trimmedBody = body.trim();

  if (ATTACHMENT_PATTERNS.test(trimmedBody) && !hasAttachments) {
    warnings.push({
      type: "missing_attachment",
      message: WARNING_MESSAGES.missing_attachment,
      severity: "error",
    });
  }

  if (!subject || subject.trim().length === 0) {
    warnings.push({
      type: "empty_subject",
      message: WARNING_MESSAGES.empty_subject,
      severity: "warning",
    });
  }

  if (trimmedBody.length > 0 && !GREETING_PATTERNS.test(trimmedBody)) {
    warnings.push({
      type: "missing_greeting",
      message: WARNING_MESSAGES.missing_greeting,
      severity: "info",
    });
  }

  if (trimmedBody.length > 0 && !SIGNOFF_PATTERNS.test(trimmedBody)) {
    warnings.push({
      type: "missing_signoff",
      message: WARNING_MESSAGES.missing_signoff,
      severity: "info",
    });
  }

  if (recipientCount !== undefined && recipientCount > 10) {
    warnings.push({
      type: "large_recipient_list",
      message: WARNING_MESSAGES.large_recipient_list,
      severity: "warning",
    });
  }

  if (SENSITIVE_PATTERNS.test(trimmedBody)) {
    warnings.push({
      type: "sensitive_content",
      message: WARNING_MESSAGES.sensitive_content,
      severity: "warning",
    });
  }

  return warnings;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const EmailWarningsBar = forwardRef<HTMLDivElement, EmailWarningsBarProps>(
  function EmailWarningsBar(
    { warnings, onDismiss, onFix, showWhenClear = false, className = "", ...props },
    ref,
  ) {
    const [dismissedTypes, setDismissedTypes] = useState<ReadonlySet<EmailWarning["type"]>>(
      new Set(),
    );

    const handleDismiss = useCallback(
      (warning: EmailWarning): void => {
        setDismissedTypes((prev) => new Set([...prev, warning.type]));
        onDismiss?.(warning);
      },
      [onDismiss],
    );

    const visibleWarnings = warnings.filter((w) => !dismissedTypes.has(w.type));

    // Nothing to show and not in "show clear" mode
    if (visibleWarnings.length === 0 && !showWhenClear) {
      return null;
    }

    // All clear state
    if (visibleWarnings.length === 0 && showWhenClear) {
      return (
        <Box
          ref={ref}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md bg-green-50 border border-green-200 dark:bg-green-950/40 dark:border-green-800 ${className}`}
          role="status"
          aria-label="No compose warnings"
          {...props}
        >
          <Box className="text-green-600 dark:text-green-400">
            <CheckCircleIcon />
          </Box>
          <Text as="span" variant="caption" className="text-green-700 dark:text-green-300">
            All clear — no issues detected
          </Text>
        </Box>
      );
    }

    return (
      <Box
        ref={ref}
        className={`flex flex-wrap items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-secondary border border-border ${className}`}
        role="status"
        aria-label={`${visibleWarnings.length} compose warning${visibleWarnings.length === 1 ? "" : "s"}`}
        {...props}
      >
        {visibleWarnings.map((warning) => (
          <WarningPill
            key={warning.type}
            warning={warning}
            onDismiss={handleDismiss}
            onFix={onFix}
          />
        ))}
      </Box>
    );
  },
);

EmailWarningsBar.displayName = "EmailWarningsBar";
