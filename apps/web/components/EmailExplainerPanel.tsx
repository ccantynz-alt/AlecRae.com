"use client";

/**
 * EmailExplainerPanel — "Why is this in my inbox?" AI explainer.
 *
 * Shows a slide-in panel with:
 *   - Who the sender is (sender summary)
 *   - Relationship context (history with the user)
 *   - Why the email landed here
 *   - Suggested actions with reasoning
 *   - Urgency level badge
 *
 * Fetches the explanation lazily when the panel is opened.
 * Uses Vienna design language: dark gradient, spring animations,
 * accessible keyboard navigation, reduced-motion support.
 */

import type { ReactElement } from "react";
import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Card, CardContent, Text, Box, Button } from "@emailed/ui";
import {
  emailExplainerApi,
  type EmailExplanationData,
} from "../lib/api";
import {
  drawerEnterRight,
  fadeInUp,
  SPRING_BOUNCY,
  SPRING_SNAPPY,
  staggerChildren,
  listItemEnter,
  useViennaReducedMotion,
  withReducedMotion,
} from "../lib/animations";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EmailExplainerPanelProps {
  /** The email ID to explain. */
  emailId: string;
  /** Whether the panel is open. */
  open: boolean;
  /** Callback to close the panel. */
  onClose: () => void;
  /** Optional className for the root container. */
  className?: string;
}

type LoadState = "idle" | "loading" | "loaded" | "error";

// ─── Urgency badge styling ──────────────────────────────────────────────────

const URGENCY_STYLES: Record<
  EmailExplanationData["urgencyLevel"],
  { bg: string; text: string; label: string }
> = {
  low: { bg: "bg-slate-500/20", text: "text-slate-300", label: "Low urgency" },
  medium: { bg: "bg-amber-500/20", text: "text-amber-300", label: "Medium urgency" },
  high: { bg: "bg-orange-500/20", text: "text-orange-300", label: "High urgency" },
  urgent: { bg: "bg-red-500/20", text: "text-red-300", label: "Urgent" },
};

// ─── Component ──────────────────────────────────────────────────────────────

export function EmailExplainerPanel({
  emailId,
  open,
  onClose,
  className,
}: EmailExplainerPanelProps): ReactElement {
  const [state, setState] = useState<LoadState>("idle");
  const [explanation, setExplanation] = useState<EmailExplanationData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const reduced = useViennaReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousEmailIdRef = useRef<string>("");

  const fetchExplanation = useCallback(async (): Promise<void> => {
    setState("loading");
    setErrorMsg("");
    try {
      const res = await emailExplainerApi.getByEmailId(emailId);
      setExplanation(res.data.explanation);
      setState("loaded");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to explain email");
      setState("error");
    }
  }, [emailId]);

  // Reset state when emailId changes
  useEffect(() => {
    if (emailId !== previousEmailIdRef.current) {
      previousEmailIdRef.current = emailId;
      setState("idle");
      setExplanation(null);
      setErrorMsg("");
    }
  }, [emailId]);

  // Auto-fetch when panel opens
  useEffect(() => {
    if (open && state === "idle") {
      void fetchExplanation();
    }
  }, [open, state, fetchExplanation]);

  // Focus trap: close on Escape
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Focus the panel when it opens
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus();
    }
  }, [open]);

  const drawerVariants = withReducedMotion(drawerEnterRight, reduced);
  const contentStagger = staggerChildren(0.05, 0.1);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="explainer-backdrop"
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            key="explainer-panel"
            ref={panelRef}
            className={`fixed top-0 right-0 z-50 h-full w-full max-w-md overflow-y-auto bg-gradient-to-b from-slate-950 to-slate-900 border-l border-white/10 shadow-2xl ${className ?? ""}`}
            variants={drawerVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-label="Why is this in my inbox?"
            tabIndex={-1}
          >
            {/* Header */}
            <Box className="sticky top-0 z-10 bg-slate-950/90 backdrop-blur-md border-b border-white/10 px-6 py-4 flex items-center justify-between">
              <Box className="flex items-center gap-2">
                <Box className="w-2 h-2 rounded-full bg-purple-400" role="presentation" />
                <Text
                  variant="body-sm"
                  className="font-semibold text-purple-200 uppercase tracking-wider text-xs"
                >
                  Why is this in my inbox?
                </Text>
              </Box>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                aria-label="Close explainer panel"
              >
                Close
              </Button>
            </Box>

            {/* Body */}
            <Box className="px-6 py-6 space-y-6">
              {/* Loading state */}
              {state === "loading" && (
                <Box className="space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Box key={i} className="space-y-2">
                      <Box
                        className="h-3 rounded bg-white/5 animate-pulse"
                        style={{ width: `${40 + i * 5}%` }}
                      />
                      <Box
                        className="h-3 rounded bg-white/5 animate-pulse"
                        style={{ width: `${70 - i * 5}%` }}
                      />
                    </Box>
                  ))}
                </Box>
              )}

              {/* Error state */}
              {state === "error" && (
                <Card className="bg-red-950/30 border-red-500/20" padding="md">
                  <CardContent>
                    <Text variant="body-sm" className="text-red-300 mb-3">
                      {errorMsg}
                    </Text>
                    <Button variant="ghost" size="sm" onClick={fetchExplanation}>
                      Retry
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Loaded state */}
              {state === "loaded" && explanation !== null && (
                <motion.div
                  variants={contentStagger}
                  initial="initial"
                  animate="animate"
                  className="space-y-5"
                >
                  {/* Urgency badge */}
                  <motion.div variants={listItemEnter}>
                    <Box
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${URGENCY_STYLES[explanation.urgencyLevel].bg}`}
                      role="status"
                      aria-label={URGENCY_STYLES[explanation.urgencyLevel].label}
                    >
                      <Box
                        className={`w-2 h-2 rounded-full ${
                          explanation.urgencyLevel === "urgent"
                            ? "bg-red-400 animate-pulse"
                            : explanation.urgencyLevel === "high"
                              ? "bg-orange-400"
                              : explanation.urgencyLevel === "medium"
                                ? "bg-amber-400"
                                : "bg-slate-400"
                        }`}
                      />
                      <Text
                        variant="body-sm"
                        className={`text-xs font-semibold uppercase tracking-wider ${URGENCY_STYLES[explanation.urgencyLevel].text}`}
                      >
                        {URGENCY_STYLES[explanation.urgencyLevel].label}
                      </Text>
                    </Box>
                  </motion.div>

                  {/* Sender Summary */}
                  <motion.div variants={listItemEnter}>
                    <ExplainerSection
                      title="Who is this?"
                      icon="sender"
                      content={explanation.senderSummary}
                    />
                  </motion.div>

                  {/* Relationship Context */}
                  <motion.div variants={listItemEnter}>
                    <ExplainerSection
                      title="Your history"
                      icon="relationship"
                      content={explanation.relationshipContext}
                    />
                  </motion.div>

                  {/* Why It's Here */}
                  <motion.div variants={listItemEnter}>
                    <ExplainerSection
                      title="Why it landed here"
                      icon="inbox"
                      content={explanation.whyItsHere}
                    />
                  </motion.div>

                  {/* Suggested Actions */}
                  <motion.div variants={listItemEnter}>
                    <Box className="space-y-3">
                      <Text
                        variant="body-sm"
                        className="font-semibold text-white/90 uppercase tracking-wider text-xs flex items-center gap-2"
                      >
                        <SectionIcon type="actions" />
                        Suggested actions
                      </Text>
                      <Box
                        className="space-y-2"
                        role="list"
                        aria-label="Suggested actions"
                      >
                        {explanation.suggestedActions.map((action, idx) => (
                          <Card
                            key={idx}
                            className="bg-white/5 border-white/10"
                            padding="sm"
                            hoverable
                          >
                            <Box
                              className="flex items-start gap-3"
                              role="listitem"
                            >
                              <Box className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <Text
                                  variant="body-sm"
                                  className="text-xs text-purple-300 font-bold"
                                >
                                  {idx + 1}
                                </Text>
                              </Box>
                              <Box>
                                <Text
                                  variant="body-sm"
                                  className="font-medium text-white"
                                >
                                  {action.action}
                                </Text>
                                <Text
                                  variant="body-sm"
                                  className="text-white/50 text-xs mt-0.5"
                                >
                                  {action.reasoning}
                                </Text>
                              </Box>
                            </Box>
                          </Card>
                        ))}
                      </Box>
                    </Box>
                  </motion.div>
                </motion.div>
              )}
            </Box>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface ExplainerSectionProps {
  title: string;
  icon: "sender" | "relationship" | "inbox";
  content: string;
}

function ExplainerSection({
  title,
  icon,
  content,
}: ExplainerSectionProps): ReactElement {
  return (
    <Box className="space-y-2">
      <Text
        variant="body-sm"
        className="font-semibold text-white/90 uppercase tracking-wider text-xs flex items-center gap-2"
      >
        <SectionIcon type={icon} />
        {title}
      </Text>
      <Card className="bg-white/5 border-white/10" padding="sm">
        <Text variant="body-sm" className="text-white/70 leading-relaxed">
          {content}
        </Text>
      </Card>
    </Box>
  );
}

interface SectionIconProps {
  type: "sender" | "relationship" | "inbox" | "actions";
}

function SectionIcon({ type }: SectionIconProps): ReactElement {
  const iconClassMap: Record<string, string> = {
    sender: "bg-blue-500/20",
    relationship: "bg-emerald-500/20",
    inbox: "bg-amber-500/20",
    actions: "bg-purple-500/20",
  };
  const dotClassMap: Record<string, string> = {
    sender: "bg-blue-400",
    relationship: "bg-emerald-400",
    inbox: "bg-amber-400",
    actions: "bg-purple-400",
  };

  return (
    <Box
      className={`w-4 h-4 rounded-full ${iconClassMap[type] ?? ""} flex items-center justify-center`}
      role="presentation"
    >
      <Box className={`w-1.5 h-1.5 rounded-full ${dotClassMap[type] ?? ""}`} />
    </Box>
  );
}
