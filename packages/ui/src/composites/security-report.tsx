"use client";

import React, { forwardRef, useState, useCallback, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";
import { Card, CardHeader, CardContent } from "../primitives/card";
import { SenderTrustBadge, type SenderVerificationData } from "./sender-trust-badge";
import { PhishingWarningBanner, type PhishingAnalysisData } from "./phishing-warning-banner";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SecurityReportData {
  readonly emailId: string;
  readonly subject?: string;
  readonly from?: string;
  readonly fromName?: string | null;
  readonly senderVerification: SenderVerificationData;
  readonly phishing: PhishingAnalysisData;
  readonly checkedAt?: string;
}

export interface SecurityReportProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onError"> {
  /** Full security report data from GET /v1/emails/:id/security. */
  report: SecurityReportData | null;
  /** Email ID for on-demand checking. */
  emailId?: string;
  /** Callback to fetch security report on demand. */
  onCheckSecurity?: (emailId: string) => Promise<SecurityReportData>;
  /** Callback to report as phishing. */
  onReport?: (emailId: string, reason: string) => Promise<void>;
  /** Callback to delete the email. */
  onDelete?: (emailId: string) => Promise<void>;
  /** Called on error. */
  onError?: (error: string) => void;
  /** Display mode. */
  variant?: "compact" | "full";
  className?: string;
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function ShieldIcon(): React.ReactElement {
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
        d="M9.661 2.237a.531.531 0 01.678 0 11.947 11.947 0 007.078 2.749.5.5 0 01.479.425c.069.52.104 1.05.104 1.592 0 5.842-3.898 10.29-8.293 11.847a.5.5 0 01-.314 0C5.02 17.287 1.12 12.84 1.12 6.997c0-.538.035-1.069.104-1.589a.5.5 0 01.48-.425 11.947 11.947 0 007.078-2.749z"
        clipRule="evenodd"
      />
    </Box>
  );
}

ShieldIcon.displayName = "ShieldIcon";

function RefreshIcon(): React.ReactElement {
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
        fillRule="evenodd"
        d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.598a.75.75 0 00-.75.75v3.634a.75.75 0 001.5 0v-2.134l.426.426A7 7 0 0016.712 11.7a.75.75 0 00-1.397-.547l-.003.006v.001zm.376-5.609a.75.75 0 00-1.5 0v2.134l-.426-.426A7 7 0 003.288 11.3a.75.75 0 001.397.547l.003-.006v-.001a5.5 5.5 0 019.201-2.466l.312.311h-2.433a.75.75 0 000 1.5h3.634a.75.75 0 00.75-.75V5.815h-.064z"
        clipRule="evenodd"
      />
    </Box>
  );
}

RefreshIcon.displayName = "RefreshIcon";

// ─── Overall risk badge ─────────────────────────────────────────────────────

interface OverallRiskBadgeProps {
  riskLevel: PhishingAnalysisData["riskLevel"];
  riskScore: number;
  trustLevel: SenderVerificationData["trustLevel"];
  reputationScore: number;
}

function OverallRiskBadge({
  riskLevel,
  riskScore,
  trustLevel,
  reputationScore,
}: OverallRiskBadgeProps): React.ReactElement {
  // Combine signals into an overall assessment
  const isCritical = riskLevel === "critical" || riskLevel === "high";
  const isSafe = riskLevel === "safe" && (trustLevel === "high" || trustLevel === "medium");
  const overallLabel = isCritical
    ? "Dangerous"
    : isSafe
      ? "Secure"
      : riskLevel === "medium" || trustLevel === "suspicious"
        ? "Caution"
        : "Normal";
  const overallColor = isCritical
    ? "bg-red-500 text-white"
    : isSafe
      ? "bg-green-500 text-white"
      : riskLevel === "medium" || trustLevel === "suspicious"
        ? "bg-yellow-500 text-white"
        : "bg-blue-500 text-white";

  return (
    <Box className="flex items-center gap-3">
      <Box className={`px-3 py-1.5 rounded-full ${overallColor}`}>
        <Text as="span" variant="caption" className="font-semibold text-inherit">
          {overallLabel}
        </Text>
      </Box>
      <Box className="flex gap-4">
        <Box className="text-center">
          <Text as="span" variant="caption" muted className="block text-[10px]">
            Phishing
          </Text>
          <Text
            as="span"
            variant="caption"
            className={`font-mono font-semibold ${riskScore >= 55 ? "text-red-600 dark:text-red-400" : riskScore >= 30 ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400"}`}
          >
            {riskScore}/100
          </Text>
        </Box>
        <Box className="text-center">
          <Text as="span" variant="caption" muted className="block text-[10px]">
            Sender
          </Text>
          <Text
            as="span"
            variant="caption"
            className={`font-mono font-semibold ${reputationScore >= 80 ? "text-green-600 dark:text-green-400" : reputationScore >= 60 ? "text-blue-600 dark:text-blue-400" : reputationScore >= 35 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`}
          >
            {reputationScore}/100
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

OverallRiskBadge.displayName = "OverallRiskBadge";

// ─── Component ──────────────────────────────────────────────────────────────

export const SecurityReport = forwardRef<HTMLDivElement, SecurityReportProps>(
  function SecurityReport(
    {
      report,
      emailId,
      onCheckSecurity,
      onReport,
      onDelete,
      onError,
      variant = "full",
      className = "",
      ...props
    },
    ref,
  ) {
    const [isLoading, setIsLoading] = useState(false);
    const [data, setData] = useState<SecurityReportData | null>(report);

    const activeData = data ?? report;

    const handleCheck = useCallback(async (): Promise<void> => {
      const targetId = emailId ?? activeData?.emailId;
      if (!onCheckSecurity || !targetId) return;
      setIsLoading(true);
      try {
        const result = await onCheckSecurity(targetId);
        setData(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Security check failed";
        onError?.(message);
      } finally {
        setIsLoading(false);
      }
    }, [onCheckSecurity, emailId, activeData, onError]);

    // No data — show a check button
    if (!activeData) {
      if (onCheckSecurity && emailId) {
        return (
          <Box ref={ref} className={className} {...props}>
            <Button
              variant="secondary"
              size="sm"
              loading={isLoading}
              onClick={handleCheck}
              icon={<ShieldIcon />}
              aria-label="Run security check"
            >
              Run security check
            </Button>
          </Box>
        );
      }
      return null;
    }

    const targetEmailId = emailId ?? activeData.emailId;

    // ─── Compact variant ──────────────────────────────────────────────

    if (variant === "compact") {
      return (
        <Box ref={ref} className={`flex flex-col gap-2 ${className}`} {...props}>
          {/* Only show phishing banner if not safe */}
          {activeData.phishing.riskLevel !== "safe" && (
            <PhishingWarningBanner
              analysis={activeData.phishing}
              emailId={targetEmailId}
              senderAddress={activeData.from}
              onReport={onReport}
              onDelete={onDelete}
              onError={onError}
              showIndicators={false}
              autoCollapse
            />
          )}
          <SenderTrustBadge
            verification={activeData.senderVerification}
            variant="inline"
            expandable
          />
        </Box>
      );
    }

    // ─── Full variant ─────────────────────────────────────────────────

    return (
      <Box
        ref={ref}
        className={`flex flex-col gap-4 ${className}`}
        role="region"
        aria-label="Email security report"
        {...props}
      >
        {/* Overall assessment card */}
        <Card>
          <CardHeader>
            <Box className="flex items-center justify-between">
              <Box className="flex items-center gap-2">
                <ShieldIcon />
                <Text as="span" variant="heading-sm">
                  Security Report
                </Text>
              </Box>
              {onCheckSecurity && (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={isLoading}
                  onClick={handleCheck}
                  icon={<RefreshIcon />}
                  aria-label="Re-run security check"
                >
                  Re-check
                </Button>
              )}
            </Box>
          </CardHeader>
          <CardContent>
            {activeData.from && (
              <Box className="mb-3">
                <Text as="span" variant="caption" muted>
                  From:
                </Text>
                <Text as="span" variant="body-sm" className="ml-1 font-medium">
                  {activeData.fromName ? `${activeData.fromName} <${activeData.from}>` : activeData.from}
                </Text>
              </Box>
            )}
            {activeData.subject && (
              <Box className="mb-3">
                <Text as="span" variant="caption" muted>
                  Subject:
                </Text>
                <Text as="span" variant="body-sm" className="ml-1">
                  {activeData.subject}
                </Text>
              </Box>
            )}
            <OverallRiskBadge
              riskLevel={activeData.phishing.riskLevel}
              riskScore={activeData.phishing.riskScore}
              trustLevel={activeData.senderVerification.trustLevel}
              reputationScore={activeData.senderVerification.reputationScore}
            />
            {activeData.checkedAt && (
              <Text as="span" variant="caption" muted className="block mt-2">
                Checked: {new Date(activeData.checkedAt).toLocaleString()}
              </Text>
            )}
          </CardContent>
        </Card>

        {/* Phishing analysis */}
        <PhishingWarningBanner
          analysis={activeData.phishing}
          emailId={targetEmailId}
          senderAddress={activeData.from}
          onReport={onReport}
          onDelete={onDelete}
          onError={onError}
          showIndicators
          autoCollapse={false}
          dismissible={false}
        />

        {/* Sender verification details */}
        <SenderTrustBadge
          verification={activeData.senderVerification}
          variant="detailed"
          expandable={false}
        />
      </Box>
    );
  },
);

SecurityReport.displayName = "SecurityReport";
