"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { messagesApi } from "../lib/api";

interface QuickReplyProps {
  emailId: string;
  toEmail: string;
  toName: string;
  subject: string;
  userEmail: string;
  onSent: () => void;
  onClose: () => void;
}

export function QuickReply({ emailId, toEmail, toName, subject, userEmail, onSent, onClose }: QuickReplyProps) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSend = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    setError(null);

    try {
      await messagesApi.send({
        from: { email: userEmail },
        to: [{ email: toEmail, name: toName }],
        subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
        text: body,
        html: `<p>${body.replace(/\n/g, "<br>")}</p>`,
      });
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: 8, height: 0 }}
      transition={{ duration: 0.2 }}
      className="border-t border-border bg-surface-secondary p-4"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-body-sm text-content-secondary">Reply to</span>
        <span className="text-body-sm font-medium text-content">{toName || toEmail}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-content-tertiary hover:text-content transition-colors text-sm"
          aria-label="Close quick reply"
        >
          Cancel
        </button>
      </div>

      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Write a quick reply..."
        rows={3}
        className="w-full resize-none rounded-lg border border-border bg-surface p-3 text-body-md text-content placeholder:text-content-tertiary focus:outline-none focus:ring-2 focus:ring-border-focus"
      />

      {error && (
        <p className="text-caption text-status-error mt-1">{error}</p>
      )}

      <div className="flex items-center justify-between mt-2">
        <span className="text-caption text-content-tertiary">
          {typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl"}+Enter to send
        </span>
        <button
          type="button"
          onClick={handleSend}
          disabled={!body.trim() || sending}
          className="px-4 py-1.5 rounded-lg bg-brand-600 text-white text-body-sm font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
    </motion.div>
  );
}
