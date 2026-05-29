"use client";

import { useState, useEffect, useCallback } from "react";
import { Box, Text, Button, PageLayout } from "@alecrae/ui";
import { AnimatePresence, motion } from "motion/react";
import { snoozeApi } from "../../../lib/api";
import { PressableScale } from "../../../components/PressableScale";
import {
  fadeInUp,
  SPRING_BOUNCY,
  useAlecRaeReducedMotion,
} from "../../../lib/animations";

interface SnoozedItem {
  id: string;
  emailId: string;
  subject: string;
  snoozedUntil: string;
}

function formatSnoozeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs < 0) return "Overdue";
  if (diffHours < 1) return "Less than 1 hour";
  if (diffHours < 24) return `In ${diffHours} hour${diffHours === 1 ? "" : "s"}`;
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function SnoozedPage(): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const [items, setItems] = useState<SnoozedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSnoozed = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await snoozeApi.list();
      setItems(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load snoozed emails");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnoozed();
  }, [fetchSnoozed]);

  const handleUnsnooze = async (emailId: string): Promise<void> => {
    setItems((prev) => prev.filter((i) => i.emailId !== emailId));
    try {
      await snoozeApi.unsnooze(emailId);
    } catch {
      fetchSnoozed();
    }
  };

  return (
    <PageLayout title="Snoozed" fullWidth>
      <Box className="w-full max-w-3xl mx-auto">
        <Box className="px-4 py-2 border-b border-border bg-surface-secondary">
          <Text variant="body-sm" muted>
            {loading ? "Loading..." : `${items.length} snoozed email${items.length === 1 ? "" : "s"}`}
          </Text>
        </Box>

        {loading ? (
          <Box className="p-8 text-center">
            <Text variant="body-sm" muted>Loading snoozed emails...</Text>
          </Box>
        ) : error ? (
          <Box className="p-6 text-center">
            <Text variant="body-sm" muted>{error}</Text>
            <PressableScale as="button" tapScale={0.95} className="mt-3">
              <Button variant="secondary" size="sm" onClick={fetchSnoozed}>Retry</Button>
            </PressableScale>
          </Box>
        ) : items.length === 0 ? (
          <motion.div
            className="flex flex-col items-center justify-center p-12"
            variants={fadeInUp}
            initial="initial"
            animate="animate"
          >
            <Text variant="heading-md" muted>No snoozed emails</Text>
            <Text variant="body-sm" muted className="mt-2">
              Snooze emails from your inbox to see them here. Press S on any email to snooze.
            </Text>
          </motion.div>
        ) : (
          <AnimatePresence>
            {items.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={SPRING_BOUNCY}
                className="flex items-center px-4 py-4 border-b border-border hover:bg-surface-secondary transition-colors"
              >
                <Box className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center flex-shrink-0 mr-4">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-500" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Box>
                <Box className="flex-1 min-w-0">
                  <Text variant="body-sm" className="font-medium text-content truncate">
                    {item.subject}
                  </Text>
                  <Text variant="caption" className="text-brand-600 font-medium mt-0.5">
                    {formatSnoozeTime(item.snoozedUntil)}
                  </Text>
                </Box>
                <button
                  type="button"
                  onClick={() => void handleUnsnooze(item.emailId)}
                  className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors"
                  aria-label="Unsnooze email"
                >
                  Unsnooze
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </Box>
    </PageLayout>
  );
}
