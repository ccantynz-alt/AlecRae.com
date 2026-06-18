"use client";

/**
 * AlecRae — Translation Center
 *
 * Live bidirectional translation (35+ languages), per-account translation
 * settings, stats, and history. Requires Personal plan or above.
 *
 * API:
 *   POST /v1/translate             { text, sourceLang, targetLang }
 *   GET  /v1/translate/history
 */

import { useState, useEffect, useCallback } from "react";
import { Box, Text, Button, Card, CardContent, CardHeader, PageLayout } from "@alecrae/ui";
import { PlanGate } from "../../../components/plan-gate";
import { getAccessToken } from "../../../lib/auth-token";

// ─── Language list ────────────────────────────────────────────────────────────

interface Language {
  code: string;
  label: string;
}

const LANGUAGES: Language[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "ru", label: "Russian" },
  { code: "zh", label: "Chinese (Simplified)" },
  { code: "zh-TW", label: "Chinese (Traditional)" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "bn", label: "Bengali" },
  { code: "tr", label: "Turkish" },
  { code: "vi", label: "Vietnamese" },
  { code: "th", label: "Thai" },
  { code: "id", label: "Indonesian" },
  { code: "ms", label: "Malay" },
  { code: "sv", label: "Swedish" },
  { code: "da", label: "Danish" },
  { code: "fi", label: "Finnish" },
  { code: "nb", label: "Norwegian" },
  { code: "cs", label: "Czech" },
  { code: "sk", label: "Slovak" },
  { code: "ro", label: "Romanian" },
  { code: "hu", label: "Hungarian" },
  { code: "el", label: "Greek" },
  { code: "uk", label: "Ukrainian" },
  { code: "he", label: "Hebrew" },
  { code: "fa", label: "Persian" },
  { code: "sw", label: "Swahili" },
  { code: "tl", label: "Filipino" },
];

const AUTO_DETECT = "auto";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TranslationResult {
  translatedText: string;
  detectedLanguage: string;
  confidence: number;
}

interface HistoryItem {
  id: string;
  sourceLang: string;
  targetLang: string;
  snippet: string;
  createdAt: string;
  wordCount: number;
}

interface TranslationStats {
  emailsTranslatedThisMonth: number;
  topSourceLanguages: { language: string; count: number }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.alecrae.com";
const MAX_CHARS = 5000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function langLabel(code: string): string {
  if (code === AUTO_DETECT) return "Auto-detect";
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LangSelect({
  id,
  label,
  value,
  onChange,
  includeAuto,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  includeAuto?: boolean;
}): React.JSX.Element {
  return (
    <Box className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-content-subtle uppercase tracking-wide">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        {includeAuto && <option value={AUTO_DETECT}>Auto-detect</option>}
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </Box>
  );
}

function SettingsToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): React.JSX.Element {
  const id = `setting-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <Box className="flex items-center justify-between gap-4 py-3">
      <Box className="flex-1">
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-content">
          {label}
        </label>
        {description && (
          <Text variant="body-sm" muted className="mt-0.5 text-xs">
            {description}
          </Text>
        )}
      </Box>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2",
          checked ? "bg-brand-600" : "bg-surface-raised border border-border",
        ].join(" ")}
      >
        <span
          aria-hidden="true"
          className={[
            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
            checked ? "translate-x-5" : "translate-x-0",
          ].join(" ")}
        />
      </button>
    </Box>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TranslatePage(): React.JSX.Element {
  // Live translator state
  const [sourceText, setSourceText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [sourceLang, setSourceLang] = useState<string>(AUTO_DETECT);
  const [targetLang, setTargetLang] = useState<string>("es");
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  // Settings state
  const [autoDetect, setAutoDetect] = useState(true);
  const [showOriginal, setShowOriginal] = useState(false);
  const [defaultSource, setDefaultSource] = useState("en");
  const [defaultTarget, setDefaultTarget] = useState("es");

  // Stats + history state
  const [stats, setStats] = useState<TranslationStats | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Load history + stats on mount
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const historyRes = await apiFetch<{ data: HistoryItem[] }>("/v1/translate/history").then(
        (r) => r.data,
      );
      setHistory(historyRes);

      // Derive simple stats from history (backend may eventually return dedicated stats endpoint)
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);
      const monthItems = historyRes.filter((h) => new Date(h.createdAt) >= thisMonth);

      const langCounts: Record<string, number> = {};
      for (const item of historyRes) {
        langCounts[item.sourceLang] = (langCounts[item.sourceLang] ?? 0) + 1;
      }
      const topSourceLanguages = Object.entries(langCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([language, count]) => ({ language, count }));

      setStats({
        emailsTranslatedThisMonth: monthItems.length,
        topSourceLanguages,
      });
    } catch (e) {
      setHistoryError(errMsg(e));
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Translate handler
  const handleTranslate = useCallback(async () => {
    if (!sourceText.trim()) return;
    setTranslating(true);
    setTranslateError(null);
    setDetectedLang(null);
    try {
      const result = await apiFetch<{ data: TranslationResult }>("/v1/translate", {
        method: "POST",
        body: JSON.stringify({
          text: sourceText,
          sourceLang: sourceLang === AUTO_DETECT ? "auto" : sourceLang,
          targetLang,
        }),
      }).then((r) => r.data);
      setTranslatedText(result.translatedText);
      if (result.detectedLanguage) setDetectedLang(result.detectedLanguage);
      // Refresh history after a successful translation
      void loadHistory();
    } catch (e) {
      setTranslateError(errMsg(e));
    } finally {
      setTranslating(false);
    }
  }, [sourceText, sourceLang, targetLang, loadHistory]);

  const handleSwapLanguages = useCallback(() => {
    if (sourceLang === AUTO_DETECT) return;
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSourceText(translatedText);
    setTranslatedText(sourceText);
    setDetectedLang(null);
  }, [sourceLang, targetLang, sourceText, translatedText]);

  const handleCopyTranslation = useCallback(() => {
    if (translatedText) {
      void navigator.clipboard.writeText(translatedText);
    }
  }, [translatedText]);

  return (
    <PageLayout
      title="Translation"
      description="Translate emails instantly across 35+ languages with AI that understands context, not just words."
    >
      <PlanGate feature="translation" required="personal">
        <Box className="space-y-8">
          {/* Live Translation */}
          <Card>
            <CardHeader>
              <Text variant="heading-sm">Live Translation</Text>
            </CardHeader>
            <CardContent>
              {/* Language selectors + swap */}
              <Box className="mb-4 flex items-end gap-2">
                <Box className="flex-1">
                  <LangSelect
                    id="source-lang"
                    label="From"
                    value={sourceLang}
                    onChange={setSourceLang}
                    includeAuto
                  />
                </Box>
                <button
                  type="button"
                  onClick={handleSwapLanguages}
                  disabled={sourceLang === AUTO_DETECT}
                  aria-label="Swap languages"
                  className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-raised text-content-subtle transition hover:bg-surface hover:text-content disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ⇄
                </button>
                <Box className="flex-1">
                  <LangSelect
                    id="target-lang"
                    label="To"
                    value={targetLang}
                    onChange={setTargetLang}
                  />
                </Box>
              </Box>

              {/* Text areas */}
              <Box className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Source */}
                <Box className="flex flex-col gap-1">
                  <textarea
                    aria-label="Text to translate"
                    value={sourceText}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSourceText(e.target.value.slice(0, MAX_CHARS))}
                    placeholder="Type or paste text here…"
                    rows={8}
                    className="w-full resize-none rounded-xl border border-border bg-surface p-3 text-sm text-content placeholder-content-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                  />
                  <Box className="flex items-center justify-between">
                    <Text variant="body-sm" muted className="text-xs">
                      {sourceText.length} / {MAX_CHARS}
                    </Text>
                    {detectedLang && (
                      <Text variant="body-sm" muted className="text-xs">
                        Detected: {langLabel(detectedLang)}
                      </Text>
                    )}
                  </Box>
                </Box>

                {/* Translated */}
                <Box className="flex flex-col gap-1">
                  <Box className="relative">
                    <textarea
                      aria-label="Translation output"
                      readOnly
                      value={translatedText}
                      placeholder={translating ? "Translating…" : "Translation appears here"}
                      rows={8}
                      className="w-full resize-none rounded-xl border border-border bg-surface-raised p-3 text-sm text-content placeholder-content-subtle focus:outline-none"
                    />
                    {translating && (
                      <Box className="absolute inset-0 flex items-center justify-center rounded-xl bg-surface-raised/80">
                        <Box className="flex items-center gap-2">
                          <Box className="h-2 w-2 animate-bounce rounded-full bg-brand-600 [animation-delay:-0.3s]" />
                          <Box className="h-2 w-2 animate-bounce rounded-full bg-brand-600 [animation-delay:-0.15s]" />
                          <Box className="h-2 w-2 animate-bounce rounded-full bg-brand-600" />
                        </Box>
                      </Box>
                    )}
                  </Box>
                  <Box className="flex justify-end">
                    {translatedText && (
                      <button
                        type="button"
                        onClick={handleCopyTranslation}
                        className="text-xs text-content-subtle hover:text-content transition"
                        aria-label="Copy translation"
                      >
                        Copy
                      </button>
                    )}
                  </Box>
                </Box>
              </Box>

              {/* Translate button + error */}
              {translateError && (
                <Box
                  className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2"
                  role="alert"
                >
                  <Text variant="body-sm" className="text-red-800">
                    {translateError}
                  </Text>
                </Box>
              )}
              <Box className="mt-4 flex justify-center">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => void handleTranslate()}
                  disabled={!sourceText.trim() || translating}
                >
                  {translating ? "Translating…" : "Translate"}
                </Button>
              </Box>
            </CardContent>
          </Card>

          {/* Translation Settings */}
          <Card>
            <CardHeader>
              <Text variant="heading-sm">Translation Settings</Text>
            </CardHeader>
            <CardContent>
              <Box className="divide-y divide-border">
                <SettingsToggle
                  label="Auto-detect language"
                  description="Automatically detect the source language instead of selecting it manually"
                  checked={autoDetect}
                  onChange={(v) => {
                    setAutoDetect(v);
                    if (v) setSourceLang(AUTO_DETECT);
                    else setSourceLang(defaultSource);
                  }}
                />
                <SettingsToggle
                  label="Show original alongside translated"
                  description="In email view, display the original text beneath the translation"
                  checked={showOriginal}
                  onChange={setShowOriginal}
                />
              </Box>
              <Box className="mt-4 grid grid-cols-2 gap-4">
                <LangSelect
                  id="default-source-lang"
                  label="Default source language"
                  value={defaultSource}
                  onChange={(v) => {
                    setDefaultSource(v);
                    if (!autoDetect) setSourceLang(v);
                  }}
                />
                <LangSelect
                  id="default-target-lang"
                  label="Default target language"
                  value={defaultTarget}
                  onChange={(v) => {
                    setDefaultTarget(v);
                    setTargetLang(v);
                  }}
                />
              </Box>
            </CardContent>
          </Card>

          {/* Stats */}
          <Box>
            <Text variant="heading-sm" className="mb-3">
              Translation Stats
            </Text>
            {loadingHistory ? (
              <Box className="grid grid-cols-2 gap-3">
                {[0, 1].map((i) => (
                  <Box
                    key={i}
                    className="h-20 animate-pulse rounded-xl bg-surface-raised"
                    aria-hidden="true"
                  />
                ))}
              </Box>
            ) : stats ? (
              <Box className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Box className="rounded-xl border border-border bg-surface-raised px-4 py-4 text-center">
                  <Text variant="heading-sm" className="text-2xl font-bold text-content">
                    {stats.emailsTranslatedThisMonth}
                  </Text>
                  <Text variant="body-sm" muted className="mt-1 text-xs">
                    Emails translated this month
                  </Text>
                </Box>
                <Box className="rounded-xl border border-border bg-surface-raised px-4 py-4">
                  <Text variant="body-sm" className="mb-2 font-medium text-content text-xs uppercase tracking-wide">
                    Top source languages
                  </Text>
                  {stats.topSourceLanguages.length === 0 ? (
                    <Text variant="body-sm" muted className="text-xs">
                      No translations yet
                    </Text>
                  ) : (
                    <Box className="space-y-1.5">
                      {stats.topSourceLanguages.map(({ language, count }) => (
                        <Box key={language} className="flex items-center justify-between">
                          <Text variant="body-sm" className="text-sm text-content">
                            {langLabel(language)}
                          </Text>
                          <Text variant="body-sm" muted className="text-xs">
                            {count}
                          </Text>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              </Box>
            ) : null}
          </Box>

          {/* Translation History */}
          <Box>
            <Text variant="heading-sm" className="mb-3">
              Translation History
            </Text>

            {historyError && (
              <Box
                className="mb-3 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3"
                role="alert"
              >
                <Text variant="body-sm" className="text-red-800">
                  {historyError}
                </Text>
                <Button variant="ghost" size="sm" onClick={() => void loadHistory()}>
                  Retry
                </Button>
              </Box>
            )}

            {loadingHistory ? (
              <Box className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Box
                    key={i}
                    className="h-12 animate-pulse rounded-xl bg-surface-raised"
                    aria-hidden="true"
                  />
                ))}
              </Box>
            ) : history.length === 0 ? (
              <Box className="rounded-xl border border-border bg-surface-raised px-4 py-8 text-center">
                <Text variant="body-sm" muted>
                  No translations yet. Use the Live Translation panel above to get started.
                </Text>
              </Box>
            ) : (
              <Box className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-raised">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-content-subtle uppercase tracking-wide">
                        From
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-content-subtle uppercase tracking-wide">
                        To
                      </th>
                      <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-content-subtle uppercase tracking-wide md:table-cell">
                        Snippet
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-content-subtle uppercase tracking-wide">
                        Words
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-content-subtle uppercase tracking-wide">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-surface">
                    {history.map((item) => (
                      <tr key={item.id} className="hover:bg-surface-raised transition-colors">
                        <td className="whitespace-nowrap px-4 py-3 text-content">
                          {langLabel(item.sourceLang)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-content">
                          {langLabel(item.targetLang)}
                        </td>
                        <td className="hidden max-w-xs truncate px-4 py-3 text-content-subtle md:table-cell">
                          {item.snippet}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-content-subtle">
                          {item.wordCount}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-content-subtle">
                          {formatDate(item.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            )}
          </Box>
        </Box>
      </PlanGate>
    </PageLayout>
  );
}
