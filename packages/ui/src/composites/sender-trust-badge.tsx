"use client";

import React, { forwardRef, useState, useCallback, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";

// ─── Types ──────────────────────────────────────────────────────────────────

export type SenderTrustLevel = "high" | "medium" | "low" | "suspicious";

export interface SenderVerificationIndicator {
  readonly type: "positive" | "negative" | "neutral";
  readonly message: string;
}

export interface TyposquatMatch {
  readonly brand: string;
  readonly legitimateDomain: string;
  readonly distance: number;
  readonly technique: "levenshtein" | "substring" | "homograph";
}

export interface DnsAuthRecords {
  readonly spfRecord: string | null;
  readonly dmarcRecord: string | null;
  readonly hasDkimSelector: boolean;
}

export interface SenderVerificationData {
  readonly email: string;
  readonly domain: string;
  readonly spfPass: boolean;
  readonly dkimPass: boolean;
  readonly dmarcPass: boolean;
  readonly domainAge: number | null;
  readonly reputationScore: number;
  readonly isKnownService: boolean;
  readonly knownServiceName: string | null;
  readonly hasMxRecords: boolean;
  readonly isFreeEmailProvider: boolean;
  readonly trustLevel: SenderTrustLevel;
  readonly indicators: readonly SenderVerificationIndicator[];
  readonly typosquatMatch: TyposquatMatch | null;
  readonly dnsAuth: DnsAuthRecords;
}

export interface SenderTrustBadgeProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onError"> {
  /** Pre-loaded verification data (skip network call if provided). */
  verification: SenderVerificationData | null;
  /** Email address to verify (used for on-demand verification). */
  email?: string;
  /** Callback to fetch verification on demand (POST /v1/security/check-sender). */
  onVerify?: (email: string) => Promise<SenderVerificationData>;
  /** Called on error. */
  onError?: (error: string) => void;
  /** Display variant. */
  variant?: "inline" | "detailed";
  /** Whether to show the full indicator list in inline mode on hover/click. */
  expandable?: boolean;
  className?: string;
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function ShieldCheckIcon(): React.ReactElement {
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
        d="M9.661 2.237a.531.531 0 01.678 0 11.947 11.947 0 007.078 2.749.5.5 0 01.479.425c.069.52.104 1.05.104 1.592 0 5.842-3.898 10.29-8.293 11.847a.5.5 0 01-.314 0C5.02 17.287 1.12 12.84 1.12 6.997c0-.538.035-1.069.104-1.589a.5.5 0 01.48-.425 11.947 11.947 0 007.078-2.749zM14.2 7.482a.75.75 0 00-1.152-.96L9.287 11.12 7.46 9.165a.75.75 0 10-1.12.999l2.4 2.692a.75.75 0 001.135-.02l4.325-5.354z"
        clipRule="evenodd"
      />
    </Box>
  );
}

ShieldCheckIcon.displayName = "ShieldCheckIcon";

function ShieldExclamationIcon(): React.ReactElement {
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
        d="M9.661 2.237a.531.531 0 01.678 0 11.947 11.947 0 007.078 2.749.5.5 0 01.479.425c.069.52.104 1.05.104 1.592 0 5.842-3.898 10.29-8.293 11.847a.5.5 0 01-.314 0C5.02 17.287 1.12 12.84 1.12 6.997c0-.538.035-1.069.104-1.589a.5.5 0 01.48-.425 11.947 11.947 0 007.078-2.749zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </Box>
  );
}

ShieldExclamationIcon.displayName = "ShieldExclamationIcon";

function ShieldQuestionIcon(): React.ReactElement {
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
        d="M9.661 2.237a.531.531 0 01.678 0 11.947 11.947 0 007.078 2.749.5.5 0 01.479.425c.069.52.104 1.05.104 1.592 0 5.842-3.898 10.29-8.293 11.847a.5.5 0 01-.314 0C5.02 17.287 1.12 12.84 1.12 6.997c0-.538.035-1.069.104-1.589a.5.5 0 01.48-.425 11.947 11.947 0 007.078-2.749zM10 7.5a1.25 1.25 0 00-1.207.926.75.75 0 01-1.45-.39A2.75 2.75 0 0112.75 8.75c0 1.01-.584 1.57-1.076 1.94a5.24 5.24 0 01-.674.42l-.024.013-.006.003-.003.001h-.001L10.5 10.5l.466.627a.75.75 0 01-.932-1.17l.044-.03c.082-.055.206-.142.347-.254.293-.222.575-.498.575-.923A1.25 1.25 0 0010 7.5zM10 15a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </Box>
  );
}

ShieldQuestionIcon.displayName = "ShieldQuestionIcon";

function CheckIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-3 h-3 flex-shrink-0"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <Box
        as="path"
        fillRule="evenodd"
        d="M12.416 3.376a.75.75 0 01.208 1.04l-5 7.5a.75.75 0 01-1.154.114l-3-3a.75.75 0 011.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 011.04-.207z"
        clipRule="evenodd"
      />
    </Box>
  );
}

CheckIcon.displayName = "CheckIcon";

function XIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-3 h-3 flex-shrink-0"
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

XIcon.displayName = "XIcon";

function MinusIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-3 h-3 flex-shrink-0"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <Box as="path" d="M3.75 7.25a.75.75 0 000 1.5h8.5a.75.75 0 000-1.5h-8.5z" />
    </Box>
  );
}

MinusIcon.displayName = "MinusIcon";

// ─── Styling helpers ────────────────────────────────────────────────────────

interface TrustStyles {
  readonly bg: string;
  readonly border: string;
  readonly text: string;
  readonly iconColor: string;
  readonly label: string;
}

function getTrustStyles(level: SenderTrustLevel): TrustStyles {
  switch (level) {
    case "high":
      return {
        bg: "bg-green-50 dark:bg-green-950",
        border: "border-green-200 dark:border-green-800",
        text: "text-green-700 dark:text-green-300",
        iconColor: "text-green-600 dark:text-green-400",
        label: "Verified sender",
      };
    case "medium":
      return {
        bg: "bg-blue-50 dark:bg-blue-950",
        border: "border-blue-200 dark:border-blue-800",
        text: "text-blue-700 dark:text-blue-300",
        iconColor: "text-blue-600 dark:text-blue-400",
        label: "Known sender",
      };
    case "low":
      return {
        bg: "bg-yellow-50 dark:bg-yellow-950",
        border: "border-yellow-200 dark:border-yellow-800",
        text: "text-yellow-700 dark:text-yellow-300",
        iconColor: "text-yellow-600 dark:text-yellow-400",
        label: "New sender",
      };
    case "suspicious":
      return {
        bg: "bg-red-50 dark:bg-red-950",
        border: "border-red-200 dark:border-red-800",
        text: "text-red-700 dark:text-red-300",
        iconColor: "text-red-600 dark:text-red-400",
        label: "Suspicious sender",
      };
  }
}

function getIndicatorIcon(type: "positive" | "negative" | "neutral"): React.ReactElement {
  switch (type) {
    case "positive":
      return (
        <Box className="text-green-600 dark:text-green-400">
          <CheckIcon />
        </Box>
      );
    case "negative":
      return (
        <Box className="text-red-600 dark:text-red-400">
          <XIcon />
        </Box>
      );
    case "neutral":
      return (
        <Box className="text-gray-500 dark:text-gray-400">
          <MinusIcon />
        </Box>
      );
  }
}

// ─── Score bar ──────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }): React.ReactElement {
  const color =
    score >= 80
      ? "bg-green-500"
      : score >= 60
        ? "bg-blue-500"
        : score >= 35
          ? "bg-yellow-500"
          : "bg-red-500";
  return (
    <Box className="w-full h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
      <Box
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.max(2, score)}%` }}
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Reputation score: ${score} out of 100`}
      />
    </Box>
  );
}

ScoreBar.displayName = "ScoreBar";

// ─── Component ──────────────────────────────────────────────────────────────

export const SenderTrustBadge = forwardRef<HTMLDivElement, SenderTrustBadgeProps>(
  function SenderTrustBadge(
    {
      verification,
      email,
      onVerify,
      onError,
      variant = "inline",
      expandable = true,
      className = "",
      ...props
    },
    ref,
  ) {
    const [isLoading, setIsLoading] = useState(false);
    const [data, setData] = useState<SenderVerificationData | null>(verification);
    const [expanded, setExpanded] = useState(false);

    const activeData = data ?? verification;

    const handleVerify = useCallback(async (): Promise<void> => {
      if (!onVerify || !email) return;
      setIsLoading(true);
      try {
        const result = await onVerify(email);
        setData(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Verification failed";
        onError?.(message);
      } finally {
        setIsLoading(false);
      }
    }, [onVerify, email, onError]);

    const handleToggleExpand = useCallback((): void => {
      setExpanded((prev) => !prev);
    }, []);

    // No data yet, show verify button if we can
    if (!activeData) {
      if (onVerify && email) {
        return (
          <Box ref={ref} className={`inline-flex items-center gap-1.5 ${className}`} {...props}>
            <Button
              variant="ghost"
              size="sm"
              loading={isLoading}
              onClick={handleVerify}
              icon={<ShieldQuestionIcon />}
              aria-label={`Verify sender ${email}`}
            >
              Verify sender
            </Button>
          </Box>
        );
      }
      return null;
    }

    const styles = getTrustStyles(activeData.trustLevel);

    // ─── Inline variant ─────────────────────────────────────────────────

    if (variant === "inline") {
      return (
        <Box ref={ref} className={`inline-flex flex-col ${className}`} {...props}>
          <Box className="inline-flex items-center gap-1.5">
            <Box className={styles.iconColor}>
              {activeData.trustLevel === "suspicious" ? (
                <ShieldExclamationIcon />
              ) : (
                <ShieldCheckIcon />
              )}
            </Box>
            <Text
              as="span"
              variant="caption"
              className={`font-medium ${styles.text}`}
            >
              {activeData.isKnownService && activeData.knownServiceName
                ? activeData.knownServiceName
                : styles.label}
            </Text>
            {activeData.typosquatMatch && (
              <Text
                as="span"
                variant="caption"
                className="text-red-600 dark:text-red-400 font-semibold"
              >
                Typosquatting alert
              </Text>
            )}
            {expandable && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleExpand}
                className="h-5 px-1 text-[10px]"
                aria-label={expanded ? "Hide sender details" : "Show sender details"}
                aria-expanded={expanded}
              >
                {expanded ? "Less" : "Details"}
              </Button>
            )}
          </Box>
          {expanded && (
            <Box className={`mt-2 p-3 rounded-lg border ${styles.bg} ${styles.border}`}>
              <Box className="flex items-center gap-2 mb-2">
                <Text as="span" variant="caption" muted>
                  Reputation
                </Text>
                <Text as="span" variant="caption" className="font-mono font-semibold">
                  {activeData.reputationScore}/100
                </Text>
              </Box>
              <ScoreBar score={activeData.reputationScore} />
              <Box className="mt-2 flex flex-col gap-1">
                {activeData.indicators.map((ind, i) => (
                  <Box key={i} className="flex items-center gap-1.5">
                    {getIndicatorIcon(ind.type)}
                    <Text as="span" variant="caption">
                      {ind.message}
                    </Text>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      );
    }

    // ─── Detailed variant ───────────────────────────────────────────────

    return (
      <Box
        ref={ref}
        className={`rounded-lg border ${styles.bg} ${styles.border} p-4 ${className}`}
        role="region"
        aria-label={`Sender verification: ${styles.label}`}
        {...props}
      >
        <Box className="flex items-start justify-between gap-3 mb-3">
          <Box className="flex items-center gap-2">
            <Box className={styles.iconColor}>
              {activeData.trustLevel === "suspicious" ? (
                <ShieldExclamationIcon />
              ) : (
                <ShieldCheckIcon />
              )}
            </Box>
            <Box>
              <Text as="span" variant="body-sm" className={`font-semibold ${styles.text}`}>
                {activeData.isKnownService && activeData.knownServiceName
                  ? activeData.knownServiceName
                  : styles.label}
              </Text>
              <Text as="span" variant="caption" muted className="block">
                {activeData.email}
              </Text>
            </Box>
          </Box>
          <Box className="flex items-center gap-1.5">
            <Text as="span" variant="caption" className="font-mono font-semibold">
              {activeData.reputationScore}
            </Text>
            <Text as="span" variant="caption" muted>
              /100
            </Text>
          </Box>
        </Box>

        <ScoreBar score={activeData.reputationScore} />

        {activeData.typosquatMatch && (
          <Box className="mt-3 p-2 rounded-md bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700">
            <Text as="span" variant="caption" className="text-red-800 dark:text-red-200 font-semibold">
              Typosquatting detected:
            </Text>
            <Text as="span" variant="caption" className="text-red-700 dark:text-red-300 ml-1">
              This domain resembles {activeData.typosquatMatch.brand} ({activeData.typosquatMatch.legitimateDomain}) via {activeData.typosquatMatch.technique} technique.
            </Text>
          </Box>
        )}

        <Box className="mt-3 flex flex-col gap-1.5">
          <Text as="span" variant="caption" className="font-semibold" muted>
            Verification details
          </Text>
          {activeData.indicators.map((ind, i) => (
            <Box key={i} className="flex items-center gap-2">
              {getIndicatorIcon(ind.type)}
              <Text as="span" variant="caption">
                {ind.message}
              </Text>
            </Box>
          ))}
        </Box>

        <Box className="mt-3 grid grid-cols-3 gap-2">
          <Box className="flex flex-col items-center p-2 rounded-md bg-white/50 dark:bg-black/20">
            <Text
              as="span"
              variant="caption"
              className={`font-semibold ${activeData.spfPass ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
            >
              {activeData.spfPass ? "Pass" : "Fail"}
            </Text>
            <Text as="span" variant="caption" muted>
              SPF
            </Text>
          </Box>
          <Box className="flex flex-col items-center p-2 rounded-md bg-white/50 dark:bg-black/20">
            <Text
              as="span"
              variant="caption"
              className={`font-semibold ${activeData.dkimPass ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
            >
              {activeData.dkimPass ? "Pass" : "Fail"}
            </Text>
            <Text as="span" variant="caption" muted>
              DKIM
            </Text>
          </Box>
          <Box className="flex flex-col items-center p-2 rounded-md bg-white/50 dark:bg-black/20">
            <Text
              as="span"
              variant="caption"
              className={`font-semibold ${activeData.dmarcPass ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
            >
              {activeData.dmarcPass ? "Pass" : "Fail"}
            </Text>
            <Text as="span" variant="caption" muted>
              DMARC
            </Text>
          </Box>
        </Box>
      </Box>
    );
  },
);

SenderTrustBadge.displayName = "SenderTrustBadge";
