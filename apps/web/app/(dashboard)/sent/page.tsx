"use client";

import { useState, useEffect, useCallback } from "react";
import { Box, Text, Button, PageLayout } from "@alecrae/ui";
import { AnimatePresence, motion } from "motion/react";
import { messagesApi, type Message } from "../../../lib/api";
import { PressableScale } from "../../../components/PressableScale";
import { EmailListSkeleton } from "../../../components/AnimatedSkeleton";
import {
  fadeInUp,
  SPRING_BOUNCY,
  useAlecRaeReducedMotion,
} from "../../../lib/animations";

interface SentEmailItem {
  id: string;
  to: string;
  subject: string;
  preview: string;
  sentAt: string;
  status: string;
  opened: boolean;
  openedAt: string | null;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function StatusBadge({ status }: { status: string }): React.ReactNode {
  const styles: Record<string, string> = {
    delivered: "bg-green-100 text-green-700",
    sent: "bg-blue-100 text-blue-700",
    queued: "bg-yellow-100 text-yellow-700",
    bounced: "bg-red-100 text-red-700",
    failed: "bg-red-100 text-red-700",
    dropped: "bg-gray-100 text-gray-500",
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

function ReadReceiptIndicator({ opened, openedAt }: { opened: boolean; openedAt: string | null }): React.ReactNode {
  if (!opened) {
    return (
      <span className="flex items-center gap-1 text-xs text-content-tertiary" title="Not opened yet">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Not opened
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 text-xs text-green-600 font-medium" title={openedAt ? `Opened ${new Date(openedAt).toLocaleString()}` : "Opened"}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22 4L12 14.01l-3-3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Opened {openedAt ? formatTimestamp(openedAt) : ""}
    </span>
  );
}

export default function SentPage(): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const [emails, setEmails] = useState<SentEmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchSent = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await messagesApi.list({ limit: 50, status: "sent" });
      const items: SentEmailItem[] = res.data.map((msg: Message) => ({
        id: msg.id,
        to: msg.to.map((r) => r.name ?? r.email).join(", "),
        subject: msg.subject || "(no subject)",
        preview: msg.preview || "",
        sentAt: msg.sentAt ?? msg.createdAt,
        status: msg.status,
        opened: msg.tags.includes("opened"),
        openedAt: null,
      }));
      setEmails(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sent emails");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSent();
  }, [fetchSent]);

  const selected = emails.find((e) => e.id === selectedId);

  return (
    <PageLayout title="Sent" fullWidth>
      <Box className="flex flex-1 h-full">
        <Box className="w-96 border-r border-border overflow-y-auto flex-shrink-0">
          <Box className="px-4 py-2 border-b border-border bg-surface-secondary">
            <Text variant="body-sm" muted>
              {loading ? "Loading..." : `${emails.length} sent emails`}
            </Text>
          </Box>

          {loading ? (
            <EmailListSkeleton count={8} />
          ) : error ? (
            <Box className="p-6 text-center">
              <Text variant="body-sm" muted>{error}</Text>
              <PressableScale as="button" tapScale={0.95} className="mt-3">
                <Button variant="secondary" size="sm" onClick={fetchSent}>Retry</Button>
              </PressableScale>
            </Box>
          ) : emails.length === 0 ? (
            <motion.div
              className="flex flex-col items-center justify-center p-8"
              variants={fadeInUp}
              initial="initial"
              animate="animate"
            >
              <Text variant="body-md" muted>No sent emails yet</Text>
              <Text variant="body-sm" muted className="mt-1">
                Compose an email to get started
              </Text>
            </motion.div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15 }}
              >
                {emails.map((email) => (
                  <button
                    key={email.id}
                    type="button"
                    onClick={() => setSelectedId(email.id)}
                    className={`w-full text-left px-4 py-3 border-b border-border transition-colors ${
                      selectedId === email.id
                        ? "bg-brand-50 border-l-2 border-l-brand-500"
                        : "hover:bg-surface-secondary"
                    }`}
                  >
                    <Box className="flex items-center justify-between mb-1">
                      <Text variant="body-sm" className="font-medium text-content truncate flex-1 mr-2">
                        {email.to}
                      </Text>
                      <Text variant="caption" muted className="flex-shrink-0">
                        {formatTimestamp(email.sentAt)}
                      </Text>
                    </Box>
                    <Text variant="body-sm" className="text-content truncate">
                      {email.subject}
                    </Text>
                    <Box className="flex items-center gap-2 mt-1.5">
                      <StatusBadge status={email.status} />
                      <ReadReceiptIndicator opened={email.opened} openedAt={email.openedAt} />
                    </Box>
                  </button>
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </Box>

        <Box className="flex-1 flex items-center justify-center min-w-0">
          <AnimatePresence mode="wait">
            {selected ? (
              <motion.div
                key={selected.id}
                className="w-full max-w-2xl p-8"
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={SPRING_BOUNCY}
              >
                <Box className="mb-6">
                  <Text variant="heading-lg" className="text-content mb-2">
                    {selected.subject}
                  </Text>
                  <Box className="flex items-center gap-3 mb-4">
                    <Text variant="body-sm" muted>To: {selected.to}</Text>
                    <StatusBadge status={selected.status} />
                  </Box>
                  <Box className="flex items-center gap-4 p-4 rounded-lg bg-surface-secondary border border-border">
                    <ReadReceiptIndicator opened={selected.opened} openedAt={selected.openedAt} />
                    <Text variant="caption" muted>
                      Sent {new Date(selected.sentAt).toLocaleString()}
                    </Text>
                  </Box>
                </Box>
                <Box className="prose prose-sm max-w-none">
                  <Text variant="body-md" className="text-content-secondary whitespace-pre-wrap">
                    {selected.preview}
                  </Text>
                </Box>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                variants={fadeInUp}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <Text variant="body-md" muted>Select a sent email to view details</Text>
              </motion.div>
            )}
          </AnimatePresence>
        </Box>
      </Box>
    </PageLayout>
  );
}
