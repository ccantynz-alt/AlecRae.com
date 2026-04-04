"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { PageLayout, ComposeEditor, type ComposeData, type AISuggestion } from "@emailed/ui";
import { messagesApi, authApi } from "../../../lib/api";

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
  const searchParams = useSearchParams();
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");

  // Get compose mode from URL params (reply, forward, or new)
  const mode = searchParams.get("mode") as "reply" | "replyAll" | "forward" | null;
  const replyTo = searchParams.get("to") ?? "";
  const replySubject = searchParams.get("subject") ?? "";
  const replyBody = searchParams.get("body") ?? "";
  const replyCc = searchParams.get("cc") ?? "";

  useEffect(() => {
    authApi.me().then((res) => {
      setUserEmail(res.data.email);
    }).catch(() => {});
  }, []);

  const initialSubject = mode === "forward"
    ? `Fwd: ${replySubject}`
    : mode === "reply" || mode === "replyAll"
      ? (replySubject.startsWith("Re:") ? replySubject : `Re: ${replySubject}`)
      : "";

  const initialBody = mode && replyBody
    ? `\n\n--- Original Message ---\n${replyBody}`
    : "";

  const handleSend = async (data: ComposeData) => {
    if (sending) return;
    setSending(true);
    setStatus(null);

    try {
      const fromEmail = data.from || userEmail;
      if (!fromEmail) {
        setStatus("Error: No sender email address configured");
        setSending(false);
        return;
      }

      const result = await messagesApi.send({
        from: { email: fromEmail },
        to: data.to.split(",").map((e: string) => ({ email: e.trim() })).filter((e) => e.email),
        cc: data.cc ? data.cc.split(",").map((e: string) => ({ email: e.trim() })).filter((e) => e.email) : undefined,
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
  };

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
        from={userEmail}
        to={replyTo}
        cc={mode === "replyAll" ? replyCc : ""}
        subject={initialSubject}
        body={initialBody}
        suggestions={sampleSuggestions}
        showAIPanel={true}
        onSend={handleSend}
        onSaveDraft={() => {
          setStatus("Draft saved locally");
        }}
        onDiscard={() => {
          setStatus(null);
          window.history.back();
        }}
        onApplySuggestion={() => {}}
        className="flex-1"
      />
    </PageLayout>
  );
}
