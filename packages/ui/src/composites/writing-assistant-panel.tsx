"use client";

import {
  forwardRef,
  useState,
  useCallback,
  type HTMLAttributes,
} from "react";
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

type ActiveSection =
  | "idle"
  | "compose"
  | "rewrite"
  | "expand"
  | "summarize"
  | "subjects"
  | "autocomplete"
  | "proofread";

const REWRITE_STYLES: readonly RewriteOption[] = [
  { style: "formal", label: "Formal" },
  { style: "casual", label: "Casual" },
  { style: "concise", label: "Concise" },
  { style: "persuasive", label: "Persuasive" },
  { style: "friendly", label: "Friendly" },
] as const;

const TONE_OPTIONS = [
  "professional",
  "casual",
  "friendly",
  "urgent",
  "persuasive",
  "empathetic",
] as const;

// ─── Icons ──────────────────────────────────────────────────────────────────

function PenIcon(): React.ReactElement {
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
        d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
      />
    </Box>
  );
}

PenIcon.displayName = "PenIcon";

function ExpandIcon(): React.ReactElement {
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
        d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 011.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13 0a1 1 0 01.993.883L17 13v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 011.414-1.414L15 14.586V13a1 1 0 011-1z"
        clipRule="evenodd"
      />
    </Box>
  );
}

ExpandIcon.displayName = "ExpandIcon";

function CompressIcon(): React.ReactElement {
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
        d="M3 5a1 1 0 011-1h12a1 1 0 010 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 010 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h6a1 1 0 010 2H4a1 1 0 01-1-1z"
        clipRule="evenodd"
      />
    </Box>
  );
}

CompressIcon.displayName = "CompressIcon";

function SubjectIcon(): React.ReactElement {
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
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
        clipRule="evenodd"
      />
    </Box>
  );
}

SubjectIcon.displayName = "SubjectIcon";

function AutocompleteIcon(): React.ReactElement {
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
        d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </Box>
  );
}

AutocompleteIcon.displayName = "AutocompleteIcon";

// ─── Loading Indicator ──────────────────────────────────────────────────────

function ThinkingDots(): React.ReactElement {
  return (
    <Box className="flex items-center gap-1.5 py-4 justify-center" aria-live="polite">
      <Text variant="body-sm" className="text-slate-400">
        Thinking
      </Text>
      <Box className="flex gap-0.5">
        <Box className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
        <Box className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
        <Box className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
      </Box>
    </Box>
  );
}

ThinkingDots.displayName = "ThinkingDots";

// ─── Result Display ─────────────────────────────────────────────────────────

function ResultSection({
  label,
  text,
  onApply,
}: {
  label: string;
  text: string;
  onApply: () => void;
}): React.ReactElement {
  return (
    <Box className="flex flex-col gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
      <Text variant="caption" className="text-blue-400 font-medium uppercase tracking-wider">
        {label}
      </Text>
      <Box className="max-h-48 overflow-y-auto">
        <Text variant="body-sm" className="text-slate-200 whitespace-pre-wrap leading-relaxed">
          {text}
        </Text>
      </Box>
      <Box className="flex justify-end pt-1">
        <Button variant="primary" size="sm" onClick={onApply}>
          Apply
        </Button>
      </Box>
    </Box>
  );
}

ResultSection.displayName = "ResultSection";

// ─── Error Display ──────────────────────────────────────────────────────────

function ErrorMessage({ message }: { message: string }): React.ReactElement {
  return (
    <Box className="flex items-center gap-2 p-3 bg-red-950/40 rounded-lg border border-red-800/50">
      <Text variant="body-sm" className="text-red-400">
        {message}
      </Text>
    </Box>
  );
}

ErrorMessage.displayName = "ErrorMessage";

// ─── Rewrite Style Picker ───────────────────────────────────────────────────

function RewriteStyleDropdown({
  isOpen,
  onToggle,
  onSelectStyle,
}: {
  isOpen: boolean;
  onToggle: () => void;
  onSelectStyle: (style: string) => void;
}): React.ReactElement {
  return (
    <Box className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggle}
        icon={<PenIcon />}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="text-slate-300 hover:text-white hover:bg-slate-700"
      >
        Rewrite
      </Button>
      {isOpen && (
        <Box
          className="absolute top-full left-0 mt-1 w-40 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 py-1"
          role="listbox"
          aria-label="Rewrite styles"
        >
          {REWRITE_STYLES.map((option) => (
            <Box
              key={option.style}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              role="option"
              aria-selected={false}
              onClick={() => onSelectStyle(option.style)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectStyle(option.style);
                }
              }}
              tabIndex={0}
            >
              <Text variant="body-sm">{option.label}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

RewriteStyleDropdown.displayName = "RewriteStyleDropdown";

// ─── Subject Line List ──────────────────────────────────────────────────────

function SubjectLineList({
  subjects,
  onApply,
}: {
  subjects: readonly SubjectLineOption[];
  onApply: (subject: string) => void;
}): React.ReactElement {
  return (
    <Box className="flex flex-col gap-1.5 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
      <Text variant="caption" className="text-blue-400 font-medium uppercase tracking-wider mb-1">
        Subject Line Suggestions
      </Text>
      {subjects.map((option, idx) => (
        <Box
          key={`subject-${idx}`}
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-md cursor-pointer hover:bg-slate-700/60 transition-colors group"
          onClick={() => onApply(option.subject)}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onApply(option.subject);
            }
          }}
          tabIndex={0}
          role="button"
          aria-label={`Apply subject: ${option.subject}`}
        >
          <Box className="flex flex-col min-w-0">
            <Text variant="body-sm" className="text-slate-200 truncate">
              {option.subject}
            </Text>
            <Text variant="caption" className="text-slate-500">
              {option.style} — {Math.round(option.confidence * 100)}% confidence
            </Text>
          </Box>
          <Text
            variant="caption"
            className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          >
            Apply
          </Text>
        </Box>
      ))}
    </Box>
  );
}

SubjectLineList.displayName = "SubjectLineList";

// ─── Autocomplete Suggestions ───────────────────────────────────────────────

function AutocompleteSuggestions({
  suggestions,
  onApply,
}: {
  suggestions: readonly AutocompleteOption[];
  onApply: (text: string) => void;
}): React.ReactElement {
  return (
    <Box className="flex flex-col gap-1.5 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
      <Text variant="caption" className="text-blue-400 font-medium uppercase tracking-wider mb-1">
        Completions
      </Text>
      {suggestions.map((option, idx) => (
        <Box
          key={`autocomplete-${idx}`}
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-md cursor-pointer hover:bg-slate-700/60 transition-colors group"
          onClick={() => onApply(option.text)}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onApply(option.text);
            }
          }}
          tabIndex={0}
          role="button"
          aria-label={`Append completion: ${option.text}`}
        >
          <Text variant="body-sm" className="text-slate-200 line-clamp-2">
            {option.text}
          </Text>
          <Box className="flex items-center gap-1.5 flex-shrink-0">
            <Text variant="caption" className="text-slate-500">
              {Math.round(option.confidence * 100)}%
            </Text>
            <Text
              variant="caption"
              className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              Append
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

AutocompleteSuggestions.displayName = "AutocompleteSuggestions";

// ─── Compose Section ────────────────────────────────────────────────────────

function ComposeSection({
  profiles,
  selectedProfileId,
  onSelectProfile,
  topic,
  onTopicChange,
  tone,
  onToneChange,
  onGenerate,
  loading,
}: {
  profiles: readonly WritingProfile[];
  selectedProfileId: string | null;
  onSelectProfile: (id: string | null) => void;
  topic: string;
  onTopicChange: (topic: string) => void;
  tone: string;
  onToneChange: (tone: string) => void;
  onGenerate: () => void;
  loading: boolean;
}): React.ReactElement {
  return (
    <Box className="flex flex-col gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
      <Text variant="caption" className="text-blue-400 font-medium uppercase tracking-wider">
        AI Compose
      </Text>

      <Box className="flex flex-col gap-2">
        <Box
          as="textarea"
          value={topic}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onTopicChange(e.target.value)}
          placeholder="What should the email be about?"
          className="w-full h-20 px-3 py-2 rounded-md bg-slate-900 border border-slate-600 text-slate-200 text-sm resize-none placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          aria-label="Email topic"
        />

        <Box className="flex items-center gap-2">
          <Text variant="caption" className="text-slate-400 flex-shrink-0">
            Tone
          </Text>
          <Box
            as="select"
            value={tone}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onToneChange(e.target.value)}
            className="h-8 px-2 rounded-md border border-slate-600 bg-slate-900 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1"
            aria-label="Writing tone"
          >
            {TONE_OPTIONS.map((t) => (
              <Box as="option" key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Box>
            ))}
          </Box>
        </Box>

        {profiles.length > 0 && (
          <Box className="flex items-center gap-2">
            <Text variant="caption" className="text-slate-400 flex-shrink-0">
              Profile
            </Text>
            <Box
              as="select"
              value={selectedProfileId ?? ""}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                onSelectProfile(e.target.value || null)
              }
              className="h-8 px-2 rounded-md border border-slate-600 bg-slate-900 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1"
              aria-label="Writing profile"
            >
              <Box as="option" value="">
                None
              </Box>
              {profiles.map((profile) => (
                <Box as="option" key={profile.id} value={profile.id}>
                  {profile.name}
                  {profile.formalityScore !== null
                    ? ` (${Math.round(profile.formalityScore * 100)}%)`
                    : ""}
                  {profile.sampleCount > 0 ? ` — ${profile.sampleCount} samples` : ""}
                </Box>
              ))}
            </Box>
          </Box>
        )}

        <Button
          variant="primary"
          size="sm"
          onClick={onGenerate}
          loading={loading}
          disabled={!topic.trim() || loading}
          className="self-end"
        >
          Generate
        </Button>
      </Box>
    </Box>
  );
}

ComposeSection.displayName = "ComposeSection";

// ─── Proofread Section ──────────────────────────────────────────────────────

function ProofreadSection({
  scores,
}: {
  scores: { overall: number; grammar: number; style: number; clarity: number };
}): React.ReactElement {
  const scoreItems: readonly { label: string; value: number }[] = [
    { label: "Overall", value: scores.overall },
    { label: "Grammar", value: scores.grammar },
    { label: "Style", value: scores.style },
    { label: "Clarity", value: scores.clarity },
  ];

  return (
    <Box className="flex flex-col gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
      <Text variant="caption" className="text-blue-400 font-medium uppercase tracking-wider">
        Proofread Scores
      </Text>
      <Box className="grid grid-cols-2 gap-2">
        {scoreItems.map((item) => {
          const color =
            item.value >= 80
              ? "text-emerald-400"
              : item.value >= 60
                ? "text-amber-400"
                : "text-red-400";
          return (
            <Box
              key={item.label}
              className="flex items-center justify-between px-2 py-1.5 rounded bg-slate-900/60"
            >
              <Text variant="caption" className="text-slate-400">
                {item.label}
              </Text>
              <Text variant="body-sm" className={`font-semibold ${color}`}>
                {item.value}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

ProofreadSection.displayName = "ProofreadSection";

// ─── Profile Selector (compact) ─────────────────────────────────────────────

function ProfileDropdown({
  profiles,
  selectedId,
  onSelect,
}: {
  profiles: readonly WritingProfile[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}): React.ReactElement {
  if (profiles.length === 0) {
    return <Box />;
  }

  const selected = profiles.find((p) => p.id === selectedId);

  return (
    <Box className="flex items-center gap-2 px-3 py-2 border-t border-slate-700">
      <Text variant="caption" className="text-slate-500 flex-shrink-0">
        Profile:
      </Text>
      <Box
        as="select"
        value={selectedId ?? ""}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
          onSelect(e.target.value || null)
        }
        className="h-7 px-2 rounded border border-slate-600 bg-slate-800 text-slate-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 flex-1 min-w-0"
        aria-label="Select writing profile"
      >
        <Box as="option" value="">
          None
        </Box>
        {profiles.map((profile) => (
          <Box as="option" key={profile.id} value={profile.id}>
            {profile.name}
          </Box>
        ))}
      </Box>
      {selected && selected.sampleCount > 0 && (
        <Text variant="caption" className="text-slate-500 flex-shrink-0">
          {selected.sampleCount} samples
        </Text>
      )}
    </Box>
  );
}

ProfileDropdown.displayName = "ProfileDropdown";

// ─── Main Component ─────────────────────────────────────────────────────────

export const WritingAssistantPanel = forwardRef<
  HTMLDivElement,
  WritingAssistantPanelProps
>(function WritingAssistantPanel(
  {
    text,
    subject,
    profiles = [],
    onCompose,
    onRewrite,
    onExpand,
    onSummarize,
    onAutocomplete,
    onSubjectLines,
    onProofread,
    onApplyText,
    onApplySubject,
    className = "",
    ...props
  },
  ref,
) {
  // ─── State ────────────────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState<ActiveSection>(
    text.trim() ? "idle" : "compose",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rewrite
  const [rewriteDropdownOpen, setRewriteDropdownOpen] = useState(false);
  const [rewriteResult, setRewriteResult] = useState<string | null>(null);
  const [rewriteStyle, setRewriteStyle] = useState<string | null>(null);

  // Expand
  const [expandResult, setExpandResult] = useState<string | null>(null);

  // Summarize
  const [summarizeResult, setSummarizeResult] = useState<string | null>(null);

  // Subject Lines
  const [subjectResults, setSubjectResults] = useState<readonly SubjectLineOption[]>([]);

  // Autocomplete
  const [autocompleteResults, setAutocompleteResults] = useState<readonly AutocompleteOption[]>([]);

  // Compose
  const [composeTopic, setComposeTopic] = useState("");
  const [composeTone, setComposeTone] = useState<string>("professional");
  const [composeResult, setComposeResult] = useState<{ subject: string; body: string } | null>(null);

  // Proofread
  const [proofreadScores, setProofreadScores] = useState<{
    overall: number;
    grammar: number;
    style: number;
    clarity: number;
  } | null>(null);

  // Profile
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  // ─── Helpers ──────────────────────────────────────────────────────────

  const clearResults = useCallback((): void => {
    setRewriteResult(null);
    setRewriteStyle(null);
    setExpandResult(null);
    setSummarizeResult(null);
    setSubjectResults([]);
    setAutocompleteResults([]);
    setComposeResult(null);
    setProofreadScores(null);
    setError(null);
  }, []);

  const runAction = useCallback(
    async <T,>(
      section: ActiveSection,
      action: () => Promise<T>,
      onResult: (result: T) => void,
    ): Promise<void> => {
      clearResults();
      setActiveSection(section);
      setLoading(true);
      setError(null);
      try {
        const result = await action();
        onResult(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "An unexpected error occurred";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [clearResults],
  );

  // ─── Action Handlers ─────────────────────────────────────────────────

  const handleRewrite = useCallback(
    (style: string): void => {
      setRewriteDropdownOpen(false);
      if (!onRewrite || !text.trim()) return;
      void runAction("rewrite", () => onRewrite(text, style), (result) => {
        setRewriteResult(result.rewritten);
        setRewriteStyle(style);
      });
    },
    [onRewrite, text, runAction],
  );

  const handleExpand = useCallback((): void => {
    if (!onExpand || !text.trim()) return;
    void runAction("expand", () => onExpand(text), (result) => {
      setExpandResult(result.expanded);
    });
  }, [onExpand, text, runAction]);

  const handleSummarize = useCallback((): void => {
    if (!onSummarize || !text.trim()) return;
    void runAction("summarize", () => onSummarize(text), (result) => {
      setSummarizeResult(result.summary);
    });
  }, [onSummarize, text, runAction]);

  const handleSubjectLines = useCallback((): void => {
    if (!onSubjectLines || !text.trim()) return;
    void runAction("subjects", () => onSubjectLines(text), (result) => {
      setSubjectResults(result.subjects);
    });
  }, [onSubjectLines, text, runAction]);

  const handleAutocomplete = useCallback((): void => {
    if (!onAutocomplete) return;
    void runAction("autocomplete", () => onAutocomplete(text), (result) => {
      setAutocompleteResults(result.suggestions);
    });
  }, [onAutocomplete, text, runAction]);

  const handleCompose = useCallback((): void => {
    if (!onCompose || !composeTopic.trim()) return;
    void runAction(
      "compose",
      () => onCompose(composeTopic, composeTone, selectedProfileId ?? undefined),
      (result) => {
        setComposeResult(result);
      },
    );
  }, [onCompose, composeTopic, composeTone, selectedProfileId, runAction]);

  const handleProofread = useCallback((): void => {
    if (!onProofread || !text.trim()) return;
    void runAction("proofread", () => onProofread(text), (result) => {
      setProofreadScores(result.scores);
    });
  }, [onProofread, text, runAction]);

  // ─── Apply Handlers ──────────────────────────────────────────────────

  const handleApplyRewrite = useCallback((): void => {
    if (rewriteResult) onApplyText?.(rewriteResult);
  }, [rewriteResult, onApplyText]);

  const handleApplyExpand = useCallback((): void => {
    if (expandResult) onApplyText?.(expandResult);
  }, [expandResult, onApplyText]);

  const handleApplySummarize = useCallback((): void => {
    if (summarizeResult) onApplyText?.(summarizeResult);
  }, [summarizeResult, onApplyText]);

  const handleApplySubject = useCallback(
    (subjectText: string): void => {
      onApplySubject?.(subjectText);
    },
    [onApplySubject],
  );

  const handleApplyAutocomplete = useCallback(
    (completionText: string): void => {
      onApplyText?.(text + completionText);
    },
    [text, onApplyText],
  );

  const handleApplyCompose = useCallback((): void => {
    if (!composeResult) return;
    onApplyText?.(composeResult.body);
    onApplySubject?.(composeResult.subject);
  }, [composeResult, onApplyText, onApplySubject]);

  const handleShowCompose = useCallback((): void => {
    clearResults();
    setActiveSection("compose");
  }, [clearResults]);

  // ─── Render ───────────────────────────────────────────────────────────

  const hasText = text.trim().length > 0;

  return (
    <Box
      ref={ref}
      className={`flex flex-col bg-slate-900 border border-slate-700 rounded-xl overflow-hidden ${className}`}
      role="region"
      aria-label="Writing assistant"
      {...props}
    >
      {/* Header */}
      <Box className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-700 bg-slate-800/60">
        <PenIcon />
        <Text variant="body-sm" className="font-semibold text-slate-200">
          Writing Assistant
        </Text>
        {subject && (
          <Text variant="caption" className="text-slate-500 truncate ml-auto max-w-[120px]">
            {subject}
          </Text>
        )}
      </Box>

      {/* Toolbar row */}
      <Box className="flex flex-wrap items-center gap-1 px-2 py-2 border-b border-slate-700/50">
        {hasText && (
          <>
            <RewriteStyleDropdown
              isOpen={rewriteDropdownOpen}
              onToggle={() => setRewriteDropdownOpen((prev) => !prev)}
              onSelectStyle={handleRewrite}
            />

            <Button
              variant="ghost"
              size="sm"
              onClick={handleExpand}
              icon={<ExpandIcon />}
              disabled={loading}
              className="text-slate-300 hover:text-white hover:bg-slate-700"
            >
              Expand
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleSummarize}
              icon={<CompressIcon />}
              disabled={loading}
              className="text-slate-300 hover:text-white hover:bg-slate-700"
            >
              Summarize
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleSubjectLines}
              icon={<SubjectIcon />}
              disabled={loading}
              className="text-slate-300 hover:text-white hover:bg-slate-700"
            >
              Subjects
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleAutocomplete}
              icon={<AutocompleteIcon />}
              disabled={loading}
              className="text-slate-300 hover:text-white hover:bg-slate-700"
            >
              Complete
            </Button>

            {onProofread && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleProofread}
                disabled={loading}
                className="text-slate-300 hover:text-white hover:bg-slate-700"
              >
                Proofread
              </Button>
            )}
          </>
        )}

        {!hasText && onCompose && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleShowCompose}
            icon={<PenIcon />}
            className="text-blue-400 hover:text-blue-300 hover:bg-slate-700"
          >
            AI Compose
          </Button>
        )}

        {hasText && onCompose && activeSection !== "compose" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleShowCompose}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 ml-auto"
          >
            Compose
          </Button>
        )}
      </Box>

      {/* Active section content */}
      <Box className="flex-1 overflow-y-auto p-3" style={{ maxHeight: 360 }}>
        {/* Loading state */}
        {loading && <ThinkingDots />}

        {/* Error state */}
        {error && !loading && <ErrorMessage message={error} />}

        {/* Idle state */}
        {activeSection === "idle" && !loading && !error && (
          <Box className="flex items-center justify-center py-6">
            <Text variant="body-sm" className="text-slate-500 text-center">
              Select an action above to get AI writing assistance.
            </Text>
          </Box>
        )}

        {/* Rewrite result */}
        {activeSection === "rewrite" && rewriteResult && !loading && !error && (
          <Box className="flex flex-col gap-2">
            <Text variant="caption" className="text-slate-500">
              Style: {rewriteStyle}
            </Text>
            <ResultSection
              label="Rewritten"
              text={rewriteResult}
              onApply={handleApplyRewrite}
            />
          </Box>
        )}

        {/* Expand result */}
        {activeSection === "expand" && expandResult && !loading && !error && (
          <ResultSection
            label="Expanded"
            text={expandResult}
            onApply={handleApplyExpand}
          />
        )}

        {/* Summarize result */}
        {activeSection === "summarize" && summarizeResult && !loading && !error && (
          <ResultSection
            label="Summary"
            text={summarizeResult}
            onApply={handleApplySummarize}
          />
        )}

        {/* Subject line results */}
        {activeSection === "subjects" && subjectResults.length > 0 && !loading && !error && (
          <SubjectLineList subjects={subjectResults} onApply={handleApplySubject} />
        )}

        {/* Autocomplete results */}
        {activeSection === "autocomplete" && autocompleteResults.length > 0 && !loading && !error && (
          <AutocompleteSuggestions
            suggestions={autocompleteResults}
            onApply={handleApplyAutocomplete}
          />
        )}

        {/* Compose section */}
        {activeSection === "compose" && !loading && !error && !composeResult && onCompose && (
          <ComposeSection
            profiles={profiles}
            selectedProfileId={selectedProfileId}
            onSelectProfile={setSelectedProfileId}
            topic={composeTopic}
            onTopicChange={setComposeTopic}
            tone={composeTone}
            onToneChange={setComposeTone}
            onGenerate={handleCompose}
            loading={loading}
          />
        )}

        {/* Compose result */}
        {activeSection === "compose" && composeResult && !loading && !error && (
          <Box className="flex flex-col gap-2">
            <Box className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
              <Text variant="caption" className="text-blue-400 font-medium uppercase tracking-wider mb-1">
                Generated Subject
              </Text>
              <Text variant="body-sm" className="text-slate-200 font-medium">
                {composeResult.subject}
              </Text>
            </Box>
            <ResultSection
              label="Generated Body"
              text={composeResult.body}
              onApply={handleApplyCompose}
            />
          </Box>
        )}

        {/* Proofread result */}
        {activeSection === "proofread" && proofreadScores && !loading && !error && (
          <ProofreadSection scores={proofreadScores} />
        )}
      </Box>

      {/* Profile selector footer */}
      {profiles.length > 0 && activeSection !== "compose" && (
        <ProfileDropdown
          profiles={profiles}
          selectedId={selectedProfileId}
          onSelect={setSelectedProfileId}
        />
      )}
    </Box>
  );
});

WritingAssistantPanel.displayName = "WritingAssistantPanel";
