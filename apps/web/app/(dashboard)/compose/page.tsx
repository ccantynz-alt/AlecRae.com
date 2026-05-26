"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { PageLayout, ComposeEditor, type ComposeData, type AISuggestion } from "@alecrae/ui";
import { AnimatePresence, motion } from "motion/react";
import { messagesApi, authApi, calendarApi, grammarApi } from "../../../lib/api";
import { SendTimePanel } from "../../../components/SendTimePanel";
import { AnimatedCompose } from "../../../components/AnimatedCompose";
import { OfflineComposeBanner } from "../../../components/OfflineComposeBanner";
import {
  composeEnter,
  fadeInUp,
  useAlecRaeReducedMotion,
  withReducedMotion,
} from "../../../lib/animations";

import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default function ComposePageWrapper() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ComposePage />
    </Suspense>
  );
}

function ComposePage(): React.ReactNode {
  const searchParams = useSearchParams();
  const reduced = useAlecRaeReducedMotion();
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [recipientForPrediction, setRecipientForPrediction] = useState("");
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const grammarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckedRef = useRef("");

  const checkGrammar = useCallback((text: string) => {
    const plainText = text.replace(/<[^>]*>/g, "").trim();
    if (!plainText || plainText.length < 20 || plainText === lastCheckedRef.current) return;

    if (grammarTimerRef.current) clearTimeout(grammarTimerRef.current);

    grammarTimerRef.current = setTimeout(async () => {
      lastCheckedRef.current = plainText;
      try {
        const res = await grammarApi.check({ text: plainText });
        const newSuggestions: AISuggestion[] = res.data.issues.slice(0, 5).map((issue, i) => ({
          id: `g${i}`,
          type: "grammar" as const,
          label: issue.message,
          preview: issue.replacements.length > 0
            ? `Suggestion: ${issue.replacements[0]}`
            : issue.message,
        }));
        setSuggestions(newSuggestions);
      } catch {
        // Grammar API unavailable — no suggestions
      }
    }, 1500);
  }, []);

  // Get compose mode from URL params (reply, forward, or new)
  const mode = searchParams.get("mode") as "reply" | "replyAll" | "forward" | null;
  const replyTo = searchParams.get("to") ?? "";
  const replySubject = searchParams.get("subject") ?? "";
  const replyBody = searchParams.get("body") ?? "";
  const replyCc = searchParams.get("cc") ?? "";

  useEffect(() => {
    authApi.me().then((res) => {
      setUserEmail(res.data.email);
    }).catch(() => { /* not authenticated */ });
  }, []);

  const initialSubject = mode === "forward"
    ? `Fwd: ${replySubject}`
    : mode === "reply" || mode === "replyAll"
      ? (replySubject.startsWith("Re:") ? replySubject : `Re: ${replySubject}`)
      : "";

  const initialBody = mode && replyBody
    ? `\n\n--- Original Message ---\n${replyBody}`
    : "";

  // S10: Send-time optimization handlers
  const handleScheduleAt = useCallback(
    (datetime: string, reasoning: string) => {
      setScheduledAt(datetime);
      const date = new Date(datetime);
      const formatted = date.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      setStatus(`Scheduled to send at ${formatted} (${reasoning})`);
    },
    [],
  );

  const handleSendNow = useCallback(() => {
    setScheduledAt(null);
    setStatus(null);
  }, []);

  // B7: Calendar slot suggestion handler
  const handleRequestCalendarSlots = useCallback(
    async (text: string, recipientEmail: string) => {
      const res = await calendarApi.suggestSlots({
        text,
        ...(recipientEmail ? { recipientEmail } : {}),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      return res.data;
    },
    [],
  );

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

      // Track the first recipient for send-time prediction panel
      const toList = data.to.split(",").map((e: string) => e.trim()).filter(Boolean);
      if (toList[0] && toList[0] !== recipientForPrediction) {
        setRecipientForPrediction(toList[0]);
      }

      const sendPayload: Parameters<typeof messagesApi.send>[0] = {
        from: { email: fromEmail },
        to: toList.map((e) => ({ email: e })),
        subject: data.subject,
        html: data.body,
        text: data.body.replace(/<[^>]*>/g, ""),
        ...(scheduledAt ? { scheduledAt } : {}),
      };
      if (data.cc) {
        const ccList = data.cc.split(",").map((e: string) => ({ email: e.trim() })).filter((e) => e.email);
        if (ccList.length > 0) sendPayload.cc = ccList;
      }
      const result = await messagesApi.send(sendPayload);
      setStatus(`Email queued successfully (ID: ${result.id})`);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Failed to send"}`);
    } finally {
      setSending(false);
    }
  };

  const contentVariants = withReducedMotion(composeEnter, reduced);
  const statusVariants = withReducedMotion(fadeInUp, reduced);

  return (
    <PageLayout title="Compose" fullWidth>
      <OfflineComposeBanner />
      <AnimatedCompose show={true}>
        <AnimatePresence>
          {status && (
            <motion.div
              key="status"
              className={`mb-4 p-3 rounded text-sm ${
                status.startsWith("Error") ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
              }`}
              variants={statusVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {status}
            </motion.div>
          )}
        </AnimatePresence>
        <SendTimePanel
          recipientEmail={recipientForPrediction || replyTo}
          onScheduleAt={handleScheduleAt}
          onSendNow={handleSendNow}
          className="mb-4"
        />
        <AnimatePresence>
          {scheduledAt && (
            <motion.div
              key="schedule-banner"
              className="mb-4 p-3 rounded text-sm bg-blue-50 text-blue-800 flex items-center justify-between"
              variants={statusVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <span>
                Scheduled: {new Date(scheduledAt).toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              <button
                type="button"
                onClick={() => { setScheduledAt(null); setStatus(null); }}
                className="text-blue-600 hover:text-blue-800 text-xs font-medium"
              >
                Clear schedule
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div
          className="flex-1 flex flex-col min-h-0"
          variants={contentVariants}
          initial="initial"
          animate="animate"
        >
          <ComposeEditor
            from={userEmail}
            to={replyTo}
            cc={mode === "replyAll" ? replyCc : ""}
            subject={initialSubject}
            body={initialBody}
            suggestions={suggestions}
            showAIPanel={suggestions.length > 0}
            onSend={handleSend}
            onSaveDraft={() => {
              setStatus("Draft saved locally");
            }}
            onDiscard={() => {
              setStatus(null);
              window.history.back();
            }}
            onApplySuggestion={() => { /* no-op */ }}
            onRequestCalendarSlots={handleRequestCalendarSlots}
            onChange={checkGrammar}
            className="flex-1"
          />
        </motion.div>
      </AnimatedCompose>
    </PageLayout>
  );
}
