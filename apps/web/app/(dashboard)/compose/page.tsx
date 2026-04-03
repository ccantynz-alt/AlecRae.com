"use client";

import { PageLayout, ComposeEditor, type AISuggestion } from "@emailed/ui";

const sampleSuggestions: AISuggestion[] = [
  {
    id: "s1",
    type: "tone",
    label: "More professional",
    preview: "Consider a more formal tone for this client communication...",
  },
  {
    id: "s2",
    type: "autocomplete",
    label: "Complete paragraph",
    preview: "...and we look forward to discussing the partnership details in our upcoming meeting.",
  },
  {
    id: "s3",
    type: "grammar",
    label: "Fix punctuation",
    preview: 'Add a comma after "However" in the second paragraph.',
  },
];

export default function ComposePage() {
  return (
    <PageLayout title="Compose" fullWidth>
      <ComposeEditor
        suggestions={sampleSuggestions}
        showAIPanel={true}
        onSend={(data) => {
          // handle send
        }}
        onSaveDraft={() => {
          // handle draft save
        }}
        onDiscard={() => {
          // handle discard
        }}
        onApplySuggestion={(suggestion) => {
          // apply AI suggestion
        }}
        className="flex-1"
      />
    </PageLayout>
  );
}
