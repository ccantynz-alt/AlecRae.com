"use client";

/**
 * ActionItemExtractor — Container component for S8 (Thread → Action Items).
 *
 * Wraps the ActionItemList UI composite with API calls:
 *   1. Extracts action items from a thread via POST /v1/emails/:threadId/extract-tasks
 *   2. Shows extracted items with checkboxes
 *   3. Lets user pick a provider (builtin, Todoist, Linear, Notion, etc.)
 *   4. Creates tasks via POST /v1/tasks/create-batch
 *
 * Usage:
 *   <ActionItemExtractor
 *     threadId="thread_abc123"
 *     emails={[{ emailId: "...", from: "...", subject: "...", body: "..." }]}
 *   />
 */

import type { ReactElement } from "react";
import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ActionItemList,
  type ExtractedActionItem,
  type TaskProvider,
  type ExtractionState,
  type CreateState,
} from "@alecrae/ui";
import {
  taskApi,
  type ExtractedTaskData,
  type TaskProviderData,
} from "../lib/api";
import {
  fadeInUp,
  SPRING_BOUNCY,
  useAlecRaeReducedMotion,
  withReducedMotion,
} from "../lib/animations";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface ThreadEmail {
  emailId: string;
  from: string;
  subject: string;
  body: string;
  receivedAt?: string;
}

export interface ActionItemExtractorProps {
  /** Thread ID to extract action items from. */
  threadId: string;
  /** Emails in the thread. */
  emails: readonly ThreadEmail[];
  /** Auto-extract when mounted (default: false). */
  autoExtract?: boolean;
  /** Called when tasks are created. */
  onTasksCreated?: (count: number) => void;
  /** Extra Tailwind classes. */
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ActionItemExtractor({
  threadId,
  emails,
  autoExtract = false,
  onTasksCreated,
  className,
}: ActionItemExtractorProps): ReactElement {
  const [extractionState, setExtractionState] = useState<ExtractionState>("idle");
  const [createState, setCreateState] = useState<CreateState>("idle");
  const [items, setItems] = useState<readonly ExtractedActionItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [providers, setProviders] = useState<readonly TaskProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("builtin");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [createdCount, setCreatedCount] = useState<number>(0);
  const reduced = useAlecRaeReducedMotion();
  const hasExtracted = useRef(false);

  // Fetch providers on mount
  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        const res = await taskApi.listProviders();
        const mapped: TaskProvider[] = res.data.map((p: TaskProviderData) => ({
          name: p.name,
          displayName: p.displayName,
          connected: p.connected,
          isDefault: p.isDefault,
        }));
        setProviders(mapped);
        const defaultProvider = mapped.find((p) => p.isDefault);
        if (defaultProvider !== undefined) {
          setSelectedProvider(defaultProvider.name);
        }
      } catch {
        // Fallback: just show builtin
        setProviders([{
          name: "builtin",
          displayName: "AlecRae Tasks",
          connected: true,
          isDefault: true,
        }]);
      }
    })();
  }, []);

  // Auto-extract if requested
  useEffect(() => {
    if (autoExtract && !hasExtracted.current && emails.length > 0) {
      hasExtracted.current = true;
      void handleExtract();
    }
  }, [autoExtract, emails]);

  const handleExtract = useCallback(async (): Promise<void> => {
    setExtractionState("extracting");
    setErrorMessage("");
    setItems([]);
    setSelectedItems(new Set());
    setCreateState("idle");
    setCreatedCount(0);

    try {
      const res = await taskApi.extractFromThread(threadId, emails);
      const extracted: ExtractedActionItem[] = res.data.tasks.map(
        (t: ExtractedTaskData) => ({
          title: t.title,
          description: t.description,
          dueDate: t.dueDate ?? null,
          assignee: t.assignee ?? null,
          priority: t.priority,
          confidence: t.confidence,
          sourceEmailId: t.sourceEmailId,
        }),
      );
      setItems(extracted);
      // Pre-select high-confidence items
      const preSelected = new Set<number>();
      extracted.forEach((item, idx) => {
        if (item.confidence >= 0.6) preSelected.add(idx);
      });
      setSelectedItems(preSelected);
      setExtractionState("extracted");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Extraction failed");
      setExtractionState("error");
    }
  }, [threadId, emails]);

  const handleToggleItem = useCallback((index: number): void => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleProviderChange = useCallback((name: string): void => {
    setSelectedProvider(name);
  }, []);

  const handleCreateTasks = useCallback(async (): Promise<void> => {
    if (selectedItems.size === 0) return;

    setCreateState("creating");

    const selectedTasks = Array.from(selectedItems)
      .sort()
      .map((idx) => items[idx])
      .filter((item): item is ExtractedActionItem => item !== undefined);

    try {
      const lastEmail = emails[emails.length - 1];
      const batchPayload = selectedTasks.map((task) => {
        const entry: {
          title: string;
          description?: string;
          dueDate?: string;
          assignee?: string;
          priority?: "low" | "normal" | "high" | "urgent";
          confidence?: number;
          source?: {
            threadId: string;
            emailId: string;
            emailSubject: string;
            emailFrom: string;
          };
        } = {
          title: task.title,
          priority: task.priority,
          confidence: task.confidence,
        };
        if (task.description.length > 0) entry.description = task.description;
        if (task.dueDate !== null) entry.dueDate = task.dueDate;
        if (task.assignee !== null) entry.assignee = task.assignee;
        if (lastEmail !== undefined) {
          entry.source = {
            threadId,
            emailId: task.sourceEmailId,
            emailSubject: lastEmail.subject,
            emailFrom: lastEmail.from,
          };
        }
        return entry;
      });
      const res = await taskApi.createBatch(selectedProvider, batchPayload);

      setCreatedCount(res.data.succeeded);
      setCreateState(res.data.failed > 0 ? "error" : "created");
      if (res.data.succeeded > 0 && onTasksCreated !== undefined) {
        onTasksCreated(res.data.succeeded);
      }
    } catch {
      setCreateState("error");
    }
  }, [selectedItems, items, selectedProvider, threadId, emails, onTasksCreated]);

  const animVariants = withReducedMotion(fadeInUp, reduced);

  return (
    <AnimatePresence>
      <motion.div
        variants={animVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={SPRING_BOUNCY}
        className={className}
      >
        <ActionItemList
          state={extractionState}
          items={items}
          providers={providers}
          selectedProvider={selectedProvider}
          errorMessage={errorMessage}
          createState={createState}
          createdCount={createdCount}
          onProviderChange={handleProviderChange}
          onToggleItem={handleToggleItem}
          selectedItems={selectedItems}
          onCreateTasks={handleCreateTasks}
          onExtract={handleExtract}
        />
      </motion.div>
    </AnimatePresence>
  );
}
