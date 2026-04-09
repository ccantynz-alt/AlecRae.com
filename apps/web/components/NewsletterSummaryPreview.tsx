"use client";

/**
 * NewsletterSummaryPreview — AI-powered newsletter summary card.
 *
 * Displays a compact summary of a newsletter email: a headline, 3-5
 * bullet points, topics, estimated read time, and a key link. Fetches
 * the summary lazily when the user views a newsletter email. Includes
 * a "Show full email" toggle to reveal the original content.
 *
 * Uses the Vienna design language: translucent surfaces, Tailwind,
 * Framer Motion spring animations, reduced-motion support.
 */

import type { ReactElement } from "react";
import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Card, CardContent, Text, Box, Button } from "@emailed/ui";
import {
  newsletterSummaryApi,
  type NewsletterSummaryData,
} from "../lib/api";
import {
  fadeInUp,
  SPRING_BOUNCY,
  SPRING_SNAPPY,
  staggerChildren,
  listItemEnter,
  useViennaReducedMotion,
  withReducedMotion,
} from "../lib/animations";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NewsletterSummaryPreviewProps {
  /** The email ID to summarize. */
  emailId: string;
  /** Whether the email has been classified as a newsletter. */
  isNewsletter: boolean;
  /** Callback fired when the user wants to see the full email. */
  onShowFullEmail?: () => void;
  /** Optional className for the root container. */
  className?: string;
}

type LoadState = "idle" | "loading" | "loaded" | "error";

// ─── Urgency badge mapping ──────────────────────────────────────────────────

function readTimeBadgeColor(minutes: number): string {
  if (minutes <= 2) return "bg-emerald-500/20 text-emerald-300";
  if (minutes <= 5) return "bg-amber-500/20 text-amber-300";
  return "bg-red-500/20 text-red-300";
}

// ─── Component ──────────────────────────────────────────────────────────────

export function NewsletterSummaryPreview({
  emailId,
  isNewsletter,
  onShowFullEmail,
  className,
}: NewsletterSummaryPreviewProps): ReactElement | null {
  const [state, setState] = useState<LoadState>("idle");
  const [summary, setSummary] = useState<NewsletterSummaryData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [expanded, setExpanded] = useState(false);
  const reduced = useViennaReducedMotion();

  const fetchSummary = useCallback(async (): Promise<void> => {
    setState("loading");
    setErrorMsg("");
    try {
      const res = await newsletterSummaryApi.getByEmailId(emailId);
      setSummary(res.data.summary);
      setState("loaded");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to summarize");
      setState("error");
    }
  }, [emailId]);

  // Only render for newsletter emails
  if (!isNewsletter) return null;

  const containerVariants = withReducedMotion(fadeInUp, reduced);
  const staggerParent = staggerChildren(0.04, 0.05);

  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <Card
        className="bg-gradient-to-br from-blue-950/60 to-indigo-950/40 border-blue-500/20 backdrop-blur-sm"
        padding="none"
        hoverable
      >
        <CardContent className="p-4">
          {/* Header bar */}
          <Box className="flex items-center justify-between mb-3">
            <Box className="flex items-center gap-2">
              <Box
                className="w-2 h-2 rounded-full bg-blue-400"
                role="presentation"
              />
              <Text
                variant="body-sm"
                className="font-semibold text-blue-200 uppercase tracking-wider text-xs"
              >
                AI Summary
              </Text>
            </Box>
            {state === "idle" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchSummary}
                aria-label="Generate AI summary of this newsletter"
              >
                Summarize
              </Button>
            )}
            {state === "loading" && (
              <Text variant="body-sm" muted>
                Summarizing...
              </Text>
            )}
          </Box>

          {/* Loading state */}
          {state === "loading" && (
            <Box className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Box
                  key={i}
                  className="h-3 rounded bg-white/5 animate-pulse"
                  style={{ width: `${80 - i * 10}%` }}
                />
              ))}
            </Box>
          )}

          {/* Error state */}
          {state === "error" && (
            <Box className="flex items-center gap-3">
              <Text variant="body-sm" className="text-red-300">
                {errorMsg}
              </Text>
              <Button variant="ghost" size="sm" onClick={fetchSummary}>
                Retry
              </Button>
            </Box>
          )}

          {/* Loaded state */}
          <AnimatePresence>
            {state === "loaded" && summary !== null && (
              <motion.div
                variants={staggerParent}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {/* Headline */}
                <motion.div variants={listItemEnter}>
                  <Text
                    variant="body-md"
                    className="font-semibold text-white mb-3"
                  >
                    {summary.headline}
                  </Text>
                </motion.div>

                {/* Bullets */}
                <Box
                  className="space-y-1.5 mb-3"
                  role="list"
                  aria-label="Newsletter summary bullets"
                >
                  {summary.bullets.map((bullet, idx) => (
                    <motion.div
                      key={idx}
                      variants={listItemEnter}
                      className="flex items-start gap-2"
                      role="listitem"
                    >
                      <Box className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                      <Text variant="body-sm" className="text-blue-100/80">
                        {bullet}
                      </Text>
                    </motion.div>
                  ))}
                </Box>

                {/* Metadata row: topics + read time + key link */}
                <motion.div
                  variants={listItemEnter}
                  className="flex flex-wrap items-center gap-2"
                >
                  {/* Topics */}
                  {summary.topics.map((topic) => (
                    <Box
                      key={topic}
                      className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10"
                    >
                      <Text
                        variant="body-sm"
                        className="text-xs text-blue-200/70"
                      >
                        {topic}
                      </Text>
                    </Box>
                  ))}

                  {/* Read time badge */}
                  <Box
                    className={`px-2 py-0.5 rounded-full ${readTimeBadgeColor(summary.estimatedReadTime)}`}
                  >
                    <Text variant="body-sm" className="text-xs font-medium">
                      {summary.estimatedReadTime} min read
                    </Text>
                  </Box>
                </motion.div>

                {/* Actions row */}
                <motion.div
                  variants={listItemEnter}
                  className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5"
                >
                  {summary.keyLink && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (summary.keyLink) {
                          window.open(summary.keyLink, "_blank", "noopener");
                        }
                      }}
                      aria-label="Open key link from newsletter"
                    >
                      Key Link
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (expanded) {
                        setExpanded(false);
                      } else if (onShowFullEmail) {
                        setExpanded(true);
                        onShowFullEmail();
                      }
                    }}
                    aria-label={expanded ? "Collapse full email" : "Show full email"}
                  >
                    {expanded ? "Hide Full Email" : "Show Full Email"}
                  </Button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}
