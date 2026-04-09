"use client";

import React, { forwardRef, useState, useCallback, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TranslationBadgeData {
  /** Whether the badge should be visible. */
  visible: boolean;
  /** Human-readable badge label, e.g. "Translated from Spanish". */
  label: string | null;
  /** ISO 639-1 source language code. */
  sourceLanguage: string | null;
  /** Human-readable source language name. */
  sourceLanguageName: string | null;
}

export interface TranslationContent {
  subject: string;
  body: string;
}

export interface TranslationRecord {
  id: string;
  emailId: string;
  sourceLanguage: string;
  sourceLanguageName: string;
  targetLanguage: string;
  targetLanguageName: string;
  original: TranslationContent;
  translated: TranslationContent;
  autoTranslated: boolean;
  badge: TranslationBadgeData;
}

export type TranslationViewMode = "translated" | "original";

export interface TranslationBadgeProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onError" | "onToggle"> {
  /** The translation data (from API response). */
  translation: TranslationRecord | null;
  /** Current view mode — whether showing translated or original text. */
  viewMode?: TranslationViewMode;
  /** Callback when user toggles between translated/original. */
  onToggle?: (mode: TranslationViewMode) => void;
  /** Callback to trigger translation (POST /v1/emails/:id/translate). */
  onTranslate?: (emailId: string, targetLanguage: string) => Promise<TranslationRecord>;
  /** Email ID for on-demand translation. */
  emailId?: string;
  /** Target language code for on-demand translation. */
  targetLanguage?: string;
  /** Called on error. */
  onError?: (error: string) => void;
  /** Badge display variant. */
  variant?: "inline" | "bar" | "floating";
  /** Show the full language name or just "Translated". */
  showLanguageName?: boolean;
  className?: string;
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function GlobeIcon(): React.ReactElement {
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
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-1.503.204A6.5 6.5 0 117.95 3.83c.222.318.462.66.716 1.026.522.752 1.104 1.636 1.674 2.587.285.476.558.969.808 1.472.532-.293 1.087-.57 1.66-.818.41-.177.828-.343 1.25-.492zm-2.95-5.287c-.37-.052-.748-.09-1.132-.109-.375-.02-.717-.024-1.024-.009-.2.58-.406 1.22-.614 1.903-.357 1.172-.735 2.517-1.09 3.838.483-.01.983.002 1.498.038a29.5 29.5 0 011.963.228c-.203-.443-.418-.884-.647-1.316-.58-.975-1.172-1.872-1.698-2.63a21.7 21.7 0 01-.716-1.067c.473.086.957.2 1.447.345a15.1 15.1 0 011.013-.401c.284-.097.563-.187.835-.268A6.49 6.49 0 0013.547 4.917zM5.148 7.63A6.47 6.47 0 013.5 10a6.5 6.5 0 003.145 5.57 21.5 21.5 0 01-.49-1.556 27.2 27.2 0 01-.714-3.502 18.1 18.1 0 01-.293-2.882z"
        clipRule="evenodd"
      />
    </Box>
  );
}

GlobeIcon.displayName = "GlobeIcon";

function ToggleIcon({ flipped }: { flipped: boolean }): React.ReactElement {
  return (
    <Box
      as="svg"
      className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${flipped ? "rotate-180" : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <Box
        as="path"
        fillRule="evenodd"
        d="M13.2 2.24a.75.75 0 00.04 1.06l2.1 1.95H6.75a.75.75 0 000 1.5h8.59l-2.1 1.95a.75.75 0 101.02 1.1l3.5-3.25a.75.75 0 000-1.1l-3.5-3.25a.75.75 0 00-1.06.04zm-6.4 8a.75.75 0 00-1.06-.04l-3.5 3.25a.75.75 0 000 1.1l3.5 3.25a.75.75 0 101.02-1.1l-2.1-1.95h8.59a.75.75 0 000-1.5H4.66l2.1-1.95a.75.75 0 00.04-1.06z"
        clipRule="evenodd"
      />
    </Box>
  );
}

ToggleIcon.displayName = "ToggleIcon";

// ─── Language flag emoji mapping (common codes) ─────────────────────────────

const LANGUAGE_FLAGS: Record<string, string> = {
  en: "EN",
  es: "ES",
  fr: "FR",
  de: "DE",
  pt: "PT",
  it: "IT",
  nl: "NL",
  ja: "JA",
  zh: "ZH",
  ko: "KO",
  ar: "AR",
  ru: "RU",
  hi: "HI",
  tr: "TR",
  pl: "PL",
  sv: "SV",
  da: "DA",
  no: "NO",
  fi: "FI",
  th: "TH",
  vi: "VI",
  uk: "UK",
  cs: "CS",
  ro: "RO",
  hu: "HU",
  el: "EL",
  he: "HE",
};

function getLanguageTag(code: string): string {
  return LANGUAGE_FLAGS[code] ?? code.toUpperCase().slice(0, 2);
}

// ─── Component ──────────────────────────────────────────────────────────────

export const TranslationBadge = forwardRef<HTMLDivElement, TranslationBadgeProps>(
  function TranslationBadge(
    {
      translation,
      viewMode: controlledViewMode,
      onToggle,
      onTranslate,
      emailId,
      targetLanguage,
      onError,
      variant = "bar",
      showLanguageName = true,
      className = "",
      ...props
    },
    ref,
  ) {
    const [internalViewMode, setInternalViewMode] = useState<TranslationViewMode>("translated");
    const [isTranslating, setIsTranslating] = useState(false);
    const [translationData, setTranslationData] = useState<TranslationRecord | null>(translation);

    const viewMode = controlledViewMode ?? internalViewMode;
    const activeTranslation = translationData ?? translation;

    const handleToggle = useCallback((): void => {
      const newMode: TranslationViewMode = viewMode === "translated" ? "original" : "translated";
      setInternalViewMode(newMode);
      onToggle?.(newMode);
    }, [viewMode, onToggle]);

    const handleTranslate = useCallback(async (): Promise<void> => {
      if (!onTranslate || !emailId || !targetLanguage) return;
      setIsTranslating(true);
      try {
        const result = await onTranslate(emailId, targetLanguage);
        setTranslationData(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Translation failed";
        onError?.(message);
      } finally {
        setIsTranslating(false);
      }
    }, [onTranslate, emailId, targetLanguage, onError]);

    // If no translation data and we have the ability to translate on demand,
    // show a "Translate" button.
    if (!activeTranslation && onTranslate && emailId && targetLanguage) {
      return (
        <Box ref={ref} className={`inline-flex items-center gap-1.5 ${className}`} {...props}>
          <Button
            variant="ghost"
            size="sm"
            loading={isTranslating}
            onClick={handleTranslate}
            icon={<GlobeIcon />}
            aria-label="Translate this email"
          >
            Translate
          </Button>
        </Box>
      );
    }

    // If no translation or badge not visible, render nothing.
    if (!activeTranslation || !activeTranslation.badge.visible) {
      return null;
    }

    const badge = activeTranslation.badge;
    const sourceTag = getLanguageTag(activeTranslation.sourceLanguage);

    // ─── Inline variant ─────────────────────────────────────────────────

    if (variant === "inline") {
      return (
        <Box
          ref={ref}
          className={`inline-flex items-center gap-1.5 ${className}`}
          role="status"
          aria-label={badge.label ?? "Translated"}
          {...props}
        >
          <GlobeIcon />
          <Text
            as="span"
            variant="caption"
            className="text-brand-600 dark:text-brand-400"
          >
            {showLanguageName ? badge.label : "Translated"}
          </Text>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggle}
            className="h-5 px-1.5 text-[10px]"
            aria-label={viewMode === "translated" ? "Show original" : "Show translation"}
          >
            {viewMode === "translated" ? "Show original" : "Show translation"}
          </Button>
        </Box>
      );
    }

    // ─── Floating variant ───────────────────────────────────────────────

    if (variant === "floating") {
      return (
        <Box
          ref={ref}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 border border-brand-200 dark:bg-brand-950 dark:border-brand-800 shadow-sm ${className}`}
          role="status"
          aria-label={badge.label ?? "Translated"}
          {...props}
        >
          <Box className="flex items-center gap-1">
            <GlobeIcon />
            <Text
              as="span"
              variant="caption"
              className="font-mono text-[10px] font-semibold text-brand-700 dark:text-brand-300 bg-brand-100 dark:bg-brand-900 px-1 py-0.5 rounded"
            >
              {sourceTag}
            </Text>
          </Box>
          <Text
            as="span"
            variant="caption"
            className="text-brand-600 dark:text-brand-400"
          >
            {showLanguageName && badge.sourceLanguageName
              ? `Translated from ${badge.sourceLanguageName}`
              : "Translated"}
          </Text>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggle}
            className="h-5 px-1.5 text-[10px] rounded-full"
            icon={<ToggleIcon flipped={viewMode === "original"} />}
            aria-label={viewMode === "translated" ? "Show original" : "Show translation"}
          >
            {viewMode === "translated" ? "Original" : "Translated"}
          </Button>
        </Box>
      );
    }

    // ─── Bar variant (default) ──────────────────────────────────────────

    return (
      <Box
        ref={ref}
        className={`flex items-center justify-between gap-3 px-4 py-2 rounded-lg bg-brand-50 border border-brand-200 dark:bg-brand-950 dark:border-brand-800 ${className}`}
        role="status"
        aria-label={badge.label ?? "Translated"}
        {...props}
      >
        <Box className="flex items-center gap-2 min-w-0">
          <GlobeIcon />
          <Text
            as="span"
            variant="caption"
            className="font-mono text-[10px] font-semibold text-brand-700 dark:text-brand-300 bg-brand-100 dark:bg-brand-900 px-1.5 py-0.5 rounded"
          >
            {sourceTag}
          </Text>
          <Text
            as="span"
            variant="body-sm"
            className="text-brand-700 dark:text-brand-300 truncate"
          >
            {showLanguageName && badge.sourceLanguageName
              ? `Translated from ${badge.sourceLanguageName}`
              : "Translated"}
          </Text>
          {activeTranslation.autoTranslated && (
            <Text
              as="span"
              variant="caption"
              className="text-brand-500 dark:text-brand-400"
            >
              (auto)
            </Text>
          )}
        </Box>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggle}
          icon={<ToggleIcon flipped={viewMode === "original"} />}
          className="flex-shrink-0"
          aria-label={viewMode === "translated" ? "Show original text" : "Show translated text"}
        >
          {viewMode === "translated" ? "Show original" : "Show translation"}
        </Button>
      </Box>
    );
  },
);

TranslationBadge.displayName = "TranslationBadge";
