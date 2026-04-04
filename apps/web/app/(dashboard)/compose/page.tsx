"use client";

import { useState } from "react";
import { PageLayout, ComposeEditor, type AISuggestion } from "@emailed/ui";
import { messagesApi } from "../../../lib/api";

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
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  return (
    <PageLayout title="Compose" fullWidth>
      {status && (
        <div className={`mb-4 p-3 rounded text-sm ${
          status.startsWith("Error") ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
        }`}>
          {status}
        </div>
      )}
      <ComposeEditor
        suggestions={sampleSuggestions}
        showAIPanel={true}
        onSend={async (data) => {
          if (sending) return;
          setSending(true);
          setStatus(null);

          try {
            const result = await messagesApi.send({
              from: { email: data.from },
              to: data.to.split(",").map((e: string) => ({ email: e.trim() })),
              cc: data.cc ? data.cc.split(",").map((e: string) => ({ email: e.trim() })) : undefined,
              subject: data.subject,
              html: data.body,
              text: data.body.replace(/<[^>]*>/g, ""),
            });
            setStatus(`Email queued successfully (ID: ${result.id})`);
          } catch (err) {
            setStatus(`Error: ${err instanceof Error ? err.message : "Failed to send"}`);
          } finally {
            setSending(false);
          }
        }}
        onSaveDraft={() => {
          setStatus("Draft saved locally");
        }}
        onDiscard={() => {
          setStatus(null);
        }}
        onApplySuggestion={(suggestion) => {
          // AI suggestion application
        }}
        className="flex-1"
      />
    </PageLayout>
  );
}
