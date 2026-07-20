"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { PageLayout, ComposeEditor, Box, Text, type ComposeData } from "@alecrae/ui";
import { AnimatePresence, motion } from "motion/react";
import { messagesApi, authApi, calendarApi, grammarApi } from "../../../lib/api";
import { initLocalAI, grammarCheck as localGrammarCheck } from "../../../lib/local-ai";
import { RecipientAutocomplete } from "../../../components/RecipientAutocomplete";
import { SendTimePanel } from "../../../components/SendTimePanel";
import { AnimatedCompose } from "../../../components/AnimatedCompose";
import { OfflineComposeBanner, useOnlineStatus } from "../../../components/OfflineComposeBanner";
import { queueOutboxEmail } from "../../../lib/offline-store";
import { getSyncEngine } from "../../../lib/sync-engine";
import { ComposeSpellcheckPanel } from "../../../components/compose-spellcheck-panel";
import { ComposeAssistPanel, type AssistSlot } from "../../../components/compose-assist-panel";
import { ComposeRecallPanel } from "../../../components/compose-recall-panel";
import { VoiceDictationButton, type DictationResult } from "../../../components/voice-dictation-button";
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
  const isOnline = useOnlineStatus();
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [recipientForPrediction, setRecipientForPrediction] = useState("");
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  // Grammar check result — a full corrected-text version of the body, not a
  // structured issue list. "Apply" replaces the whole body with `text`,
  // which is a real, working edit (the old chip-based UI's Apply button only
  // ever dismissed the chip — it never touched the editor's content).
  const [grammarCorrection, setGrammarCorrection] = useState<{
    text: string;
    source: "webgpu" | "cloud";
    issueCount: number;
  } | null>(null);
  const [applyingGrammar, setApplyingGrammar] = useState(false);
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
  // Undo-send countdown: set right after a successful immediate send, cleared
  // when the window closes or the user hits Undo.
  const [undoableSend, setUndoableSend] = useState<{ id: string; secondsLeft: number } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const grammarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckedRef = useRef("");

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearInterval(undoTimerRef.current);
    };
  }, []);

  // Probe (don't force-download) local WebGPU capability on mount, so the
  // first real grammar check knows whether it can run on-device. The model
  // itself lazy-loads on first actual use inside runAI() — this call is
  // cheap and never blocks typing.
  useEffect(() => {
    void initLocalAI({ probeOnly: true });
  }, []);

  // Ensure the sync engine singleton exists so its online/offline listeners
  // are registered — without this, a user who lands directly on /compose
  // (deep link, PWA shortcut) without ever visiting /inbox first would have
  // no engine running to flush a queued offline send on reconnect.
  useEffect(() => {
    getSyncEngine();
  }, []);

  const startUndoCountdown = useCallback((id: string, untilIso: string) => {
    if (undoTimerRef.current) clearInterval(undoTimerRef.current);
    const secondsLeft = Math.max(0, Math.round((new Date(untilIso).getTime() - Date.now()) / 1000));
    setUndoableSend({ id, secondsLeft });
    undoTimerRef.current = setInterval(() => {
      setUndoableSend((prev) => {
        if (!prev) return prev;
        if (prev.secondsLeft <= 1) {
          if (undoTimerRef.current) clearInterval(undoTimerRef.current);
          return null;
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
  }, []);

  const handleUndoSend = useCallback(async () => {
    if (!undoableSend || undoing) return;
    setUndoing(true);
    try {
      await messagesApi.undoSend(undoableSend.id);
      setStatus("Send cancelled — moved back to drafts.");
      if (undoTimerRef.current) clearInterval(undoTimerRef.current);
      setUndoableSend(null);
    } catch (err) {
      setStatus(`Couldn't undo: ${err instanceof Error ? err.message : "the undo window may have closed"}`);
    } finally {
      setUndoing(false);
    }
  }, [undoableSend, undoing]);

  const _checkGrammar = useCallback((text: string) => {
    // Track the live body for the spellcheck + compose-assist panels.
    setBodyDraft(text);
    const plainText = text.replace(/<[^>]*>/g, "").trim();
    if (!plainText || plainText.length < 20 || plainText === lastCheckedRef.current) return;

    if (grammarTimerRef.current) clearTimeout(grammarTimerRef.current);

    // Short debounce — local WebGPU inference is sub-10ms once the model is
    // loaded, so this only needs to avoid checking on every keystroke, not
    // absorb network latency the way the old 1500ms cloud-only debounce did.
    grammarTimerRef.current = setTimeout(async () => {
      lastCheckedRef.current = plainText;
      try {
        const local = await localGrammarCheck(plainText);
        if (local.text.trim() && local.text.trim() !== plainText) {
          setGrammarCorrection({ text: local.text, source: local.source, issueCount: 1 });
        } else {
          setGrammarCorrection(null);
        }
      } catch {
        // localGrammarCheck() tries WebGPU first and falls back to
        // /api/ai/complete internally — but that Next.js route doesn't
        // exist yet, so for anyone without WebGPU this always throws. Fall
        // back to the real, working Hono endpoint directly.
        try {
          const res = await grammarApi.correct({ text: plainText });
          if (res.data.corrected.trim() && res.data.corrected.trim() !== plainText) {
            setGrammarCorrection({ text: res.data.corrected, source: "cloud", issueCount: res.data.issueCount });
          } else {
            setGrammarCorrection(null);
          }
        } catch {
          // Grammar checking unavailable entirely — leave any prior
          // correction banner as-is rather than clearing useful state.
        }
      }
    }, 400);
  }, []);

  const handleApplyGrammar = useCallback(() => {
    if (!grammarCorrection) return;
    setApplyingGrammar(true);
    setBodyDraft(grammarCorrection.text);
    setEditorKey((k) => k + 1); // force ComposeEditor to remount with the corrected body
    setGrammarCorrection(null);
    lastCheckedRef.current = grammarCorrection.text.replace(/<[^>]*>/g, "").trim();
    setApplyingGrammar(false);
  }, [grammarCorrection]);

  // Get compose mode from URL params (reply, forward, or new)
  const mode = searchParams.get("mode") as "reply" | "replyAll" | "forward" | null;
  const replyTo = searchParams.get("to") ?? "";
  const replySubject = searchParams.get("subject") ?? "";
  const replyBody = searchParams.get("body") ?? "";

  const [dictationStatus, setDictationStatus] = useState<string | null>(null);
  const dictationMode: "compose" | "reply" = mode === "reply" || mode === "replyAll" ? "reply" : "compose";
  const dictationReplyContext =
    dictationMode === "reply" ? { from: replyTo, subject: replySubject, body: replyBody } : undefined;
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

  const handleDictationResult = useCallback(
    (result: DictationResult) => {
      const currentBody = editorKey === 0 ? initialBody : bodyDraft;
      const newBody = currentBody.trim().length > 0 ? `${currentBody}\n\n${result.body}` : result.body;
      setBodyDraft(newBody);
      setEditorKey((k) => k + 1);
      lastCheckedRef.current = "";
      setDictationStatus("Dictation added to your draft.");
    },
    [editorKey, initialBody, bodyDraft],
  );

  const handleDictationError = useCallback((message: string) => {
    setDictationStatus(`Dictation: ${message}`);
  }, []);

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

      // OfflineComposeBanner tells the user their email "will be queued and
      // sent automatically when you reconnect" — this used to be false; the
      // send just failed and the email was lost. Queue for real instead of
      // even attempting the network call while known offline.
      if (!isOnline) {
        await queueForOfflineSend(fromEmail, toList, ccList, data);
        return;
      }

      const result = await messagesApi.send(sendPayload);
      setLastSentEmailId(result.id);
      if (result.undoableUntil) {
        startUndoCountdown(result.id, result.undoableUntil);
        setStatus(null);
      } else {
        setStatus(`Email queued successfully (ID: ${result.id})`);
      }
    } catch (err) {
      // A network-type failure (not a validation/API error) mid-send means
      // connectivity dropped between the offline check above and the fetch
      // actually going out — fall back to queueing rather than losing the
      // email outright.
      if (err instanceof TypeError && !navigator.onLine) {
        const fromEmail = data.from || userEmail;
        const toList = mergeRecipientLists(data.to, contactsTo);
        const ccList = mergeRecipientLists(data.cc, contactsCc).map((e) => ({ email: e }));
        if (fromEmail) {
          await queueForOfflineSend(fromEmail, toList, ccList, data);
          return;
        }
      }
      setStatus(`Error: ${err instanceof Error ? err.message : "Failed to send"}`);
    } finally {
      setSending(false);
    }
  };

  /** Queue a composed email in the local outbox for automatic send on reconnect. */
  const queueForOfflineSend = async (
    fromEmail: string,
    toList: string[],
    ccList: { email: string }[],
    data: ComposeData,
  ): Promise<void> => {
    await queueOutboxEmail({
      id: crypto.randomUUID(),
      from: { email: fromEmail },
      to: toList.map((e) => ({ email: e })),
      ...(ccList.length > 0 ? { cc: ccList } : {}),
      subject: data.subject,
      body: data.body,
      bodyFormat: "html",
      queuedAt: Date.now(),
      retryCount: 0,
    });
    setStatus("You're offline — this email is queued and will send automatically when you reconnect.");
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
        <AnimatePresence>
          {undoableSend && (
            <motion.div
              key="undo-send-banner"
              className="mb-4 p-3 rounded text-sm bg-blue-50 text-blue-800 flex items-center justify-between"
              variants={statusVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <span>Sending in {undoableSend.secondsLeft}s…</span>
              <button
                type="button"
                onClick={() => void handleUndoSend()}
                disabled={undoing}
                className="font-medium underline disabled:opacity-50"
              >
                {undoing ? "Undoing…" : "Undo"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <Box className="mb-3 flex items-center gap-3">
          <VoiceDictationButton
            mode={dictationMode}
            {...(dictationReplyContext ? { replyContext: dictationReplyContext } : {})}
            onResult={handleDictationResult}
            onError={handleDictationError}
          />
          {dictationStatus && (
            <Text variant="caption" muted>
              {dictationStatus}
            </Text>
          )}
        </Box>
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
        {/* Grammar check — a correction is available and can be applied */}
        {grammarCorrection && (
          <Box className="mb-3 px-3 py-2 rounded-lg border border-border bg-surface-secondary flex items-center gap-3">
            <Box className="flex items-center gap-1.5 flex-shrink-0">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" aria-hidden="true" />
              <Text variant="caption" className="font-medium text-content">
                {grammarCorrection.source === "webgpu" ? "Grammar check (instant, on-device)" : "Grammar check"}
              </Text>
              <Text variant="caption" muted>
                &mdash; corrections available
              </Text>
            </Box>
            <Box className="flex-1" />
            <button
              type="button"
              className="flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded bg-brand-100 text-brand-700 hover:bg-brand-600 hover:text-white transition-colors disabled:opacity-50"
              onClick={handleApplyGrammar}
              disabled={applyingGrammar}
              aria-label="Apply grammar corrections"
            >
              {applyingGrammar ? "Applying…" : "Apply"}
            </button>
            <button
              type="button"
              className="flex-shrink-0 text-content-tertiary hover:text-content text-xs transition-colors"
              onClick={() => setGrammarCorrection(null)}
              aria-label="Dismiss grammar suggestion"
            >
              Dismiss
            </button>
          </Box>
        )}
        {/* Grammar AI idle state — shown while body is being typed, before first check */}
        {!grammarCorrection && (
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
            onSend={handleSend}
            onSaveDraft={() => {
              setStatus("Draft saved locally");
            }}
            onDiscard={() => {
              setStatus(null);
              window.history.back();
            }}
            onBodyChange={_checkGrammar}
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
