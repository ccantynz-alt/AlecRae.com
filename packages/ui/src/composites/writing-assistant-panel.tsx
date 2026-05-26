"use client";

import { forwardRef, useState, useCallback, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WritingProfile {
  readonly id: string;
  readonly name: string;
  readonly formalityScore: number | null;
  readonly sampleCount: number;
}

export interface RewriteOption {
  readonly style: "formal" | "casual" | "concise" | "persuasive" | "friendly";
  readonly label: string;
}

export interface AutocompleteOption {
  readonly text: string;
  readonly confidence: number;
}

export interface SubjectLineOption {
  readonly subject: string;
  readonly style: string;
  readonly confidence: number;
}

export interface WritingAssistantPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Current compose body text */
  text: string;
  /** Current subject */
  subject?: string;
  /** Available writing profiles */
  profiles?: readonly WritingProfile[];
  /** Callbacks */
  onCompose?: (topic: string, tone: string, profileId?: string) => Promise<{ subject: string; body: string }>;
  onRewrite?: (text: string, style: string) => Promise<{ rewritten: string }>;
  onExpand?: (text: string) => Promise<{ expanded: string }>;
  onSummarize?: (text: string) => Promise<{ summary: string }>;
  onAutocomplete?: (partialText: string) => Promise<{ suggestions: AutocompleteOption[] }>;
  onSubjectLines?: (body: string) => Promise<{ subjects: SubjectLineOption[] }>;
  onProofread?: (text: string) => Promise<{ issues: unknown[]; scores: { overall: number; grammar: number; style: number; clarity: number } }>;
  /** Callback when user wants to apply generated text */
  onApplyText?: (text: string) => void;
  onApplySubject?: (subject: string) => void;
  className?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

type ActiveSection = "idle" | "compose" | "rewrite" | "expand" | "summarize" | "subjects" | "autocomplete" | "proofread";

const REWRITE_STYLES: readonly RewriteOption[] = [
  { style: "formal", label: "Formal" },
  { style: "casual", label: "Casual" },
  { style: "concise", label: "Concise" },
  { style: "persuasive", label: "Persuasive" },
  { style: "friendly", label: "Friendly" },
] as const;

const TONE_OPTIONS = ["professional", "casual", "friendly", "urgent", "persuasive", "empathetic"] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function SvgIcon({ d, rule }: { d: string; rule?: boolean }): React.ReactElement {
  return (
    <Box as="svg" className="w-4 h-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <Box as="path" d={d} {...(rule ? { fillRule: "evenodd", clipRule: "evenodd" } : {})} />
    </Box>
  );
}

SvgIcon.displayName = "SvgIcon";

const PEN_PATH = "M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z";
const EXPAND_PATH = "M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 011.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13 0a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 011.414-1.414L15 14.586V13a1 1 0 011-1z";
const COMPRESS_PATH = "M3 5a1 1 0 011-1h12a1 1 0 010 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 010 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h6a1 1 0 010 2H4a1 1 0 01-1-1z";
const SUBJECT_PATH = "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z";
const CODE_PATH = "M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z";

const BTN_CLS = "text-slate-300 hover:text-white hover:bg-slate-700";
const SECTION_CLS = "p-3 bg-slate-800/50 rounded-lg border border-slate-700";
const LABEL_CLS = "text-blue-400 font-medium uppercase tracking-wider";

function scoreColor(v: number): string {
  return v >= 80 ? "text-emerald-400" : v >= 60 ? "text-amber-400" : "text-red-400";
}

// ─── Main Component ─────────────────────────────────────────────────────────

export const WritingAssistantPanel = forwardRef<HTMLDivElement, WritingAssistantPanelProps>(
  function WritingAssistantPanel(
    { text, subject, profiles = [], onCompose, onRewrite, onExpand, onSummarize,
      onAutocomplete, onSubjectLines, onProofread, onApplyText, onApplySubject,
      className = "", ...props },
    ref,
  ) {
    const [activeSection, setActiveSection] = useState<ActiveSection>(text.trim() ? "idle" : "compose");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rewriteOpen, setRewriteOpen] = useState(false);
    const [rewriteResult, setRewriteResult] = useState<string | null>(null);
    const [rewriteStyle, setRewriteStyle] = useState<string | null>(null);
    const [expandResult, setExpandResult] = useState<string | null>(null);
    const [summarizeResult, setSummarizeResult] = useState<string | null>(null);
    const [subjectResults, setSubjectResults] = useState<readonly SubjectLineOption[]>([]);
    const [autocompleteResults, setAutocompleteResults] = useState<readonly AutocompleteOption[]>([]);
    const [composeTopic, setComposeTopic] = useState("");
    const [composeTone, setComposeTone] = useState<string>("professional");
    const [composeResult, setComposeResult] = useState<{ subject: string; body: string } | null>(null);
    const [proofreadScores, setProofreadScores] = useState<{ overall: number; grammar: number; style: number; clarity: number } | null>(null);
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

    const clearResults = useCallback((): void => {
      setRewriteResult(null); setRewriteStyle(null); setExpandResult(null);
      setSummarizeResult(null); setSubjectResults([]); setAutocompleteResults([]);
      setComposeResult(null); setProofreadScores(null); setError(null);
    }, []);

    const runAction = useCallback(
      async <T,>(section: ActiveSection, action: () => Promise<T>, onResult: (r: T) => void): Promise<void> => {
        clearResults(); setActiveSection(section); setLoading(true); setError(null);
        try { onResult(await action()); }
        catch (err) { setError(err instanceof Error ? err.message : "An unexpected error occurred"); }
        finally { setLoading(false); }
      }, [clearResults],
    );

    // Action handlers
    const handleRewrite = useCallback((style: string): void => {
      setRewriteOpen(false);
      if (!onRewrite || !text.trim()) return;
      void runAction("rewrite", () => onRewrite(text, style), (r) => { setRewriteResult(r.rewritten); setRewriteStyle(style); });
    }, [onRewrite, text, runAction]);

    const handleExpand = useCallback((): void => {
      if (!onExpand || !text.trim()) return;
      void runAction("expand", () => onExpand(text), (r) => setExpandResult(r.expanded));
    }, [onExpand, text, runAction]);

    const handleSummarize = useCallback((): void => {
      if (!onSummarize || !text.trim()) return;
      void runAction("summarize", () => onSummarize(text), (r) => setSummarizeResult(r.summary));
    }, [onSummarize, text, runAction]);

    const handleSubjectLines = useCallback((): void => {
      if (!onSubjectLines || !text.trim()) return;
      void runAction("subjects", () => onSubjectLines(text), (r) => setSubjectResults(r.subjects));
    }, [onSubjectLines, text, runAction]);

    const handleAutocomplete = useCallback((): void => {
      if (!onAutocomplete) return;
      void runAction("autocomplete", () => onAutocomplete(text), (r) => setAutocompleteResults(r.suggestions));
    }, [onAutocomplete, text, runAction]);

    const handleCompose = useCallback((): void => {
      if (!onCompose || !composeTopic.trim()) return;
      void runAction("compose", () => onCompose(composeTopic, composeTone, selectedProfileId ?? undefined), (r) => setComposeResult(r));
    }, [onCompose, composeTopic, composeTone, selectedProfileId, runAction]);

    const handleProofread = useCallback((): void => {
      if (!onProofread || !text.trim()) return;
      void runAction("proofread", () => onProofread(text), (r) => setProofreadScores(r.scores));
    }, [onProofread, text, runAction]);

    const handleShowCompose = useCallback((): void => { clearResults(); setActiveSection("compose"); }, [clearResults]);
    const hasText = text.trim().length > 0;
    const ready = !loading && !error;

    // Inline result section renderer
    const renderResult = (label: string, value: string, onApply: () => void): React.ReactElement => (
      <Box className={`flex flex-col gap-2 ${SECTION_CLS}`}>
        <Text variant="caption" className={LABEL_CLS}>{label}</Text>
        <Box className="max-h-48 overflow-y-auto">
          <Text variant="body-sm" className="text-slate-200 whitespace-pre-wrap leading-relaxed">{value}</Text>
        </Box>
        <Box className="flex justify-end pt-1">
          <Button variant="primary" size="sm" onClick={onApply}>Apply</Button>
        </Box>
      </Box>
    );

    // Clickable list item renderer
    const renderListItem = (key: string, primary: string, secondary: string, hoverLabel: string, onClick: () => void): React.ReactElement => (
      <Box
        key={key}
        className="flex items-center justify-between gap-2 px-3 py-2 rounded-md cursor-pointer hover:bg-slate-700/60 transition-colors group"
        onClick={onClick}
        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
        tabIndex={0} role="button" aria-label={`${hoverLabel}: ${primary}`}
      >
        <Box className="flex flex-col min-w-0">
          <Text variant="body-sm" className="text-slate-200 truncate">{primary}</Text>
          <Text variant="caption" className="text-slate-500">{secondary}</Text>
        </Box>
        <Text variant="caption" className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {hoverLabel}
        </Text>
      </Box>
    );

    return (
      <Box ref={ref} className={`flex flex-col bg-slate-900 border border-slate-700 rounded-xl overflow-hidden ${className}`}
        role="region" aria-label="Writing assistant" {...props}>

        {/* Header */}
        <Box className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-700 bg-slate-800/60">
          <SvgIcon d={PEN_PATH} />
          <Text variant="body-sm" className="font-semibold text-slate-200">Writing Assistant</Text>
          {subject && <Text variant="caption" className="text-slate-500 truncate ml-auto max-w-[120px]">{subject}</Text>}
        </Box>

        {/* Toolbar */}
        <Box className="flex flex-wrap items-center gap-1 px-2 py-2 border-b border-slate-700/50">
          {hasText && (
            <>
              {/* Rewrite dropdown */}
              <Box className="relative">
                <Button variant="ghost" size="sm" onClick={() => setRewriteOpen((p) => !p)}
                  icon={<SvgIcon d={PEN_PATH} />} aria-expanded={rewriteOpen} aria-haspopup="listbox" className={BTN_CLS}>
                  Rewrite
                </Button>
                {rewriteOpen && (
                  <Box className="absolute top-full left-0 mt-1 w-40 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 py-1"
                    role="listbox" aria-label="Rewrite styles">
                    {REWRITE_STYLES.map((opt) => (
                      <Box key={opt.style} className="px-3 py-2 text-sm cursor-pointer hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                        role="option" aria-selected={false} tabIndex={0}
                        onClick={() => handleRewrite(opt.style)}
                        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleRewrite(opt.style); } }}>
                        <Text variant="body-sm">{opt.label}</Text>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
              <Button variant="ghost" size="sm" onClick={handleExpand} icon={<SvgIcon d={EXPAND_PATH} rule />} disabled={loading} className={BTN_CLS}>Expand</Button>
              <Button variant="ghost" size="sm" onClick={handleSummarize} icon={<SvgIcon d={COMPRESS_PATH} rule />} disabled={loading} className={BTN_CLS}>Summarize</Button>
              <Button variant="ghost" size="sm" onClick={handleSubjectLines} icon={<SvgIcon d={SUBJECT_PATH} rule />} disabled={loading} className={BTN_CLS}>Subjects</Button>
              <Button variant="ghost" size="sm" onClick={handleAutocomplete} icon={<SvgIcon d={CODE_PATH} rule />} disabled={loading} className={BTN_CLS}>Complete</Button>
              {onProofread && <Button variant="ghost" size="sm" onClick={handleProofread} disabled={loading} className={BTN_CLS}>Proofread</Button>}
            </>
          )}
          {!hasText && onCompose && (
            <Button variant="ghost" size="sm" onClick={handleShowCompose} icon={<SvgIcon d={PEN_PATH} />}
              className="text-blue-400 hover:text-blue-300 hover:bg-slate-700">AI Compose</Button>
          )}
          {hasText && onCompose && activeSection !== "compose" && (
            <Button variant="ghost" size="sm" onClick={handleShowCompose}
              className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 ml-auto">Compose</Button>
          )}
        </Box>

        {/* Active section content */}
        <Box className="flex-1 overflow-y-auto p-3" style={{ maxHeight: 360 }}>
          {/* Loading */}
          {loading && (
            <Box className="flex items-center gap-1.5 py-4 justify-center" aria-live="polite">
              <Text variant="body-sm" className="text-slate-400">Thinking</Text>
              <Box className="flex gap-0.5">
                {[0, 150, 300].map((delay) => (
                  <Box key={delay} className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                ))}
              </Box>
            </Box>
          )}

          {/* Error */}
          {error && !loading && (
            <Box className="flex items-center gap-2 p-3 bg-red-950/40 rounded-lg border border-red-800/50">
              <Text variant="body-sm" className="text-red-400">{error}</Text>
            </Box>
          )}

          {/* Idle */}
          {activeSection === "idle" && ready && (
            <Box className="flex items-center justify-center py-6">
              <Text variant="body-sm" className="text-slate-500 text-center">Select an action above to get AI writing assistance.</Text>
            </Box>
          )}

          {/* Rewrite */}
          {activeSection === "rewrite" && rewriteResult && ready && (
            <Box className="flex flex-col gap-2">
              <Text variant="caption" className="text-slate-500">Style: {rewriteStyle}</Text>
              {renderResult("Rewritten", rewriteResult, () => onApplyText?.(rewriteResult))}
            </Box>
          )}

          {/* Expand */}
          {activeSection === "expand" && expandResult && ready &&
            renderResult("Expanded", expandResult, () => onApplyText?.(expandResult))}

          {/* Summarize */}
          {activeSection === "summarize" && summarizeResult && ready &&
            renderResult("Summary", summarizeResult, () => onApplyText?.(summarizeResult))}

          {/* Subject lines */}
          {activeSection === "subjects" && subjectResults.length > 0 && ready && (
            <Box className={`flex flex-col gap-1.5 ${SECTION_CLS}`}>
              <Text variant="caption" className={`${LABEL_CLS} mb-1`}>Subject Line Suggestions</Text>
              {subjectResults.map((opt, i) =>
                renderListItem(`subj-${i}`, opt.subject,
                  `${opt.style} — ${Math.round(opt.confidence * 100)}% confidence`,
                  "Apply", () => onApplySubject?.(opt.subject))
              )}
            </Box>
          )}

          {/* Autocomplete */}
          {activeSection === "autocomplete" && autocompleteResults.length > 0 && ready && (
            <Box className={`flex flex-col gap-1.5 ${SECTION_CLS}`}>
              <Text variant="caption" className={`${LABEL_CLS} mb-1`}>Completions</Text>
              {autocompleteResults.map((opt, i) =>
                renderListItem(`ac-${i}`, opt.text,
                  `${Math.round(opt.confidence * 100)}% confidence`,
                  "Append", () => onApplyText?.(text + opt.text))
              )}
            </Box>
          )}

          {/* Compose form */}
          {activeSection === "compose" && ready && !composeResult && onCompose && (
            <Box className={`flex flex-col gap-3 ${SECTION_CLS}`}>
              <Text variant="caption" className={LABEL_CLS}>AI Compose</Text>
              <Box as="textarea" value={composeTopic}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setComposeTopic(e.target.value)}
                placeholder="What should the email be about?"
                className="w-full h-20 px-3 py-2 rounded-md bg-slate-900 border border-slate-600 text-slate-200 text-sm resize-none placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                aria-label="Email topic" />
              <Box className="flex items-center gap-2">
                <Text variant="caption" className="text-slate-400 flex-shrink-0">Tone</Text>
                <Box as="select" value={composeTone}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setComposeTone(e.target.value)}
                  className="h-8 px-2 rounded-md border border-slate-600 bg-slate-900 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1"
                  aria-label="Writing tone">
                  {TONE_OPTIONS.map((t) => <Box as="option" key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</Box>)}
                </Box>
              </Box>
              {profiles.length > 0 && (
                <Box className="flex items-center gap-2">
                  <Text variant="caption" className="text-slate-400 flex-shrink-0">Profile</Text>
                  <Box as="select" value={selectedProfileId ?? ""}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedProfileId(e.target.value || null)}
                    className="h-8 px-2 rounded-md border border-slate-600 bg-slate-900 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1"
                    aria-label="Writing profile">
                    <Box as="option" value="">None</Box>
                    {profiles.map((p) => (
                      <Box as="option" key={p.id} value={p.id}>
                        {p.name}{p.formalityScore !== null ? ` (${Math.round(p.formalityScore * 100)}%)` : ""}{p.sampleCount > 0 ? ` — ${p.sampleCount} samples` : ""}
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
              <Button variant="primary" size="sm" onClick={handleCompose} loading={loading}
                disabled={!composeTopic.trim() || loading} className="self-end">Generate</Button>
            </Box>
          )}

          {/* Compose result */}
          {activeSection === "compose" && composeResult && ready && (
            <Box className="flex flex-col gap-2">
              <Box className={SECTION_CLS}>
                <Text variant="caption" className={`${LABEL_CLS} mb-1`}>Generated Subject</Text>
                <Text variant="body-sm" className="text-slate-200 font-medium">{composeResult.subject}</Text>
              </Box>
              {renderResult("Generated Body", composeResult.body, () => {
                onApplyText?.(composeResult.body);
                onApplySubject?.(composeResult.subject);
              })}
            </Box>
          )}

          {/* Proofread */}
          {activeSection === "proofread" && proofreadScores && ready && (
            <Box className={`flex flex-col gap-2 ${SECTION_CLS}`}>
              <Text variant="caption" className={LABEL_CLS}>Proofread Scores</Text>
              <Box className="grid grid-cols-2 gap-2">
                {(["overall", "grammar", "style", "clarity"] as const).map((key) => (
                  <Box key={key} className="flex items-center justify-between px-2 py-1.5 rounded bg-slate-900/60">
                    <Text variant="caption" className="text-slate-400">{key.charAt(0).toUpperCase() + key.slice(1)}</Text>
                    <Text variant="body-sm" className={`font-semibold ${scoreColor(proofreadScores[key])}`}>{proofreadScores[key]}</Text>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>

        {/* Profile selector footer */}
        {profiles.length > 0 && activeSection !== "compose" && (
          <Box className="flex items-center gap-2 px-3 py-2 border-t border-slate-700">
            <Text variant="caption" className="text-slate-500 flex-shrink-0">Profile:</Text>
            <Box as="select" value={selectedProfileId ?? ""}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedProfileId(e.target.value || null)}
              className="h-7 px-2 rounded border border-slate-600 bg-slate-800 text-slate-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 flex-1 min-w-0"
              aria-label="Select writing profile">
              <Box as="option" value="">None</Box>
              {profiles.map((p) => <Box as="option" key={p.id} value={p.id}>{p.name}</Box>)}
            </Box>
            {(() => { const s = profiles.find((p) => p.id === selectedProfileId); return s && s.sampleCount > 0 ? <Text variant="caption" className="text-slate-500 flex-shrink-0">{s.sampleCount} samples</Text> : null; })()}
          </Box>
        )}
      </Box>
    );
  },
);

WritingAssistantPanel.displayName = "WritingAssistantPanel";
