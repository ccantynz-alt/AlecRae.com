"use client";

import React, { forwardRef, useState, useCallback, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";

// ─── Types ──────────────────────────────────────────────────────────────────

export type UnsubscribeStatus =
  | "idle"
  | "checking"
  | "available"
  | "unavailable"
  | "unsubscribing"
  | "success"
  | "failed";

export interface UnsubscribeOption {
  method: "one_click_post" | "http" | "mailto";
  target: string;
  source: string;
  priority: number;
  confidence: number;
  label?: string;
}

export interface UnsubscribeResult {
  id: string;
  emailId: string;
  from: string;
  method: string;
  status: "success" | "failed" | "no_option";
  confidence?: number;
  confirmationText?: string;
  error?: string;
  steps?: string[];
}

export interface UnsubscribeButtonProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onError"> {
  /** Email ID to unsubscribe from. */
  emailId: string;
  /** Sender address (for display). */
  senderAddress?: string;
  /** Pre-fetched unsubscribe options (avoids a network call). */
  options?: UnsubscribeOption[];
  /** Whether unsubscribe is available (skip checking step). */
  hasUnsubscribe?: boolean;
  /** Callback to check for unsubscribe options (GET /v1/emails/:id/unsubscribe/options). */
  onCheckOptions?: (emailId: string) => Promise<{
    options: UnsubscribeOption[];
    hasUnsubscribe: boolean;
  }>;
  /** Callback to execute the unsubscribe (POST /v1/emails/:id/unsubscribe). */
  onUnsubscribe?: (
    emailId: string,
    option?: { method: string; target: string },
  ) => Promise<UnsubscribeResult>;
  /** Called when unsubscribe completes successfully. */
  onSuccess?: (result: UnsubscribeResult) => void;
  /** Called on error. */
  onError?: (error: string) => void;
  /** Size variant. */
  size?: "sm" | "md";
  /** Display mode. */
  variant?: "inline" | "banner";
  className?: string;
}

// ─── Status icons (SVG-based, no external deps) ────────────────────────────

function CheckCircleIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-4 h-4 text-status-success flex-shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <Box
        as="path"
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    </Box>
  );
}

CheckCircleIcon.displayName = "CheckCircleIcon";

function XCircleIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-4 h-4 text-status-error flex-shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <Box
        as="path"
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
        clipRule="evenodd"
      />
    </Box>
  );
}

XCircleIcon.displayName = "XCircleIcon";

function MailOffIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-4 h-4 flex-shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <Box as="path" d="M22 8.5V6a2 2 0 00-2-2H4a2 2 0 00-2 2v12c0 1.1.9 2 2 2h16" />
      <Box as="polyline" points="22,6 12,13 2,6" />
      <Box as="line" x1="18" y1="16" x2="24" y2="22" />
      <Box as="line" x1="24" y1="16" x2="18" y2="22" />
    </Box>
  );
}

MailOffIcon.displayName = "MailOffIcon";

// ─── Confidence badge ──────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: number }): React.ReactElement {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 90
      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
      : pct >= 70
        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
        : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  return (
    <Text as="span" variant="caption" className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${color}`}>
      {pct}% confidence
    </Text>
  );
}

ConfidenceBadge.displayName = "ConfidenceBadge";

// ─── Component ──────────────────────────────────────────────────────────────

export const UnsubscribeButton = forwardRef<HTMLDivElement, UnsubscribeButtonProps>(
  function UnsubscribeButton(
    {
      emailId,
      senderAddress,
      options: preloadedOptions,
      hasUnsubscribe: preloadedHasUnsubscribe,
      onCheckOptions,
      onUnsubscribe,
      onSuccess,
      onError,
      size = "sm",
      variant = "inline",
      className = "",
      ...props
    },
    ref,
  ) {
    const [status, setStatus] = useState<UnsubscribeStatus>(
      preloadedHasUnsubscribe === true
        ? "available"
        : preloadedHasUnsubscribe === false
          ? "unavailable"
          : "idle",
    );
    const [options, setOptions] = useState<UnsubscribeOption[]>(preloadedOptions ?? []);
    const [result, setResult] = useState<UnsubscribeResult | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handleCheckOptions = useCallback(async (): Promise<void> => {
      if (!onCheckOptions) return;
      setStatus("checking");
      try {
        const response = await onCheckOptions(emailId);
        setOptions(response.options);
        setStatus(response.hasUnsubscribe ? "available" : "unavailable");
      } catch (err) {
        setStatus("unavailable");
        const message = err instanceof Error ? err.message : "Failed to check options";
        setErrorMessage(message);
        onError?.(message);
      }
    }, [emailId, onCheckOptions, onError]);

    const handleUnsubscribe = useCallback(async (): Promise<void> => {
      if (!onUnsubscribe) return;
      setStatus("unsubscribing");
      setErrorMessage(null);
      try {
        const best = options[0];
        const optionArg = best
          ? { method: best.method, target: best.target }
          : undefined;
        const res = await onUnsubscribe(emailId, optionArg);
        setResult(res);
        if (res.status === "success") {
          setStatus("success");
          onSuccess?.(res);
        } else {
          setStatus("failed");
          const message = res.error ?? "Unsubscribe failed";
          setErrorMessage(message);
          onError?.(message);
        }
      } catch (err) {
        setStatus("failed");
        const message = err instanceof Error ? err.message : "Unsubscribe failed";
        setErrorMessage(message);
        onError?.(message);
      }
    }, [emailId, options, onUnsubscribe, onSuccess, onError]);

    const handleClick = useCallback(async (): Promise<void> => {
      if (status === "idle") {
        await handleCheckOptions();
      } else if (status === "available") {
        await handleUnsubscribe();
      } else if (status === "failed") {
        // Allow retry.
        await handleUnsubscribe();
      }
    }, [status, handleCheckOptions, handleUnsubscribe]);

    const bestOption = options[0];

    // ─── Inline variant ─────────────────────────────────────────────────

    if (variant === "inline") {
      return (
        <Box ref={ref} className={`inline-flex items-center gap-2 ${className}`} {...props}>
          {status === "success" ? (
            <Box className="inline-flex items-center gap-1.5">
              <CheckCircleIcon />
              <Text variant="caption" className="text-status-success">
                Unsubscribed
              </Text>
            </Box>
          ) : status === "unavailable" ? (
            <Text variant="caption" muted>
              No unsubscribe option
            </Text>
          ) : (
            <Button
              variant="ghost"
              size={size}
              loading={status === "checking" || status === "unsubscribing"}
              onClick={handleClick}
              aria-label={`Unsubscribe from ${senderAddress ?? "this sender"}`}
              icon={<MailOffIcon />}
            >
              {status === "failed" ? "Retry" : "Unsubscribe"}
            </Button>
          )}
          {status === "failed" && errorMessage && (
            <Box className="inline-flex items-center gap-1">
              <XCircleIcon />
              <Text variant="caption" className="text-status-error">
                {errorMessage}
              </Text>
            </Box>
          )}
        </Box>
      );
    }

    // ─── Banner variant ─────────────────────────────────────────────────

    return (
      <Box
        ref={ref}
        className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
          status === "success"
            ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800"
            : status === "failed"
              ? "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800"
              : "bg-surface-secondary border-border"
        } ${className}`}
        role="region"
        aria-label="Unsubscribe controls"
        {...props}
      >
        {status === "success" ? (
          <Box className="flex items-center gap-2 flex-1">
            <CheckCircleIcon />
            <Box className="flex-1">
              <Text variant="body-sm" className="text-status-success font-medium">
                Successfully unsubscribed
                {senderAddress ? ` from ${senderAddress}` : ""}
              </Text>
              {result?.confirmationText && (
                <Text variant="caption" muted className="mt-0.5">
                  {result.confirmationText}
                </Text>
              )}
            </Box>
          </Box>
        ) : (
          <Box className="flex items-center gap-3 flex-1">
            <MailOffIcon />
            <Box className="flex-1 min-w-0">
              <Text variant="body-sm" className="font-medium">
                {status === "unavailable"
                  ? "No unsubscribe option found"
                  : senderAddress
                    ? `Unsubscribe from ${senderAddress}`
                    : "Unsubscribe from this sender"}
              </Text>
              {bestOption && status === "available" && (
                <Box className="flex items-center gap-2 mt-0.5">
                  <Text variant="caption" muted>
                    via {bestOption.method === "one_click_post" ? "one-click" : bestOption.method}
                  </Text>
                  <ConfidenceBadge confidence={bestOption.confidence} />
                </Box>
              )}
              {status === "failed" && errorMessage && (
                <Text variant="caption" className="text-status-error mt-0.5">
                  {errorMessage}
                </Text>
              )}
            </Box>
            {status !== "unavailable" && (
              <Button
                variant={status === "failed" ? "destructive" : "primary"}
                size={size}
                loading={status === "checking" || status === "unsubscribing"}
                onClick={handleClick}
                aria-label={`Unsubscribe from ${senderAddress ?? "this sender"}`}
              >
                {status === "failed"
                  ? "Retry"
                  : status === "unsubscribing"
                    ? "Working..."
                    : status === "checking"
                      ? "Checking..."
                      : "Unsubscribe"}
              </Button>
            )}
          </Box>
        )}
      </Box>
    );
  },
);

UnsubscribeButton.displayName = "UnsubscribeButton";
