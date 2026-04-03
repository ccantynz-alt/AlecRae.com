"use client";

import { forwardRef, useState, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";

export interface AISuggestion {
  id: string;
  type: "rewrite" | "autocomplete" | "tone" | "grammar";
  label: string;
  preview: string;
}

export interface ComposeEditorProps extends HTMLAttributes<HTMLDivElement> {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
  suggestions?: AISuggestion[];
  onSend?: (data: { to: string; cc: string; bcc: string; subject: string; body: string }) => void;
  onSaveDraft?: () => void;
  onDiscard?: () => void;
  onApplySuggestion?: (suggestion: AISuggestion) => void;
  showAIPanel?: boolean;
  className?: string;
}

export const ComposeEditor = forwardRef<HTMLDivElement, ComposeEditorProps>(function ComposeEditor(
  {
    to: initialTo = "",
    cc: initialCc = "",
    bcc: initialBcc = "",
    subject: initialSubject = "",
    body: initialBody = "",
    suggestions = [],
    onSend,
    onSaveDraft,
    onDiscard,
    onApplySuggestion,
    showAIPanel = true,
    className = "",
    ...props
  },
  ref
) {
  const [showCcBcc, setShowCcBcc] = useState(false);

  return (
    <Box ref={ref} className={`flex flex-col h-full bg-surface ${className}`} {...props}>
      <ComposeToolbar onSend={onSend} onSaveDraft={onSaveDraft} onDiscard={onDiscard} />
      <Box className="flex flex-1 overflow-hidden">
        <Box className="flex-1 flex flex-col">
          <ComposeFields
            initialTo={initialTo}
            initialCc={initialCc}
            initialBcc={initialBcc}
            initialSubject={initialSubject}
            showCcBcc={showCcBcc}
            onToggleCcBcc={() => setShowCcBcc((prev) => !prev)}
          />
          <ComposeBody defaultValue={initialBody} />
        </Box>
        {showAIPanel && suggestions.length > 0 && (
          <AISuggestionsPanel
            suggestions={suggestions}
            onApply={onApplySuggestion}
          />
        )}
      </Box>
    </Box>
  );
});

ComposeEditor.displayName = "ComposeEditor";

interface ComposeToolbarProps {
  onSend?: (data: { to: string; cc: string; bcc: string; subject: string; body: string }) => void;
  onSaveDraft?: () => void;
  onDiscard?: () => void;
}

function ComposeToolbar({ onSend, onSaveDraft, onDiscard }: ComposeToolbarProps) {
  return (
    <Box className="flex items-center gap-2 px-4 py-3 border-b border-border">
      <Button variant="primary" size="md" onClick={() => onSend?.({ to: "", cc: "", bcc: "", subject: "", body: "" })}>
        Send
      </Button>
      <Button variant="secondary" size="md" onClick={onSaveDraft}>
        Save Draft
      </Button>
      <Box className="flex-1" />
      <Button variant="ghost" size="md" onClick={onDiscard}>
        Discard
      </Button>
    </Box>
  );
}

ComposeToolbar.displayName = "ComposeToolbar";

interface ComposeFieldsProps {
  initialTo: string;
  initialCc: string;
  initialBcc: string;
  initialSubject: string;
  showCcBcc: boolean;
  onToggleCcBcc: () => void;
}

function ComposeFields({ initialTo, initialCc, initialBcc, initialSubject, showCcBcc, onToggleCcBcc }: ComposeFieldsProps) {
  return (
    <Box className="px-4 py-2 border-b border-border space-y-2">
      <Box className="flex items-center gap-2">
        <Text variant="label" className="w-16 text-content-secondary">
          To
        </Text>
        <Input
          variant="email"
          defaultValue={initialTo}
          placeholder="recipient@example.com"
          className="border-0 shadow-none focus:ring-0"
        />
        <Button variant="ghost" size="sm" onClick={onToggleCcBcc}>
          Cc/Bcc
        </Button>
      </Box>
      {showCcBcc && (
        <Box className="space-y-2">
          <Box className="flex items-center gap-2">
            <Text variant="label" className="w-16 text-content-secondary">
              Cc
            </Text>
            <Input
              variant="email"
              defaultValue={initialCc}
              placeholder="cc@example.com"
              className="border-0 shadow-none focus:ring-0"
            />
          </Box>
          <Box className="flex items-center gap-2">
            <Text variant="label" className="w-16 text-content-secondary">
              Bcc
            </Text>
            <Input
              variant="email"
              defaultValue={initialBcc}
              placeholder="bcc@example.com"
              className="border-0 shadow-none focus:ring-0"
            />
          </Box>
        </Box>
      )}
      <Box className="flex items-center gap-2">
        <Text variant="label" className="w-16 text-content-secondary">
          Subject
        </Text>
        <Input
          variant="text"
          defaultValue={initialSubject}
          placeholder="Email subject"
          className="border-0 shadow-none focus:ring-0"
        />
      </Box>
    </Box>
  );
}

ComposeFields.displayName = "ComposeFields";

function ComposeBody({ defaultValue }: { defaultValue: string }) {
  return (
    <Box className="flex-1 p-4">
      <Box
        as="textarea"
        defaultValue={defaultValue}
        placeholder="Write your email..."
        className="w-full h-full resize-none bg-transparent text-body-md text-content focus:outline-none placeholder:text-content-tertiary"
      />
    </Box>
  );
}

ComposeBody.displayName = "ComposeBody";

interface AISuggestionsPanelProps {
  suggestions: AISuggestion[];
  onApply?: (suggestion: AISuggestion) => void;
}

function AISuggestionsPanel({ suggestions, onApply }: AISuggestionsPanelProps) {
  const typeLabels = {
    rewrite: "Rewrite",
    autocomplete: "Complete",
    tone: "Tone",
    grammar: "Grammar",
  } as const;

  return (
    <Box className="w-72 border-l border-border bg-surface-secondary p-4 overflow-y-auto">
      <Box className="flex items-center gap-2 mb-4">
        <Text variant="heading-sm">AI Suggestions</Text>
      </Box>
      <Box className="space-y-3">
        {suggestions.map((suggestion) => (
          <Box
            key={suggestion.id}
            className="p-3 bg-surface rounded-lg border border-border hover:border-brand-300 transition-colors cursor-pointer"
            onClick={() => onApply?.(suggestion)}
          >
            <Box className="flex items-center gap-2 mb-1">
              <Text
                as="span"
                variant="caption"
                className="px-1.5 py-0.5 bg-brand-50 text-brand-700 rounded font-medium"
              >
                {typeLabels[suggestion.type]}
              </Text>
              <Text variant="caption" className="font-medium">
                {suggestion.label}
              </Text>
            </Box>
            <Text variant="body-sm" muted className="line-clamp-2">
              {suggestion.preview}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

AISuggestionsPanel.displayName = "AISuggestionsPanel";
