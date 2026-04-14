"use client";

import React, { forwardRef, useState, useCallback, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PhishingRiskLevel = "safe" | "low" | "medium" | "high" | "critical";

export type PhishingSuggestedAction =
  | "delete"
  | "report"
  | "verify_sender"
  | "safe_to_open";

export type PhishingSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface PhishingIndicator {
  readonly type: string;
  readonly severity: PhishingSeverity;
  readonly evidence: string;
  readonly explanation: string;
}

export interface PhishingAnalysisData {
  readonly riskLevel: PhishingRiskLevel;
  readonly riskScore: number;
  readonly isPhishing: boolean;
  readonly indicators: readonly PhishingIndicator[];
  readonly explanation: string;
  readonly suggestedActions: readonly PhishingSuggestedAction[];
}

export interface PhishingWarningBannerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onError"> {
  /** Phishing analysis data from the API. */
  analysis: PhishingAnalysisData | null;
  /** Email ID (used for report callback). */
  emailId?: string;
  /** Sender address (for display). */
  senderAddress?: string;
  /** Callback to report this email as phishing (POST /v1/security/report-phishing). */
  onReport?: (emailId: string, reason: string) => Promise<void>;
  /** Callback to delete the email. */
  onDelete?: (emailId: string) => Promise<void>;
  /** Called on error. */
  onError?: (error: string) => void;
  /** Whether to show detailed indicators list. */
  showIndicators?: boolean;
  /** Whether to auto-collapse for low-risk emails. */
  autoCollapse?: boolean;
  /** Whether the banner can be dismissed. */
  dismissible?: boolean;
  className?: string;
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function WarningTriangleIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-5 h-5 flex-shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <Box
        as="path"
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </Box>
  );
}

WarningTriangleIcon.displayName = "WarningTriangleIcon";

function ShieldAlertIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-5 h-5 flex-shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <Box
        as="path"
        fillRule="evenodd"
        d="M9.661 2.237a.531.531 0 01.678 0 11.947 11.947 0 007.078 2.749.5.5 0 01.479.425c.069.52.104 1.05.104 1.592 0 5.842-3.898 10.29-8.293 11.847a.5.5 0 01-.314 0C5.02 17.287 1.12 12.84 1.12 6.997c0-.538.035-1.069.104-1.589a.5.5 0 01.48-.425 11.947 11.947 0 007.078-2.749zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </Box>
  );
}

ShieldAlertIcon.displayName = "ShieldAlertIcon";

function CheckCircleIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-5 h-5 flex-shrink-0"
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

function FlagIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-4 h-4 flex-shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <Box
        as="path"
        d="M3.5 2.75a.75.75 0 00-1.5 0v14.5a.75.75 0 001.5 0v-4.392l1.657-.348a6.449 6.449 0 014.271.572 7.948 7.948 0 005.965.524l2.078-.64A.75.75 0 0018 11.75V3.885a.75.75 0 00-.985-.71l-2.286.703a7.948 7.948 0 01-5.965-.524 6.449 6.449 0 00-4.271-.572L3.5 3.085V2.75z"
      />
    </Box>
  );
}

FlagIcon.displayName = "FlagIcon";

function CloseIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-4 h-4"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <Box
        as="path"
        d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
      />
    </Box>
  );
}

CloseIcon.displayName = "CloseIcon";

// ─── Severity badge ─────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: PhishingSeverity }): React.ReactElement {
  const colorMap: Record<PhishingSeverity, string> = {
    info: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    low: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    high: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
    critical: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  };
  return (
    <Text
      as="span"
      variant="caption"
      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${colorMap[severity]}`}
    >
      {severity}
    </Text>
  );
}

SeverityBadge.displayName = "SeverityBadge";

// ─── Styling helpers ────────────────────────────────────────────────────────

interface RiskStyles {
  readonly bg: string;
  readonly border: string;
  readonly text: string;
  readonly iconColor: string;
}

function getRiskStyles(level: PhishingRiskLevel): RiskStyles {
  switch (level) {
    case "safe":
      return {
        bg: "bg-green-50 dark:bg-green-950",
        border: "border-green-200 dark:border-green-800",
        text: "text-green-800 dark:text-green-200",
        iconColor: "text-green-600 dark:text-green-400",
      };
    case "low":
      return {
        bg: "bg-blue-50 dark:bg-blue-950",
        border: "border-blue-200 dark:border-blue-800",
        text: "text-blue-800 dark:text-blue-200",
        iconColor: "text-blue-600 dark:text-blue-400",
      };
    case "medium":
      return {
        bg: "bg-yellow-50 dark:bg-yellow-950",
        border: "border-yellow-200 dark:border-yellow-800",
        text: "text-yellow-800 dark:text-yellow-200",
        iconColor: "text-yellow-600 dark:text-yellow-400",
      };
    case "high":
      return {
        bg: "bg-orange-50 dark:bg-orange-950",
        border: "border-orange-300 dark:border-orange-800",
        text: "text-orange-800 dark:text-orange-200",
        iconColor: "text-orange-600 dark:text-orange-400",
      };
    case "critical":
      return {
        bg: "bg-red-50 dark:bg-red-950",
        border: "border-red-300 dark:border-red-800",
        text: "text-red-800 dark:text-red-200",
        iconColor: "text-red-600 dark:text-red-400",
      };
  }
}

function getRiskLabel(level: PhishingRiskLevel): string {
  switch (level) {
    case "safe":
      return "This email appears safe";
    case "low":
      return "Low risk detected";
    case "medium":
      return "This email may be suspicious";
    case "high":
      return "This email is likely a phishing attempt";
    case "critical":
      return "This email is almost certainly a phishing attack";
  }
}

function getActionLabel(action: PhishingSuggestedAction): string {
  switch (action) {
    case "delete":
      return "Delete this email";
    case "report":
      return "Report as phishing";
    case "verify_sender":
      return "Verify sender";
    case "safe_to_open":
      return "Safe to open";
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export const PhishingWarningBanner = forwardRef<HTMLDivElement, PhishingWarningBannerProps>(
  function PhishingWarningBanner(
    {
      analysis,
      emailId,
      senderAddress,
      onReport,
      onDelete,
      onError,
      showIndicators = true,
      autoCollapse = true,
      dismissible = true,
      className = "",
      ...props
    },
    ref,
  ) {
    const [dismissed, setDismissed] = useState(false);
    const [indicatorsVisible, setIndicatorsVisible] = useState(false);
    const [isReporting, setIsReporting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [reported, setReported] = useState(false);

    const handleDismiss = useCallback((): void => {
      setDismissed(true);
    }, []);

    const handleToggleIndicators = useCallback((): void => {
      setIndicatorsVisible((prev) => !prev);
    }, []);

    const handleReport = useCallback(async (): Promise<void> => {
      if (!onReport || !emailId) return;
      setIsReporting(true);
      try {
        await onReport(emailId, `User reported as phishing. Risk score: ${analysis?.riskScore ?? 0}`);
        setReported(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to report";
        onError?.(message);
      } finally {
        setIsReporting(false);
      }
    }, [onReport, emailId, analysis, onError]);

    const handleDelete = useCallback(async (): Promise<void> => {
      if (!onDelete || !emailId) return;
      setIsDeleting(true);
      try {
        await onDelete(emailId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to delete";
        onError?.(message);
      } finally {
        setIsDeleting(false);
      }
    }, [onDelete, emailId, onError]);

    // Don't render if no analysis data or dismissed
    if (!analysis || dismissed) return null;

    // Auto-collapse for safe emails
    if (autoCollapse && analysis.riskLevel === "safe") return null;

    const styles = getRiskStyles(analysis.riskLevel);
    const isSevere = analysis.riskLevel === "high" || analysis.riskLevel === "critical";

    return (
      <Box
        ref={ref}
        className={`rounded-lg border-2 ${styles.bg} ${styles.border} ${className}`}
        role="alert"
        aria-label={getRiskLabel(analysis.riskLevel)}
        {...props}
      >
        {/* Header */}
        <Box className="flex items-start gap-3 p-4">
          <Box className={`mt-0.5 ${styles.iconColor}`}>
            {isSevere ? <ShieldAlertIcon /> : <WarningTriangleIcon />}
          </Box>
          <Box className="flex-1 min-w-0">
            <Box className="flex items-center gap-2 mb-1">
              <Text as="span" variant="body-sm" className={`font-semibold ${styles.text}`}>
                {getRiskLabel(analysis.riskLevel)}
              </Text>
              <Text
                as="span"
                variant="caption"
                className={`px-1.5 py-0.5 rounded-full font-mono text-[10px] font-semibold ${styles.text} ${analysis.riskScore >= 55 ? "bg-red-200 dark:bg-red-800" : "bg-yellow-200 dark:bg-yellow-800"}`}
              >
                {analysis.riskScore}/100
              </Text>
            </Box>
            <Text as="span" variant="body-sm" className={styles.text}>
              {analysis.explanation}
            </Text>
          </Box>
          {dismissible && !isSevere && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-6 w-6 p-0 flex-shrink-0"
              aria-label="Dismiss warning"
            >
              <CloseIcon />
            </Button>
          )}
        </Box>

        {/* Indicators */}
        {showIndicators && analysis.indicators.length > 0 && (
          <Box className="px-4 pb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleIndicators}
              className="h-6 px-2 text-[11px]"
              aria-expanded={indicatorsVisible}
              aria-label={indicatorsVisible ? "Hide red flags" : "Show red flags"}
            >
              {indicatorsVisible
                ? "Hide red flags"
                : `Show ${analysis.indicators.length} red flag${analysis.indicators.length === 1 ? "" : "s"}`}
            </Button>

            {indicatorsVisible && (
              <Box className="mt-2 flex flex-col gap-2">
                {analysis.indicators.map((indicator, i) => (
                  <Box
                    key={i}
                    className="flex items-start gap-2 p-2 rounded-md bg-white/60 dark:bg-black/20"
                  >
                    <SeverityBadge severity={indicator.severity} />
                    <Box className="flex-1 min-w-0">
                      <Text as="span" variant="caption" className="font-medium block">
                        {indicator.explanation}
                      </Text>
                      <Text as="span" variant="caption" muted className="block mt-0.5">
                        Evidence: {indicator.evidence}
                      </Text>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        )}

        {/* Actions */}
        <Box className="flex items-center gap-2 px-4 py-3 border-t border-inherit">
          {analysis.suggestedActions.includes("report") && !reported && (
            <Button
              variant={isSevere ? "destructive" : "secondary"}
              size="sm"
              loading={isReporting}
              onClick={handleReport}
              icon={<FlagIcon />}
              aria-label={`Report ${senderAddress ?? "this email"} as phishing`}
            >
              {getActionLabel("report")}
            </Button>
          )}
          {reported && (
            <Box className="inline-flex items-center gap-1.5">
              <Box className="text-green-600 dark:text-green-400">
                <CheckCircleIcon />
              </Box>
              <Text as="span" variant="caption" className="text-green-700 dark:text-green-300">
                Reported. Thank you for keeping everyone safe.
              </Text>
            </Box>
          )}
          {analysis.suggestedActions.includes("delete") && onDelete && emailId && (
            <Button
              variant="destructive"
              size="sm"
              loading={isDeleting}
              onClick={handleDelete}
              aria-label="Delete this email"
            >
              {getActionLabel("delete")}
            </Button>
          )}
          {analysis.suggestedActions.includes("verify_sender") && (
            <Text as="span" variant="caption" muted>
              Consider verifying the sender before taking action.
            </Text>
          )}
          {analysis.suggestedActions.includes("safe_to_open") && (
            <Box className="inline-flex items-center gap-1.5">
              <Box className="text-green-600 dark:text-green-400">
                <CheckCircleIcon />
              </Box>
              <Text as="span" variant="caption" className="text-green-700 dark:text-green-300">
                {getActionLabel("safe_to_open")}
              </Text>
            </Box>
          )}
        </Box>
      </Box>
    );
  },
);

PhishingWarningBanner.displayName = "PhishingWarningBanner";
