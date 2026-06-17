"use client";

import { useState, useEffect, useCallback } from "react";
import { Box, Text, Button, Card, CardContent, CardHeader, PageLayout } from "@alecrae/ui";
import { translateApi } from "../../../lib/api-features";
import { PlanGate } from "../../../components/plan-gate";

const FLAG_EMOJI: Record<string, string> = {
  en: "🇬🇧", es: "🇪🇸", fr: "🇫🇷", de: "🇩🇪", it: "🇮🇹", pt: "🇧🇷",
  ja: "🇯🇵", zh: "🇨🇳", ko: "🇰🇷", ar: "🇸🇦", ru: "🇷🇺", nl: "🇳🇱",
};

export default function TranslatePage(): React.ReactNode {
  const [languages, setLanguages] = useState<{ code: string; name: string }[]>([]);
  const [sourceText, setSourceText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [history, setHistory] = useState<{ id: string; originalText: string; translatedText: string; sourceLanguage: string; targetLanguage: string; createdAt: string }[]>([]);
  const [stats, setStats] = useState<{ translatedThisMonth: number; topLanguages: { language: string; count: number }[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [langRes, histRes, statsRes] = await Promise.allSettled([
      translateApi.languages(),
      translateApi.history(),
      translateApi.stats(),
    ]);
    if (langRes.status === "fulfilled") setLanguages(langRes.value.data);
    if (histRes.status === "fulfilled") setHistory(histRes.value.data);
    if (statsRes.status === "fulfilled") setStats(statsRes.value.data);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleTranslate = async (): Promise<void> => {
    if (!sourceText.trim()) return;
    setTranslating(true);
    try {
      const res = await translateApi.translate(sourceText, targetLang, sourceLang === "auto" ? undefined : sourceLang);
      setTranslatedText(res.data.translatedText);
      if (res.data.detectedLanguage) setDetectedLang(res.data.detectedLanguage);
      // Refresh history
      const histRes = await translateApi.history().catch(() => null);
      if (histRes) setHistory(histRes.data);
    } catch {
      setTranslatedText("Translation failed. Please try again.");
    } finally {
      setTranslating(false);
    }
  };

  const swap = (): void => {
    if (sourceLang === "auto") return;
    const tmp = sourceLang;
    setSourceLang(targetLang);
    setTargetLang(tmp);
    setSourceText(translatedText);
    setTranslatedText(sourceText);
  };

  const langName = (code: string): string => {
    if (code === "auto") return "Auto-detect";
    return languages.find((l) => l.code === code)?.name ?? code;
  };

  return (
    <PlanGate feature="translation" required="personal">
      <PageLayout title="Translation" description="Translate emails and text between 35+ languages with AI.">
        {loading ? (
          <Box className="space-y-4">
            {[1, 2].map((i) => <Box key={i} className="h-32 animate-pulse rounded-xl bg-surface-secondary" />)}
          </Box>
        ) : (
          <Box className="space-y-6">
            {/* Stats */}
            {stats && (
              <Box className="flex flex-wrap gap-4">
                <Box className="p-3 rounded-xl border border-border bg-surface-raised text-center min-w-32">
                  <Text variant="body-sm" className="text-xl font-bold text-brand-700">{stats.translatedThisMonth}</Text>
                  <Text variant="caption" className="text-content-subtle">Emails translated this month</Text>
                </Box>
                {stats.topLanguages.slice(0, 3).map(({ language, count }) => (
                  <Box key={language} className="p-3 rounded-xl border border-border bg-surface-raised text-center min-w-24">
                    <Text variant="body-sm" className="text-xl">{FLAG_EMOJI[language] ?? "🌐"}</Text>
                    <Text variant="body-sm" className="font-medium">{langName(language)}</Text>
                    <Text variant="caption" className="text-content-subtle">{count} translations</Text>
                  </Box>
                ))}
              </Box>
            )}

            {/* Live translation */}
            <Card>
              <CardHeader>
                <Box className="flex items-center gap-3">
                  <select
                    value={sourceLang}
                    onChange={(e) => setSourceLang(e.target.value)}
                    className="text-sm border border-border rounded-lg px-3 py-1.5 bg-surface text-content focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="auto">Auto-detect</option>
                    {languages.map((l) => (
                      <option key={l.code} value={l.code}>{FLAG_EMOJI[l.code] ?? ""} {l.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={swap}
                    disabled={sourceLang === "auto"}
                    className="p-1.5 rounded-lg hover:bg-surface-secondary transition-colors disabled:opacity-40"
                    title="Swap languages"
                  >
                    ⇄
                  </button>
                  <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="text-sm border border-border rounded-lg px-3 py-1.5 bg-surface text-content focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    {languages.map((l) => (
                      <option key={l.code} value={l.code}>{FLAG_EMOJI[l.code] ?? ""} {l.name}</option>
                    ))}
                  </select>
                </Box>
              </CardHeader>
              <CardContent>
                <Box className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Box className="relative">
                    <textarea
                      value={sourceText}
                      onChange={(e) => setSourceText(e.target.value)}
                      placeholder="Enter text to translate..."
                      rows={6}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-content placeholder:text-content-tertiary focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
                    />
                    {detectedLang && sourceLang === "auto" && (
                      <Text variant="caption" className="text-content-subtle mt-1 block">
                        Detected: {langName(detectedLang)} {FLAG_EMOJI[detectedLang] ?? ""}
                      </Text>
                    )}
                  </Box>
                  <Box className="relative">
                    <textarea
                      value={translating ? "Translating…" : translatedText}
                      readOnly
                      rows={6}
                      placeholder="Translation will appear here"
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface-secondary text-content placeholder:text-content-tertiary resize-none"
                    />
                    {translatedText && (
                      <button
                        onClick={() => void navigator.clipboard.writeText(translatedText)}
                        className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-surface border border-border text-content-subtle hover:text-content transition-colors"
                      >
                        Copy
                      </button>
                    )}
                  </Box>
                </Box>
                <Box className="flex justify-center mt-4">
                  <Button
                    variant="primary"
                    onClick={() => void handleTranslate()}
                    disabled={translating || !sourceText.trim()}
                  >
                    {translating ? "Translating…" : "Translate"}
                  </Button>
                </Box>
              </CardContent>
            </Card>

            {/* History */}
            {history.length > 0 && (
              <Card>
                <CardHeader>
                  <Text variant="body-sm" className="text-sm font-semibold">Recent Translations</Text>
                </CardHeader>
                <CardContent>
                  <Box className="space-y-3">
                    {history.slice(0, 10).map((item) => (
                      <Box key={item.id} className="p-3 rounded-lg bg-surface-secondary border border-border">
                        <Box className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-surface border border-border text-content-subtle">
                            {FLAG_EMOJI[item.sourceLanguage] ?? "🌐"} {langName(item.sourceLanguage)}
                          </span>
                          <span className="text-content-tertiary">→</span>
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-surface border border-border text-content-subtle">
                            {FLAG_EMOJI[item.targetLanguage] ?? "🌐"} {langName(item.targetLanguage)}
                          </span>
                          <Text variant="caption" className="text-content-tertiary ml-auto">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </Text>
                        </Box>
                        <Text variant="caption" className="text-content-subtle line-clamp-1">{item.originalText}</Text>
                        <Text variant="caption" className="text-content line-clamp-1">{item.translatedText}</Text>
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            )}
          </Box>
        )}
      </PageLayout>
    </PlanGate>
  );
}
