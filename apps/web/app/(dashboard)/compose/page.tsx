"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { PageLayout, ComposeEditor, Box, Text, type ComposeData, type AISuggestion } from "@alecrae/ui";
import { AnimatePresence, motion } from "motion/react";
import { messagesApi, authApi, calendarApi, grammarApi } from "../../../lib/api";
import { RecipientAutocomplete } from "../../../components/RecipientAutocomplete";
import { SendTimePanel } from "../../../components/SendTimePanel";
import { AnimatedCompose } from "../../../components/AnimatedCompose";
import { OfflineComposeBanner } from "../../../components/OfflineComposeBanner";
import { ComposeSpellcheckPanel } from "../../../components/compose-spellcheck-panel";
import { ComposeAssistPanel, type AssistSlot } from "../../../components/compose-assist-panel";
import { ComposeRecallPanel } from "../../../components/compose-recall-panel";
import { PlanGate } from "../../../components/plan-gate";
import {
  composeEnter,
  fadeInUp,
  useAlecRaeReducedMotion,
  withReducedMotion,
} from "../../../lib/animations";

import { Suspense } from "react";

export const dynamic = "force-dynamic";

/** Merge two comma-separated recipient strings, trimming and de-duplicating. */
function mergeRecipientLists(a: string, b: string): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const raw of [...a.split(","), ...b.split(",")]) {
    const email = raw.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(email);
  }
  return merged;
}

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
  // Contact-autocomplete recipients (merged into To/Cc on send).
  // The ComposeEditor manages its own To/Cc inputs internally, so the
  // autocomplete fields live at page level and their picks are merged in.
  const [contactsTo, setContactsTo] = useState("");
  const [contactsCc, setContactsCc] = useState("");
  // Live body text (HTML) tracked from the editor, used to drive spellcheck +
  // compose-assist. `editorKey` remounts the editor to push corrected/inserted
  // body text back in without touching the editor's internal wiring.
  const [bodyDraft, setBodyDraft] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  // Id of the most recently sent email — enables the recall panel.
  const [lastSentEmailId, setLastSentEmailId] = useState<string | null>(null);
  const grammarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckedRef = useRef("");

  const _checkGrammar = useCallback((text: string) => {
    // Track the live body for the spellcheck + compose-assist panels.
    setBodyDraft(text);
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

  // Push a new body value into the editor by remounting it with fresh initialBody.
  const applyBody = useCallback((next: string) => {
    setBodyDraft(next);
    lastCheckedRef.current = "";
    setEditorKey((k) => k + 1);
  }, []);

  // Spellcheck panel works on plain text; convert its corrected plain text back
  // to the editor body (which is plain text in this editor).
  const handleSpellcheckCorrection = useCallback(
    (correctedPlainText: string) => {
      applyBody(correctedPlainText);
    },
    [applyBody],
  );

  // Compose-assist: fetch candidate slots via the page's existing calendar flow,
  // adapting the SlotOption shape to the AssistSlot shape the panel expects.
  const handleAssistRequestSlots = useCallback(
    async (text: string): Promise<readonly AssistSlot[]> => {
      const res = await calendarApi.suggestSlots({
        text,
        ...(recipientForPrediction ? { recipientEmail: recipientForPrediction } : {}),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      return res.data.slots.map((s) => ({
        start: s.start,
        end: s.end,
        formattedRange: s.formattedRange,
        durationMinutes: s.durationMinutes,
        score: s.score,
        reasoning: s.reasoning,
      }));
    },
    [recipientForPrediction],
  );

  // Compose-assist: insert formatted slot content at the end of the draft body.
  const handleAssistInsert = useCallback(
    (content: string) => {
      applyBody(`${bodyDraft}${bodyDraft ? "\n\n" : ""}${content}`);
    },
    [applyBody, bodyDraft],
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

      // Merge recipients typed in the editor with contact-autocomplete picks
      const toList = mergeRecipientLists(data.to, contactsTo);
      // Track the first recipient for send-time prediction panel
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
      const ccList = mergeRecipientLists(data.cc, contactsCc).map((e) => ({ email: e }));
      if (ccList.length > 0) sendPayload.cc = ccList;
      const result = await messagesApi.send(sendPayload);
      setLastSentEmailId(result.id);
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
        {/* Contact autocomplete for recipients — picks are merged into To/Cc on send */}
        <Box className="mb-4 p-3 rounded-lg border border-border bg-surface-secondary">
          <Text variant="body-sm" className="font-medium mb-2">
            Add recipients from contacts
          </Text>
          <Box className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <RecipientAutocomplete
              label="To"
              value={contactsTo}
              onChange={setContactsTo}
              placeholder="Type a name or email..."
            />
            <RecipientAutocomplete
              label="Cc"
              value={contactsCc}
              onChange={setContactsCc}
              placeholder="Type a name or email..."
            />
          </Box>
          <Text variant="caption" muted className="mt-2">
            Suggestions come from your contacts. Selected addresses are added to
            the To/Cc fields when you send.
          </Text>
        </Box>
        {/* Grammar AI status bar — visible once the engine has a result */}
        {suggestions.length > 0 && (
          <Box className="mb-3 px-3 py-2 rounded-lg border border-border bg-surface-secondary flex items-center gap-3">
            <Box className="flex items-center gap-1.5 flex-shrink-0">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" aria-hidden="true" />
              <Text variant="caption" className="font-medium text-content">
                Grammar AI active
              </Text>
              <Text variant="caption" muted>
                &mdash; {suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""}
              </Text>
            </Box>
            {/* Suggestion chips — horizontally scrollable */}
            <Box className="flex-1 min-w-0 overflow-x-auto">
              <Box className="flex items-center gap-2 pb-0.5" style={{ minWidth: "max-content" }}>
                {suggestions.map((s) => {
                  // Extract original and correction from the preview string
                  // preview format: "Suggestion: <correction>" or just the label
                  const correctionMatch = s.preview.match(/^Suggestion:\s*(.+)$/);
                  const correction: string = correctionMatch?.[1] ?? s.preview;
                  return (
                    <Box
                      key={s.id}
                      className="flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-surface text-sm flex-shrink-0"
                    >
                      <Text as="span" variant="caption" muted className="line-through max-w-[80px] truncate">
                        {s.label.length > 30 ? `${s.label.slice(0, 30)}…` : s.label}
                      </Text>
                      <Text as="span" variant="caption" muted>→</Text>
                      <Text as="span" variant="caption" className="text-brand-600 max-w-[100px] truncate">
                        {correction.length > 30 ? `${correction.slice(0, 30)}…` : correction}
                      </Text>
                      <button
                        type="button"
                        className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-100 text-brand-700 hover:bg-brand-600 hover:text-white transition-colors"
                        onClick={() => {
                          setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
                        }}
                        aria-label={`Apply suggestion: ${correction}`}
                      >
                        Apply
                      </button>
                    </Box>
                  );
                })}
              </Box>
            </Box>
            <button
              type="button"
              className="flex-shrink-0 text-content-tertiary hover:text-content text-xs transition-colors"
              onClick={() => setSuggestions([])}
              aria-label="Dismiss all grammar suggestions"
            >
              Dismiss all
            </button>
          </Box>
        )}
        {/* Grammar AI idle state — shown while body is being typed, before first check */}
        {suggestions.length === 0 && (
          <Box className="mb-3 px-3 py-1.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-surface-tertiary inline-block" aria-hidden="true" />
            <Text variant="caption" muted>Grammar AI — type 20+ characters to activate</Text>
          </Box>
        )}
        <motion.div
          className="flex-1 flex flex-col min-h-0"
          variants={contentVariants}
          initial="initial"
          animate="animate"
        >
          <ComposeEditor
            key={editorKey}
            from={userEmail}
            to={replyTo}
            cc={mode === "replyAll" ? replyCc : ""}
            subject={initialSubject}
            body={editorKey === 0 ? initialBody : bodyDraft}
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
            onBodyChange={_checkGrammar}
            onApplySuggestion={(suggestion: AISuggestion) => {
              setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
            }}
            onRequestCalendarSlots={handleRequestCalendarSlots}
            className="flex-1"
          />
        </motion.div>

        {/* Compose power tools — AI assist + spellcheck (personal tier) */}
        <Box className="mt-4 space-y-3">
          <PlanGate feature="grammar_full" required="personal" showUpgrade={false}>
            <ComposeAssistPanel
              text={bodyDraft}
              onRequestSlots={handleAssistRequestSlots}
              onInsert={handleAssistInsert}
            />
          </PlanGate>
          <PlanGate feature="grammar_full" required="personal" showUpgrade={false}>
            <ComposeSpellcheckPanel
              text={bodyDraft.replace(/<[^>]*>/g, "")}
              onApplyCorrection={handleSpellcheckCorrection}
            />
          </PlanGate>
          {/* Email recall — only available once a message has been sent */}
          {lastSentEmailId && (
            <PlanGate feature="email_recall" required="personal">
              <ComposeRecallPanel emailId={lastSentEmailId} />
            </PlanGate>
          )}
        </Box>
      </AnimatedCompose>
    </PageLayout>
  );
}
