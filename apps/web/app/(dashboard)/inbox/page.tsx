"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createDefaultShortcuts, registerShortcuts } from "../../../lib/keyboard-shortcuts";
import {
  Box,
  Text,
  Button,
  Input,
  PageLayout,
  EmailList,
  EmailViewer,
  type EmailListItem,
  type EmailMessage,
} from "@alecrae/ui";
import { AnimatePresence, motion } from "motion/react";
import { messagesApi, snoozeApi, authApi, type Message, type MessageDetail } from "../../../lib/api";
import { NewsletterSummaryPreview } from "../../../components/NewsletterSummaryPreview";
import { EmailExplainerPanel } from "../../../components/EmailExplainerPanel";
import { QuickReply } from "../../../components/QuickReply";
import { UndoToastManager, type UndoAction } from "../../../components/UndoToast";
import { BatchActionBar } from "../../../components/BatchActionBar";
import { SnoozePicker } from "../../../components/SnoozePicker";
import { SyncStatusBar } from "../../../components/SyncStatusBar";
import { EmailListSkeleton } from "../../../components/AnimatedSkeleton";
import { PressableScale } from "../../../components/PressableScale";
import { useSyncEngine } from "../../../lib/sync-engine";
import { getCachedEmails, cacheEmails, type CachedEmail } from "../../../lib/offline-store";
import {
  fadeInUp,
  threadExpand,
  SPRING_BOUNCY,
  useAlecRaeReducedMotion,
} from "../../../lib/animations";

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

// ─── Newsletter detection signals ───────────────────────────────────────────

const NEWSLETTER_SIGNALS = [
  "unsubscribe",
  "list-unsubscribe",
  "view in browser",
  "view online",
  "email preferences",
  "mailing list",
  "newsletter",
  "weekly digest",
  "daily digest",
];

function isLikelyNewsletter(msg: Message): boolean {
  const text = `${msg.subject} ${msg.preview}`.toLowerCase();
  return NEWSLETTER_SIGNALS.some((signal) => text.includes(signal));
}

function toEmailListItem(msg: Message): EmailListItem {
  return {
    id: msg.id,
    sender: {
      name: msg.from.name ?? msg.from.email,
      email: msg.from.email,
    },
    subject: msg.subject || "(no subject)",
    preview: msg.preview || "",
    timestamp: formatTimestamp(msg.createdAt),
    read: msg.status === "delivered" || msg.status === "sent",
    starred: false,
    priority: "normal" as const,
    hasAttachments: msg.hasAttachments,
  };
}

function textToBodyParts(text: string): EmailMessage["bodyParts"] {
  return text
    .split(/\n\n+/)
    .filter(Boolean)
    .map((para) => ({ type: "paragraph" as const, content: para }));
}

function htmlToBodyParts(html: string): EmailMessage["bodyParts"] {
  // Simple HTML-to-structured conversion: strip tags for paragraph display
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
  return textToBodyParts(text);
}

function toEmailMessage(detail: MessageDetail): EmailMessage {
  const bodyParts = detail.textBody
    ? textToBodyParts(detail.textBody)
    : detail.htmlBody
      ? htmlToBodyParts(detail.htmlBody)
      : [{ type: "paragraph" as const, content: "(no content)" }];

  return {
    id: detail.id,
    sender: {
      name: detail.from.name ?? detail.from.email,
      email: detail.from.email,
    },
    recipients: (detail.to ?? []).map((r) => ({
      name: r.name ?? r.email,
      email: r.email,
    })),
    cc: (detail.cc ?? []).map((r) => ({
      name: r.name ?? r.email,
      email: r.email,
    })),
    subject: detail.subject || "(no subject)",
    timestamp: new Date(detail.createdAt).toLocaleString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    bodyParts,
    attachments: [],
  };
}

export default function InboxPage(): React.ReactNode {
  const router = useRouter();
  const reduced = useAlecRaeReducedMotion();
  const [emailItems, setEmailItems] = useState<EmailListItem[]>([]);
  const [selectedEmailId, setSelectedEmailId] = useState<string | undefined>();
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread" | "starred">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // S6: Newsletter detection map (emailId -> isNewsletter)
  const [newsletterMap, setNewsletterMap] = useState<Map<string, boolean>>(new Map());
  // S7: Email explainer panel
  const [explainerOpen, setExplainerOpen] = useState(false);
  // Whether to show full email content (toggled from newsletter summary)
  const [showFullEmail, setShowFullEmail] = useState(true);
  const [quickReplyOpen, setQuickReplyOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [undoActions, setUndoActions] = useState<UndoAction[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [snoozePickerOpen, setSnoozePickerOpen] = useState(false);
  const snoozeTargetRef = useRef<string | null>(null);

  const sync = useSyncEngine();

  const filteredEmails = useMemo(() => emailItems.filter((e) => {
    if (filter === "unread") return !e.read;
    if (filter === "starred") return e.starred;
    return true;
  }), [emailItems, filter]);

  const handleStar = useCallback((email: EmailListItem) => {
    const newStarred = !email.starred;
    setEmailItems((prev) =>
      prev.map((e) => (e.id === email.id ? { ...e, starred: newStarred } : e)),
    );
    messagesApi.star(email.id, newStarred).catch(() => {
      setEmailItems((prev) =>
        prev.map((e) => (e.id === email.id ? { ...e, starred: !newStarred } : e)),
      );
    });
  }, []);

  const addUndoAction = useCallback((id: string, label: string, onUndo: () => void) => {
    setUndoActions((prev) => [...prev, { id, label, onUndo, duration: 5000 }]);
  }, []);

  const removeUndoAction = useCallback((id: string) => {
    setUndoActions((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const archiveWithUndo = useCallback((id: string) => {
    const item = emailItems.find((e) => e.id === id);
    if (!item) return;
    setEmailItems((prev) => prev.filter((e) => e.id !== id));
    if (selectedEmailId === id) {
      setSelectedEmailId(undefined);
      setSelectedEmail(null);
    }
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    const undoId = `archive-${id}-${Date.now()}`;
    addUndoAction(undoId, "Conversation archived", () => {
      setEmailItems((prev) => {
        if (prev.some((e) => e.id === item.id)) return prev;
        return [...prev, item].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      });
    });
    messagesApi.archive(id).catch(() => {});
  }, [emailItems, selectedEmailId, addUndoAction]);

  const deleteWithUndo = useCallback((id: string) => {
    const item = emailItems.find((e) => e.id === id);
    if (!item) return;
    setEmailItems((prev) => prev.filter((e) => e.id !== id));
    if (selectedEmailId === id) {
      setSelectedEmailId(undefined);
      setSelectedEmail(null);
    }
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    const undoId = `delete-${id}-${Date.now()}`;
    addUndoAction(undoId, "Conversation deleted", () => {
      setEmailItems((prev) => {
        if (prev.some((e) => e.id === item.id)) return prev;
        return [...prev, item].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      });
    });
    messagesApi.delete(id).catch(() => {});
  }, [emailItems, selectedEmailId, addUndoAction]);

  const snoozeWithUndo = useCallback((id: string, until: Date) => {
    const item = emailItems.find((e) => e.id === id);
    if (!item) return;
    setEmailItems((prev) => prev.filter((e) => e.id !== id));
    if (selectedEmailId === id) {
      setSelectedEmailId(undefined);
      setSelectedEmail(null);
    }
    const formatted = until.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const undoId = `snooze-${id}-${Date.now()}`;
    addUndoAction(undoId, `Snoozed until ${formatted}`, () => {
      setEmailItems((prev) => {
        if (prev.some((e) => e.id === item.id)) return prev;
        return [...prev, item].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      });
      snoozeApi.unsnooze(id).catch(() => {});
    });
    snoozeApi.snooze(id, until.toISOString()).catch(() => {});
  }, [emailItems, selectedEmailId, addUndoAction]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const batchArchive = useCallback(() => {
    const ids = Array.from(selectedIds);
    const items = emailItems.filter((e) => selectedIds.has(e.id));
    setEmailItems((prev) => prev.filter((e) => !selectedIds.has(e.id)));
    if (selectedEmailId && selectedIds.has(selectedEmailId)) {
      setSelectedEmailId(undefined);
      setSelectedEmail(null);
    }
    setSelectedIds(new Set());
    const undoId = `batch-archive-${Date.now()}`;
    addUndoAction(undoId, `${ids.length} conversations archived`, () => {
      setEmailItems((prev) => {
        const existing = new Set(prev.map((e) => e.id));
        const restored = items.filter((i) => !existing.has(i.id));
        return [...prev, ...restored].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      });
    });
    for (const id of ids) messagesApi.archive(id).catch(() => {});
  }, [selectedIds, emailItems, selectedEmailId, addUndoAction]);

  const batchDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    const items = emailItems.filter((e) => selectedIds.has(e.id));
    setEmailItems((prev) => prev.filter((e) => !selectedIds.has(e.id)));
    if (selectedEmailId && selectedIds.has(selectedEmailId)) {
      setSelectedEmailId(undefined);
      setSelectedEmail(null);
    }
    setSelectedIds(new Set());
    const undoId = `batch-delete-${Date.now()}`;
    addUndoAction(undoId, `${ids.length} conversations deleted`, () => {
      setEmailItems((prev) => {
        const existing = new Set(prev.map((e) => e.id));
        const restored = items.filter((i) => !existing.has(i.id));
        return [...prev, ...restored].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      });
    });
    for (const id of ids) messagesApi.delete(id).catch(() => {});
  }, [selectedIds, emailItems, selectedEmailId, addUndoAction]);

  const batchMarkRead = useCallback(() => {
    setEmailItems((prev) => prev.map((e) => selectedIds.has(e.id) ? { ...e, read: true } : e));
    setSelectedIds(new Set());
  }, [selectedIds]);

  const batchMarkUnread = useCallback(() => {
    setEmailItems((prev) => prev.map((e) => selectedIds.has(e.id) ? { ...e, read: false } : e));
    setSelectedIds(new Set());
  }, [selectedIds]);

  const batchStar = useCallback(() => {
    const ids = Array.from(selectedIds);
    setEmailItems((prev) => prev.map((e) => selectedIds.has(e.id) ? { ...e, starred: true } : e));
    setSelectedIds(new Set());
    for (const id of ids) messagesApi.star(id, true).catch(() => {});
  }, [selectedIds]);

  const selectedIndexRef = useRef(0);

  useEffect(() => {
    const idx = filteredEmails.findIndex((e) => e.id === selectedEmailId);
    if (idx >= 0) selectedIndexRef.current = idx;
  }, [selectedEmailId, filteredEmails]);

  useEffect(() => {
    const shortcuts = createDefaultShortcuts({
      openCommandPalette: () => {},
      compose: () => router.push("/compose"),
      search: () => {
        const input = document.querySelector<HTMLInputElement>('input[type="search"], input[placeholder*="Search"]');
        input?.focus();
      },
      goToInbox: () => router.push("/inbox"),
      goToSent: () => {},
      goToDrafts: () => {},
      goToSettings: () => router.push("/settings"),
      nextEmail: () => {
        const next = Math.min(selectedIndexRef.current + 1, filteredEmails.length - 1);
        const item = filteredEmails[next];
        if (item) { setSelectedEmailId(item.id); selectedIndexRef.current = next; }
      },
      prevEmail: () => {
        const prev = Math.max(selectedIndexRef.current - 1, 0);
        const item = filteredEmails[prev];
        if (item) { setSelectedEmailId(item.id); selectedIndexRef.current = prev; }
      },
      openEmail: () => {},
      archiveEmail: () => {
        if (selectedEmailId) {
          const next = filteredEmails[selectedIndexRef.current + 1] ?? filteredEmails[selectedIndexRef.current - 1];
          archiveWithUndo(selectedEmailId);
          setSelectedEmailId(next?.id);
        }
      },
      deleteEmail: () => {
        if (selectedEmailId) {
          const next = filteredEmails[selectedIndexRef.current + 1] ?? filteredEmails[selectedIndexRef.current - 1];
          deleteWithUndo(selectedEmailId);
          setSelectedEmailId(next?.id);
        }
      },
      starEmail: () => {
        if (selectedEmailId) {
          const item = emailItems.find((e) => e.id === selectedEmailId);
          if (item) handleStar(item);
        }
      },
      markRead: () => {
        if (selectedEmailId) {
          setEmailItems((prev) => prev.map((e) => e.id === selectedEmailId ? { ...e, read: true } : e));
        }
      },
      markUnread: () => {
        if (selectedEmailId) {
          setEmailItems((prev) => prev.map((e) => e.id === selectedEmailId ? { ...e, read: false } : e));
        }
      },
      replyEmail: () => {
        if (selectedEmail) {
          const params = new URLSearchParams({ mode: "reply", to: selectedEmail.sender.email, subject: selectedEmail.subject, body: selectedEmail.bodyParts.map((p) => "content" in p ? p.content : "").join("\n\n") });
          router.push(`/compose?${params.toString()}`);
        }
      },
      replyAllEmail: () => {
        if (selectedEmail) {
          const params = new URLSearchParams({ mode: "replyAll", to: selectedEmail.sender.email, cc: (selectedEmail.recipients ?? []).map((r) => r.email).join(","), subject: selectedEmail.subject, body: selectedEmail.bodyParts.map((p) => "content" in p ? p.content : "").join("\n\n") });
          router.push(`/compose?${params.toString()}`);
        }
      },
      forwardEmail: () => {
        if (selectedEmail) {
          const params = new URLSearchParams({ mode: "forward", subject: selectedEmail.subject, body: selectedEmail.bodyParts.map((p) => "content" in p ? p.content : "").join("\n\n") });
          router.push(`/compose?${params.toString()}`);
        }
      },
      snoozeEmail: () => {
        if (selectedEmailId) {
          snoozeTargetRef.current = selectedEmailId;
          setSnoozePickerOpen(true);
        }
      },
      undoAction: () => {
        const last = undoActions[undoActions.length - 1];
        if (last) {
          last.onUndo();
          removeUndoAction(last.id);
        }
      },
      aiCompose: () => router.push("/compose"),
      aiReply: () => {},
      aiSummarize: () => {},
      toggleDarkMode: () => {},
      toggleFocusMode: () => {},
    });

    return registerShortcuts(shortcuts, () =>
      selectedEmail ? "thread" : "inbox",
    );
  }, [router, selectedEmailId, selectedEmail, emailItems, filteredEmails, handleStar, archiveWithUndo, deleteWithUndo, undoActions, removeUndoAction]);

  const fetchEmails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Cache-first: try IndexedDB for instant load
      try {
        const cached = await getCachedEmails({ limit: 50, filter: "all" });
        if (cached.length > 0) {
          const cachedItems: EmailListItem[] = cached.map((c) => ({
            id: c.id,
            sender: { name: c.from.name ?? c.from.email, email: c.from.email },
            subject: c.subject || "(no subject)",
            preview: c.preview || "",
            timestamp: formatTimestamp(c.createdAt),
            read: c.read,
            starred: c.starred,
            priority: "normal" as const,
            hasAttachments: c.hasAttachments,
          }));
          setEmailItems(cachedItems);
          if (cachedItems.length > 0 && !selectedEmailId) {
            setSelectedEmailId(cachedItems[0]!.id);
          }
          setLoading(false);
        }
      } catch {
        // Cache miss — proceed to network
      }

      // Network: fetch fresh data and update cache
      const res = await messagesApi.list({ limit: 50 });
      const items = res.data.map(toEmailListItem);
      const nlMap = new Map<string, boolean>();
      for (const msg of res.data) {
        nlMap.set(msg.id, isLikelyNewsletter(msg));
      }
      setNewsletterMap(nlMap);
      setEmailItems(items);
      const first = items[0];
      if (first && !selectedEmailId) {
        setSelectedEmailId(first.id);
      }

      // Update cache in background
      const toCache: CachedEmail[] = res.data.map((msg) => ({
        id: msg.id,
        messageId: msg.messageId,
        from: msg.from,
        to: msg.to,
        cc: msg.cc,
        subject: msg.subject,
        preview: msg.preview,
        status: msg.status,
        tags: msg.tags,
        hasAttachments: msg.hasAttachments,
        starred: msg.tags.includes("starred"),
        read: msg.status === "delivered" || msg.status === "sent",
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
        sentAt: msg.sentAt,
        cachedAt: Date.now(),
      }));
      cacheEmails(toCache).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load emails");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDetail = useCallback(async (id: string) => {
    try {
      setDetailLoading(true);
      const res = await messagesApi.get(id);
      setSelectedEmail(toEmailMessage(res.data));
    } catch {
      setSelectedEmail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmails();
    authApi.me().then((res) => setUserEmail(res.data.email)).catch(() => {});
  }, [fetchEmails]);

  useEffect(() => {
    if (selectedEmailId) {
      fetchDetail(selectedEmailId);
      setQuickReplyOpen(false);
    }
  }, [selectedEmailId, fetchDetail]);

  const handleSelect = (email: EmailListItem) => {
    setSelectedEmailId(email.id);
    setEmailItems((prev) =>
      prev.map((e) => (e.id === email.id ? { ...e, read: true } : e)),
    );
  };

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);

      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }

      if (!query.trim()) {
        // Clear search — reload the full list
        setSearching(false);
        fetchEmails();
        return;
      }

      searchTimerRef.current = setTimeout(async () => {
        try {
          setSearching(true);
          const res = await messagesApi.search({ q: query, limit: 50 });
          const items: EmailListItem[] = res.data.map((hit) => ({
            id: hit.id,
            sender: {
              name: hit.from.name ?? hit.from.email,
              email: hit.from.email,
            },
            subject: hit.subject || "(no subject)",
            preview: hit.snippet || "",
            timestamp: formatTimestamp(hit.createdAt),
            read: true,
            starred: false,
            priority: "normal" as const,
            hasAttachments: false,
          }));
          setEmailItems(items);
        } catch (err) {
          console.error("Search failed:", err);
        } finally {
          setSearching(false);
        }
      }, 300);
    },
    [fetchEmails],
  );

  const searchHeader = (
    <Box className="flex items-center gap-4 w-full">
      <Input
        variant="search"
        placeholder="Search emails..."
        inputSize="sm"
        className="max-w-md"
        value={searchQuery}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          handleSearch(e.target.value)
        }
      />
      <Box className="flex items-center gap-2 ml-auto">
        {(["all", "unread", "starred"] as const).map((f) => (
          <PressableScale key={f} as="button" type="button" tapScale={0.95} hoverScale={1.03} onClick={() => setFilter(f)}>
            <Button
              variant={filter === f ? "secondary" : "ghost"}
              size="sm"
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          </PressableScale>
        ))}
      </Box>
    </Box>
  );

  if (loading) {
    return (
      <PageLayout header={searchHeader} fullWidth>
        <Box className="flex flex-1 h-full">
          <Box className="w-96 border-r border-border overflow-y-auto flex-shrink-0">
            <Box className="px-4 py-2 border-b border-border bg-surface-secondary">
              <Text variant="body-sm" muted>Loading...</Text>
            </Box>
            <EmailListSkeleton count={10} />
          </Box>
          <Box className="flex-1 flex items-center justify-center">
            <Text variant="body-md" muted>Select an email to read</Text>
          </Box>
        </Box>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout header={searchHeader} fullWidth>
        <Box className="flex flex-col items-center justify-center h-full gap-4">
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={SPRING_BOUNCY}
          >
            <Text variant="body-md" muted>{error}</Text>
          </motion.div>
          <PressableScale as="button" tapScale={0.95}>
            <Button variant="secondary" size="sm" onClick={fetchEmails}>
              Retry
            </Button>
          </PressableScale>
        </Box>
      </PageLayout>
    );
  }

  return (
    <PageLayout header={searchHeader} fullWidth>
      <SyncStatusBar
        isOnline={sync.isOnline}
        isSyncing={sync.isSyncing}
        pendingOutbox={sync.pendingOutbox}
        lastSyncAt={sync.lastSyncAt}
        error={sync.error}
        onSyncNow={() => void sync.syncNow()}
      />
      <Box className="flex flex-1 h-full">
        <Box className="w-96 border-r border-border overflow-y-auto flex-shrink-0">
          <AnimatePresence>
            {selectedIds.size > 0 && (
              <BatchActionBar
                selectedCount={selectedIds.size}
                totalCount={filteredEmails.length}
                onSelectAll={() => setSelectedIds(new Set(filteredEmails.map((e) => e.id)))}
                onDeselectAll={() => setSelectedIds(new Set())}
                onArchive={batchArchive}
                onDelete={batchDelete}
                onMarkRead={batchMarkRead}
                onMarkUnread={batchMarkUnread}
                onStar={batchStar}
              />
            )}
          </AnimatePresence>
          <Box className="px-4 py-2 border-b border-border bg-surface-secondary flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedIds.size > 0 && selectedIds.size === filteredEmails.length}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedIds(new Set(filteredEmails.map((em) => em.id)));
                } else {
                  setSelectedIds(new Set());
                }
              }}
              className="w-3.5 h-3.5 rounded border-border text-brand-600 focus:ring-brand-500"
              aria-label="Select all emails"
            />
            <Text variant="body-sm" muted>
              {searching
                ? "Searching..."
                : searchQuery.trim()
                  ? `${filteredEmails.length} results for "${searchQuery}"`
                  : `${filteredEmails.filter((e) => !e.read).length} unread of ${filteredEmails.length} emails`}
            </Text>
          </Box>
          <AnimatePresence mode="wait">
            {filteredEmails.length === 0 ? (
              <motion.div
                key="empty"
                className="flex items-center justify-center p-8"
                variants={fadeInUp}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <Text variant="body-sm" muted>
                  {filter === "all" ? "No emails yet" : `No ${filter} emails`}
                </Text>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <EmailList
                  emails={filteredEmails}
                  {...(selectedEmailId !== undefined ? { selectedId: selectedEmailId } : {})}
                  onSelect={handleSelect}
                  onStar={handleStar}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </Box>
        <Box className="flex-1 min-w-0 flex flex-col">
          <AnimatePresence mode="wait">
            {detailLoading ? (
              <motion.div
                key="detail-loading"
                className="flex items-center justify-center h-full"
                variants={fadeInUp}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <Text variant="body-md" muted>Loading...</Text>
              </motion.div>
            ) : (
              <motion.div
                key={selectedEmail?.id ?? "no-email"}
                className="flex flex-col flex-1 min-w-0"
                variants={threadExpand}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {/* S6: Newsletter Summary Preview (shown above email viewer for newsletter emails) */}
                {selectedEmailId && (newsletterMap.get(selectedEmailId) ?? false) && (
                  <NewsletterSummaryPreview
                    emailId={selectedEmailId}
                    isNewsletter={true}
                    onShowFullEmail={() => { /* render full email below regardless */ }}
                    className="px-4 pt-4"
                  />
                )}

                {/* S7: "Why is this in my inbox?" button */}
                {selectedEmailId && selectedEmail && (
                  <Box className="px-4 pt-2 flex items-center gap-2">
                    <PressableScale as="button" tapScale={0.95}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExplainerOpen(true)}
                        aria-label="Find out why this email is in your inbox"
                      >
                        Why is this in my inbox?
                      </Button>
                    </PressableScale>
                  </Box>
                )}

                <Box className="flex-1 min-w-0">
                  <EmailViewer
                  email={selectedEmail}
                  onReply={() => {
                if (!selectedEmail) return;
                const params = new URLSearchParams({
                  mode: "reply",
                  to: selectedEmail.sender.email,
                  subject: selectedEmail.subject,
                  body: selectedEmail.bodyParts.map((p) => "content" in p ? p.content : "").join("\n\n"),
                });
                router.push(`/compose?${params.toString()}`);
              }}
              onReplyAll={() => {
                if (!selectedEmail) return;
                const allRecipients = [
                  selectedEmail.sender.email,
                  ...(selectedEmail.recipients ?? []).map((r) => r.email),
                ];
                const params = new URLSearchParams({
                  mode: "replyAll",
                  to: selectedEmail.sender.email,
                  cc: allRecipients.slice(1).join(","),
                  subject: selectedEmail.subject,
                  body: selectedEmail.bodyParts.map((p) => "content" in p ? p.content : "").join("\n\n"),
                });
                router.push(`/compose?${params.toString()}`);
              }}
              onForward={() => {
                if (!selectedEmail) return;
                const params = new URLSearchParams({
                  mode: "forward",
                  subject: selectedEmail.subject,
                  body: selectedEmail.bodyParts.map((p) => "content" in p ? p.content : "").join("\n\n"),
                });
                router.push(`/compose?${params.toString()}`);
              }}
              onArchive={() => {
                if (selectedEmailId) archiveWithUndo(selectedEmailId);
              }}
              onDelete={() => {
                if (selectedEmailId) deleteWithUndo(selectedEmailId);
              }}
            />
                </Box>

                {/* Quick Reply */}
                {selectedEmail && !quickReplyOpen && (
                  <Box className="border-t border-border p-3 bg-surface-secondary">
                    <button
                      type="button"
                      onClick={() => setQuickReplyOpen(true)}
                      className="w-full text-left px-4 py-2.5 rounded-lg border border-border bg-surface text-content-tertiary text-body-sm hover:border-border-strong hover:text-content-secondary transition-all"
                    >
                      Reply to {selectedEmail.sender.name || selectedEmail.sender.email}...
                    </button>
                  </Box>
                )}

                <AnimatePresence>
                  {quickReplyOpen && selectedEmail && userEmail && (
                    <QuickReply
                      emailId={selectedEmailId ?? ""}
                      toEmail={selectedEmail.sender.email}
                      toName={selectedEmail.sender.name}
                      subject={selectedEmail.subject}
                      userEmail={userEmail}
                      onSent={() => {
                        setQuickReplyOpen(false);
                      }}
                      onClose={() => setQuickReplyOpen(false)}
                    />
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* S7: Email Explainer Panel (slide-in from right) */}
          {selectedEmailId && (
            <EmailExplainerPanel
              emailId={selectedEmailId}
              open={explainerOpen}
              onClose={() => setExplainerOpen(false)}
            />
          )}
        </Box>
      </Box>

      {/* Undo toast manager */}
      <UndoToastManager
        actions={undoActions}
        onExpire={removeUndoAction}
        onDismiss={removeUndoAction}
      />

      {/* Snooze picker */}
      <SnoozePicker
        open={snoozePickerOpen}
        onSnooze={(until) => {
          if (snoozeTargetRef.current) {
            snoozeWithUndo(snoozeTargetRef.current, until);
          }
          setSnoozePickerOpen(false);
          snoozeTargetRef.current = null;
        }}
        onClose={() => {
          setSnoozePickerOpen(false);
          snoozeTargetRef.current = null;
        }}
      />
    </PageLayout>
  );
}
