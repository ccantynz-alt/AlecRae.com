"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Box, Text, Button, PageLayout } from "@alecrae/ui";
import { AnimatePresence, motion } from "motion/react";
import { messagesApi, type Message } from "../../../lib/api";
import { PressableScale } from "../../../components/PressableScale";
import { EmailListSkeleton } from "../../../components/AnimatedSkeleton";
import {
  fadeInUp,
  useAlecRaeReducedMotion,
} from "../../../lib/animations";

interface DraftItem {
  id: string;
  to: string;
  subject: string;
  preview: string;
  updatedAt: string;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function DraftsPage(): React.ReactNode {
  const router = useRouter();
  const reduced = useAlecRaeReducedMotion();
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDrafts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await messagesApi.list({ limit: 50, status: "queued" });
      const items: DraftItem[] = res.data.map((msg: Message) => ({
        id: msg.id,
        to: msg.to.map((r) => r.name ?? r.email).join(", ") || "No recipient",
        subject: msg.subject || "(no subject)",
        preview: msg.preview || "",
        updatedAt: msg.updatedAt,
      }));
      setDrafts(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load drafts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const handleOpenDraft = (draft: DraftItem): void => {
    const params = new URLSearchParams({
      to: draft.to !== "No recipient" ? draft.to : "",
      subject: draft.subject !== "(no subject)" ? draft.subject : "",
    });
    router.push(`/compose?${params.toString()}`);
  };

  const handleDelete = async (id: string): Promise<void> => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    try {
      await messagesApi.delete(id);
    } catch {
      fetchDrafts();
    }
  };

  return (
    <PageLayout title="Drafts" fullWidth>
      <Box className="flex flex-1 h-full">
        <Box className="w-full max-w-3xl mx-auto">
          <Box className="px-4 py-2 border-b border-border bg-surface-secondary">
            <Text variant="body-sm" muted>
              {loading ? "Loading..." : `${drafts.length} drafts`}
            </Text>
          </Box>

          {loading ? (
            <EmailListSkeleton count={5} />
          ) : error ? (
            <Box className="p-6 text-center">
              <Text variant="body-sm" muted>{error}</Text>
              <PressableScale as="button" tapScale={0.95} className="mt-3">
                <Button variant="secondary" size="sm" onClick={fetchDrafts}>Retry</Button>
              </PressableScale>
            </Box>
          ) : drafts.length === 0 ? (
            <motion.div
              className="flex flex-col items-center justify-center p-12"
              variants={fadeInUp}
              initial="initial"
              animate="animate"
            >
              <Text variant="heading-md" muted>No drafts</Text>
              <Text variant="body-sm" muted className="mt-2">
                Start composing an email and save it as a draft
              </Text>
              <PressableScale as="button" tapScale={0.95} className="mt-4">
                <Button variant="primary" size="md" onClick={() => router.push("/compose")}>
                  Compose
                </Button>
              </PressableScale>
            </motion.div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15 }}
              >
                {drafts.map((draft) => (
                  <motion.div
                    key={draft.id}
                    className="flex items-center px-4 py-3 border-b border-border hover:bg-surface-secondary transition-colors cursor-pointer group"
                    whileHover={{ x: 2 }}
                    onClick={() => handleOpenDraft(draft)}
                  >
                    <Box className="flex-1 min-w-0">
                      <Box className="flex items-center gap-2 mb-0.5">
                        <Text variant="body-sm" className="font-medium text-content truncate">
                          {draft.to}
                        </Text>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">
                          Draft
                        </span>
                      </Box>
                      <Text variant="body-sm" className="text-content truncate">
                        {draft.subject}
                      </Text>
                      <Text variant="caption" muted className="truncate mt-0.5">
                        {draft.preview}
                      </Text>
                    </Box>
                    <Box className="flex items-center gap-3 flex-shrink-0 ml-4">
                      <Text variant="caption" muted>
                        {formatTimestamp(draft.updatedAt)}
                      </Text>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void handleDelete(draft.id); }}
                        className="opacity-0 group-hover:opacity-100 text-content-tertiary hover:text-red-600 transition-all p-1"
                        aria-label="Delete draft"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </Box>
                  </motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </Box>
      </Box>
    </PageLayout>
  );
}
