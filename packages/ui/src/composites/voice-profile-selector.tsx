"use client";

import React, { forwardRef, useState, useCallback, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VoiceProfileData {
  /** Profile ID from the API. */
  id: string;
  /** Human-readable name (e.g. "Professional", "Casual"). */
  name: string;
  /** Number of training samples used. */
  sampleCount: number;
  /** 0.0 - 1.0 confidence score. */
  confidenceScore: number;
  /** Whether this is the default profile. */
  isDefault: boolean;
  /** Whether training is in progress. */
  isTraining: boolean;
  /** Last training timestamp (ISO string or null). */
  lastTrainedAt: string | null;
}

export type ConfidenceTier = "low" | "medium" | "high" | "excellent";

export interface VoiceProfileSelectorProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onSelect"> {
  /** Available voice profiles. */
  profiles: readonly VoiceProfileData[];
  /** Currently selected profile ID. */
  selectedProfileId: string | null;
  /** Callback when user selects a profile. */
  onSelect: (profileId: string) => void;
  /** Callback when user clicks "Train new profile". */
  onTrainNew?: () => void;
  /** Callback when user clicks "Retrain" on an existing profile. */
  onRetrain?: (profileId: string) => void;
  /** Whether the selector is in loading state. */
  loading?: boolean;
  /** Compact mode for embedding in compose toolbar. */
  compact?: boolean;
  /** Extra Tailwind classes. */
  className?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getConfidenceTier(score: number): ConfidenceTier {
  if (score >= 0.8) return "excellent";
  if (score >= 0.6) return "high";
  if (score >= 0.35) return "medium";
  return "low";
}

function getConfidenceColor(tier: ConfidenceTier): string {
  switch (tier) {
    case "excellent":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300";
    case "high":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
    case "medium":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
    case "low":
      return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
  }
}

function getConfidenceLabel(tier: ConfidenceTier): string {
  switch (tier) {
    case "excellent":
      return "Excellent match";
    case "high":
      return "High match";
    case "medium":
      return "Medium match";
    case "low":
      return "Low match";
  }
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function VoiceIcon(): React.ReactElement {
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
        d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
      />
    </Box>
  );
}

VoiceIcon.displayName = "VoiceIcon";

function CheckIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-3.5 h-3.5 flex-shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <Box
        as="path"
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </Box>
  );
}

CheckIcon.displayName = "CheckIcon";

function SpinnerIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-3.5 h-3.5 flex-shrink-0 animate-spin"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <Box
        as="circle"
        cx="10"
        cy="10"
        r="8"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="40"
        strokeDashoffset="10"
        strokeLinecap="round"
        opacity="0.5"
      />
    </Box>
  );
}

SpinnerIcon.displayName = "SpinnerIcon";

// ─── Confidence Badge ───────────────────────────────────────────────────────

function ConfidenceBadge({
  score,
  compact = false,
}: {
  score: number;
  compact?: boolean;
}): React.ReactElement {
  const tier = getConfidenceTier(score);
  const colorClass = getConfidenceColor(tier);
  const label = getConfidenceLabel(tier);
  const percentage = Math.round(score * 100);

  if (compact) {
    return (
      <Box
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${colorClass}`}
        role="status"
        aria-label={`${label}: ${percentage}%`}
      >
        <Text as="span" variant="caption" className="font-semibold">
          {percentage}%
        </Text>
      </Box>
    );
  }

  return (
    <Box
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${colorClass}`}
      role="status"
      aria-label={`${label}: ${percentage}%`}
    >
      <Text as="span" variant="caption" className="font-medium">
        {label}
      </Text>
      <Text as="span" variant="caption" className="font-semibold">
        {percentage}%
      </Text>
    </Box>
  );
}

ConfidenceBadge.displayName = "ConfidenceBadge";

// ─── Component ──────────────────────────────────────────────────────────────

export const VoiceProfileSelector = forwardRef<
  HTMLDivElement,
  VoiceProfileSelectorProps
>(function VoiceProfileSelector(
  {
    profiles,
    selectedProfileId,
    onSelect,
    onTrainNew,
    onRetrain,
    loading = false,
    compact = false,
    className = "",
    ...props
  },
  ref,
) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) ?? null;

  const handleToggle = useCallback((): void => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleSelect = useCallback(
    (profileId: string): void => {
      onSelect(profileId);
      setIsOpen(false);
    },
    [onSelect],
  );

  const handleTrainNew = useCallback((): void => {
    onTrainNew?.();
    setIsOpen(false);
  }, [onTrainNew]);

  // ─── Compact mode (dropdown trigger only) ─────────────────────────────

  if (compact) {
    return (
      <Box ref={ref} className={`relative inline-block ${className}`} {...props}>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggle}
          icon={<VoiceIcon />}
          loading={loading}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={
            selectedProfile
              ? `Voice: ${selectedProfile.name}`
              : "Select voice profile"
          }
          className="gap-1.5"
        >
          {selectedProfile ? (
            <Box className="flex items-center gap-1">
              <Text as="span" variant="body-sm" className="truncate max-w-[100px]">
                {selectedProfile.name}
              </Text>
              {selectedProfile.confidenceScore > 0 && (
                <ConfidenceBadge score={selectedProfile.confidenceScore} compact />
              )}
            </Box>
          ) : (
            <Text as="span" variant="body-sm">
              Voice
            </Text>
          )}
        </Button>

        {isOpen && (
          <Box
            className="absolute top-full left-0 mt-1 w-64 bg-surface border border-border rounded-lg shadow-lg z-50"
            role="listbox"
            aria-label="Voice profiles"
          >
            {profiles.length === 0 && !loading && (
              <Box className="px-3 py-2">
                <Text variant="body-sm" className="text-content-secondary">
                  No voice profiles yet.
                </Text>
              </Box>
            )}

            {profiles.map((profile) => (
              <Box
                key={profile.id}
                className={`flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-surface-hover transition-colors ${
                  profile.id === selectedProfileId ? "bg-brand-50 dark:bg-brand-950" : ""
                }`}
                role="option"
                aria-selected={profile.id === selectedProfileId}
                onClick={() => handleSelect(profile.id)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelect(profile.id);
                  }
                }}
                tabIndex={0}
              >
                <Box className="flex items-center gap-2 min-w-0">
                  {profile.id === selectedProfileId && <CheckIcon />}
                  <Text
                    variant="body-sm"
                    className="truncate font-medium"
                    as="span"
                  >
                    {profile.name}
                  </Text>
                  {profile.isDefault && (
                    <Text
                      as="span"
                      variant="caption"
                      className="text-content-tertiary"
                    >
                      (default)
                    </Text>
                  )}
                </Box>
                <Box className="flex items-center gap-1">
                  {profile.isTraining && <SpinnerIcon />}
                  {profile.confidenceScore > 0 && !profile.isTraining && (
                    <ConfidenceBadge score={profile.confidenceScore} compact />
                  )}
                </Box>
              </Box>
            ))}

            {onTrainNew && (
              <Box className="border-t border-border px-3 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleTrainNew}
                  className="w-full justify-start"
                  aria-label="Train a new voice profile"
                >
                  + New voice profile
                </Button>
              </Box>
            )}
          </Box>
        )}
      </Box>
    );
  }

  // ─── Full mode (card list) ────────────────────────────────────────────

  return (
    <Box ref={ref} className={`space-y-3 ${className}`} {...props}>
      <Box className="flex items-center justify-between">
        <Box className="flex items-center gap-2">
          <VoiceIcon />
          <Text variant="body" className="font-semibold">
            Voice Profiles
          </Text>
        </Box>
        {onTrainNew && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTrainNew}
            aria-label="Create a new voice profile"
          >
            + New Profile
          </Button>
        )}
      </Box>

      {loading && profiles.length === 0 && (
        <Box className="flex items-center gap-2 px-4 py-6 text-content-secondary">
          <SpinnerIcon />
          <Text variant="body-sm">Loading voice profiles...</Text>
        </Box>
      )}

      {!loading && profiles.length === 0 && (
        <Box className="px-4 py-6 text-center rounded-lg border border-dashed border-border">
          <Text variant="body-sm" className="text-content-secondary">
            No voice profiles yet. Create one and train it on your sent emails
            to make AI replies sound like you.
          </Text>
          {onTrainNew && (
            <Box className="mt-3">
              <Button variant="primary" size="sm" onClick={handleTrainNew}>
                Create First Profile
              </Button>
            </Box>
          )}
        </Box>
      )}

      {profiles.map((profile) => {
        const isSelected = profile.id === selectedProfileId;
        return (
          <Box
            key={profile.id}
            className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
              isSelected
                ? "border-brand-500 bg-brand-50 dark:bg-brand-950 dark:border-brand-400"
                : "border-border hover:border-brand-300 hover:bg-surface-hover"
            }`}
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(profile.id)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(profile.id);
              }
            }}
            tabIndex={0}
          >
            <Box className="flex items-center gap-3 min-w-0">
              {isSelected && <CheckIcon />}
              <Box className="min-w-0">
                <Box className="flex items-center gap-2">
                  <Text variant="body-sm" className="font-medium truncate" as="span">
                    {profile.name}
                  </Text>
                  {profile.isDefault && (
                    <Text
                      as="span"
                      variant="caption"
                      className="px-1.5 py-0.5 rounded bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300 text-[10px] font-semibold"
                    >
                      DEFAULT
                    </Text>
                  )}
                </Box>
                <Text variant="caption" className="text-content-tertiary">
                  {profile.sampleCount} samples
                  {profile.lastTrainedAt
                    ? ` \u00B7 Trained ${new Date(profile.lastTrainedAt).toLocaleDateString()}`
                    : " \u00B7 Not trained"}
                </Text>
              </Box>
            </Box>

            <Box className="flex items-center gap-2 flex-shrink-0">
              {profile.isTraining && (
                <Box className="flex items-center gap-1 text-content-secondary">
                  <SpinnerIcon />
                  <Text variant="caption">Training</Text>
                </Box>
              )}
              {!profile.isTraining && profile.confidenceScore > 0 && (
                <ConfidenceBadge score={profile.confidenceScore} />
              )}
              {onRetrain && !profile.isTraining && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onRetrain(profile.id);
                  }}
                  aria-label={`Retrain ${profile.name}`}
                  className="text-[11px]"
                >
                  Retrain
                </Button>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
});

VoiceProfileSelector.displayName = "VoiceProfileSelector";
