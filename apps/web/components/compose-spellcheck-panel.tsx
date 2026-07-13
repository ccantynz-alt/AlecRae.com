"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Text,
  Button,
  SpellCheckSuggestions,
  type SpellCheckResult,
  type SpellCheckIssue,
} from "@alecrae/ui";
import {
  spellcheckApi,
  type SpellCheckLanguage,
  type CustomDictionaryWord,
} from "../lib/api-compose-power";

interface ComposeSpellcheckPanelProps {
  /** Plain-text body of the current draft. */
  readonly text: string;
  /** Called with a corrected version of the plain text when the user applies a fix. */
  readonly onApplyCorrection: (correctedText: string) => void;
  readonly className?: string;
}

/**
 * Spell-check surface for the compose page. Wraps the ready-made
 * SpellCheckSuggestions UI composite (debounced API check + apply/dismiss)
 * and adds a language selector + custom-dictionary management.
 *
 * Wires:
 *   POST /v1/compose/spellcheck                  (via onSpellCheck)
 *   GET  /v1/compose/spellcheck/languages
 *   POST /v1/compose/spellcheck/dictionary       (add word)
 *   GET  /v1/compose/spellcheck/dictionary       (list words)
 *   DELETE /v1/compose/spellcheck/dictionary/:word
 */
export function ComposeSpellcheckPanel({
  text,
  onApplyCorrection,
  className = "",
}: ComposeSpellcheckPanelProps): React.JSX.Element {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [language, setLanguage] = useState<string>("");
  const [languages, setLanguages] = useState<SpellCheckLanguage[]>([]);
  const [dictionary, setDictionary] = useState<CustomDictionaryWord[]>([]);
  const [dictError, setDictError] = useState<string | null>(null);
  const [dictLoading, setDictLoading] = useState<boolean>(false);
  const [manualWord, setManualWord] = useState<string>("");

  const refreshDictionary = useCallback(async (): Promise<void> => {
    setDictLoading(true);
    setDictError(null);
    try {
      const res = await spellcheckApi.listDictionary({ limit: 200 });
      setDictionary(res.data.words);
    } catch (err) {
      setDictError(
        err instanceof Error ? err.message : "Failed to load dictionary",
      );
    } finally {
      setDictLoading(false);
    }
  }, []);

  // Load supported languages + dictionary once the panel is enabled.
  useEffect((): (() => void) => {
    if (!enabled) return (): void => { /* noop */ };
    let cancelled = false;
    void spellcheckApi
      .languages()
      .then((res) => {
        if (!cancelled) setLanguages(res.data.languages);
      })
      .catch(() => {
        /* languages are optional — silent */
      });
    void refreshDictionary();
    return (): void => {
      cancelled = true;
    };
  }, [enabled, refreshDictionary]);

  // Adapter for SpellCheckSuggestions' onSpellCheck — returns the raw result shape.
  const handleSpellCheck = useCallback(
    async (t: string): Promise<SpellCheckResult> => {
      const res = await spellcheckApi.check(t, {
        ...(language ? { language } : {}),
      });
      return res.data;
    },
    [language],
  );

  // Replace the flagged word at its offset with the chosen replacement.
  const handleApplyCorrection = useCallback(
    (issue: SpellCheckIssue, replacement: string): void => {
      const before = text.slice(0, issue.offset);
      const after = text.slice(issue.offset + issue.length);
      onApplyCorrection(`${before}${replacement}${after}`);
    },
    [text, onApplyCorrection],
  );

  const handleAddToDictionary = useCallback(
    async (word: string): Promise<void> => {
      setDictError(null);
      try {
        await spellcheckApi.addWord(word, language || undefined);
        await refreshDictionary();
      } catch (err) {
        setDictError(
          err instanceof Error ? err.message : "Failed to add word",
        );
      }
    },
    [language, refreshDictionary],
  );

  const handleAddManualWord = useCallback(async (): Promise<void> => {
    const trimmed = manualWord.trim();
    if (!trimmed) return;
    await handleAddToDictionary(trimmed);
    setManualWord("");
  }, [manualWord, handleAddToDictionary]);

  const handleRemoveWord = useCallback(
    async (word: string): Promise<void> => {
      setDictError(null);
      try {
        await spellcheckApi.removeWord(word);
        await refreshDictionary();
      } catch (err) {
        setDictError(
          err instanceof Error ? err.message : "Failed to remove word",
        );
      }
    },
    [refreshDictionary],
  );

  return (
    <Box
      className={`rounded-lg border border-border bg-surface-secondary p-3 ${className}`}
    >
      <Box className="flex items-center justify-between gap-3 flex-wrap">
        <Box className="flex items-center gap-2">
          <Text variant="body-sm" className="font-medium">
            Spell check
          </Text>
          <Text variant="caption" muted>
            Multi-language + custom dictionary
          </Text>
        </Box>
        <Box className="flex items-center gap-2">
          {enabled && (
            <Box
              as="select"
              value={language}
              onChange={(e) =>
                setLanguage((e.target as HTMLSelectElement).value)
              }
              aria-label="Spell check language"
              className="h-8 px-2 rounded-md border border-border bg-surface text-content text-body-sm"
            >
              <option value="">Auto-detect</option>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </Box>
          )}
          <Button
            variant={enabled ? "secondary" : "primary"}
            size="sm"
            onClick={() => setEnabled((v) => !v)}
            aria-pressed={enabled}
          >
            {enabled ? "Disable" : "Check spelling"}
          </Button>
        </Box>
      </Box>

      {enabled && (
        <Box className="mt-3 space-y-3">
          <SpellCheckSuggestions
            text={text}
            enabled={enabled}
            onSpellCheck={handleSpellCheck}
            onApplyCorrection={handleApplyCorrection}
            onAddToDictionary={handleAddToDictionary}
          />

          {/* Custom dictionary manager */}
          <Box className="rounded-lg border border-border bg-surface p-3">
            <Text variant="body-sm" className="font-medium mb-2">
              Custom dictionary
            </Text>
            <Box className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={manualWord}
                onChange={(e) => setManualWord(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAddManualWord();
                  }
                }}
                placeholder="Add a word…"
                aria-label="Add a word to your custom dictionary"
                className="flex-1 h-8 px-2 rounded-md border border-border bg-surface-secondary text-content text-body-sm"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleAddManualWord()}
                disabled={!manualWord.trim()}
              >
                Add
              </Button>
            </Box>

            {dictError && (
              <Text variant="caption" className="text-status-error mb-2">
                {dictError}
              </Text>
            )}

            {dictLoading ? (
              <Text variant="caption" muted>
                Loading dictionary…
              </Text>
            ) : dictionary.length === 0 ? (
              <Text variant="caption" muted>
                No custom words yet.
              </Text>
            ) : (
              <Box className="flex flex-wrap gap-1.5">
                {dictionary.map((w) => (
                  <Box
                    key={w.id}
                    className="flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-surface-secondary text-sm"
                  >
                    <Text as="span" variant="caption">
                      {w.word}
                    </Text>
                    <button
                      type="button"
                      onClick={() => void handleRemoveWord(w.word)}
                      aria-label={`Remove ${w.word} from dictionary`}
                      className="text-content-tertiary hover:text-status-error text-xs leading-none"
                    >
                      ×
                    </button>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}
