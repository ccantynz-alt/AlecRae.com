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

export interface ComposeData {
  from: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
}

export interface ComposeEditorProps extends HTMLAttributes<HTMLDivElement> {
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
  suggestions?: AISuggestion[];
  onSend?: (data: ComposeData) => void;
  onSaveDraft?: () => void;
  onDiscard?: () => void;
  onApplySuggestion?: (suggestion: AISuggestion) => void;
  showAIPanel?: boolean;
  className?: string;
}

export const ComposeEditor = forwardRef<HTMLDivElement, ComposeEditorProps>(function ComposeEditor(
  {
    from: initialFrom = "",
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
  const [showCcBcc, setShowCcBcc] = useState(!!initialCc || !!initialBcc);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState(initialCc);
  const [bcc, setBcc] = useState(initialBcc);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);

  const handleSend = () => {
    onSend?.({ from, to, cc, bcc, subject, body });
  };

  return (
    <Box ref={ref} className={`flex flex-col h-full bg-surface ${className}`} {...props}>
      <Box className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Button variant="primary" size="md" onClick={handleSend}>
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
      <Box className="flex flex-1 overflow-hidden">
        <Box className="flex-1 flex flex-col">
          <Box className="px-4 py-2 border-b border-border space-y-2">
            {from && (
              <Box className="flex items-center gap-2">
                <Text variant="label" className="w-16 text-content-secondary">
                  From
                </Text>
                <Input
                  variant="email"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  placeholder="you@example.com"
                  className="border-0 shadow-none focus:ring-0"
                />
              </Box>
            )}
            <Box className="flex items-center gap-2">
              <Text variant="label" className="w-16 text-content-secondary">
                To
              </Text>
              <Input
                variant="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@example.com"
                className="border-0 shadow-none focus:ring-0"
              />
              <Button variant="ghost" size="sm" onClick={() => setShowCcBcc((prev) => !prev)}>
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
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
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
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
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
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject"
                className="border-0 shadow-none focus:ring-0"
              />
            </Box>
          </Box>
          <Box className="flex-1 p-4">
            <Box
              as="textarea"
              value={body}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
              placeholder="Write your email..."
              className="w-full h-full resize-none bg-transparent text-body-md text-content focus:outline-none placeholder:text-content-tertiary"
            />
          </Box>
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
