"use client";

/**
 * AlecRae — Team Chat
 *
 * Left panel: channel list with create-channel form.
 * Right panel: message thread + send form for the selected channel.
 *
 * API: /v1/chat/channels  (GET, POST)
 *      /v1/chat/channels/:id (GET)
 *      /v1/chat/channels/:id/messages (GET, POST)
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { Box, Text, Button, Input, PageLayout } from "@alecrae/ui";
import {
  chatApi,
  type ChatChannel,
  type ChatMessage,
  type ChatChannelDetail,
} from "../../../lib/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingSkeleton(): ReactNode {
  return (
    <Box className="space-y-2 p-4" aria-busy="true" aria-label="Loading">
      {[1, 2, 3].map((i) => (
        <Box key={i} className="h-10 animate-pulse rounded bg-surface-secondary" />
      ))}
    </Box>
  );
}
LoadingSkeleton.displayName = "LoadingSkeleton";

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): ReactNode {
  return (
    <Box
      className="mx-4 mb-3 flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2"
      role="alert"
    >
      <Text variant="body-sm" className="text-red-800">
        {message}
      </Text>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Box>
  );
}
ErrorBanner.displayName = "ErrorBanner";

// ─── Channel List Panel ───────────────────────────────────────────────────────

interface ChannelListProps {
  channels: ChatChannel[];
  selectedId: string | null;
  onSelect: (channel: ChatChannel) => void;
  onCreated: (channel: ChatChannel) => void;
}

function ChannelListPanel({
  channels,
  selectedId,
  onSelect,
  onCreated,
}: ChannelListProps): ReactNode {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateErr(null);
    try {
      const createPayload: {
        name: string;
        type: "group";
        memberIds: string[];
        topic?: string;
      } = {
        name: newName.trim(),
        type: "group",
        memberIds: [],
      };
      if (newTopic.trim()) createPayload.topic = newTopic.trim();
      const res = await chatApi.createChannel(createPayload);
      const created: ChatChannel = {
        id: res.data.id,
        type: (res.data.type as ChatChannel["type"]) ?? "group",
        name: res.data.name ?? newName.trim(),
        topic: newTopic.trim() || null,
        createdAt: res.data.createdAt,
        updatedAt: res.data.createdAt,
      };
      onCreated(created);
      setNewName("");
      setNewTopic("");
      setShowCreate(false);
    } catch (err) {
      setCreateErr(errMsg(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Box className="flex flex-col h-full border-r border-border bg-surface-secondary w-64 flex-shrink-0">
      {/* Header */}
      <Box className="flex items-center justify-between px-4 py-3 border-b border-border">
        <Text variant="label" className="font-semibold text-content">
          Channels
        </Text>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCreate((prev) => !prev)}
          aria-label={showCreate ? "Cancel new channel" : "Create new channel"}
          aria-expanded={showCreate}
        >
          {showCreate ? "Cancel" : "+ New"}
        </Button>
      </Box>

      {/* Create channel form */}
      {showCreate && (
        <Box
          as="form"
          className="border-b border-border px-4 py-3 space-y-2"
          onSubmit={(e: FormEvent) => void handleCreate(e)}
          aria-label="Create channel form"
        >
          <Input
            placeholder="Channel name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            aria-label="Channel name"
          />
          <Input
            placeholder="Topic (optional)"
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            aria-label="Channel topic"
          />
          {createErr && (
            <Text variant="caption" className="text-red-600">
              {createErr}
            </Text>
          )}
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={creating || !newName.trim()}
            className="w-full"
          >
            {creating ? "Creating…" : "Create Channel"}
          </Button>
        </Box>
      )}

      {/* Channel list */}
      <Box
        as="ul"
        role="listbox"
        aria-label="Chat channels"
        className="flex-1 overflow-y-auto py-2"
      >
        {channels.length === 0 ? (
          <Box className="px-4 py-6 text-center">
            <Text variant="body-sm" className="text-content-tertiary">
              No channels yet. Create one above.
            </Text>
          </Box>
        ) : (
          channels.map((ch) => {
            const isSelected = ch.id === selectedId;
            return (
              <Box
                key={ch.id}
                as="li"
                role="option"
                aria-selected={isSelected}
                className={[
                  "mx-2 mb-0.5 cursor-pointer rounded-md px-3 py-2 transition-colors",
                  isSelected
                    ? "bg-brand-100 text-brand-700"
                    : "hover:bg-surface-tertiary text-content-secondary hover:text-content",
                ].join(" ")}
                onClick={() => onSelect(ch)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") onSelect(ch);
                }}
                tabIndex={0}
              >
                <Text
                  variant="body-sm"
                  className={`font-medium truncate ${isSelected ? "text-brand-700" : ""}`}
                >
                  # {ch.name ?? "Unnamed"}
                </Text>
                {ch.topic && (
                  <Text variant="caption" className="truncate text-content-tertiary">
                    {ch.topic}
                  </Text>
                )}
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
ChannelListPanel.displayName = "ChannelListPanel";

// ─── Message Item ─────────────────────────────────────────────────────────────

function MessageItem({
  message,
  onDelete,
}: {
  message: ChatMessage;
  onDelete: (id: string) => void;
}): ReactNode {
  const [showActions, setShowActions] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(): Promise<void> {
    if (!confirm("Delete this message?")) return;
    setDeleting(true);
    try {
      await chatApi.deleteMessage(message.id);
      onDelete(message.id);
    } catch {
      // silently keep UI intact on error
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Box
      className="group flex items-start gap-3 px-4 py-2 hover:bg-surface-secondary/50 rounded-md"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      <Box className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center">
        <Text variant="caption" className="text-brand-700 font-semibold text-[10px]">
          {message.senderId.slice(0, 2).toUpperCase()}
        </Text>
      </Box>

      {/* Content */}
      <Box className="flex-1 min-w-0">
        <Box className="flex items-baseline gap-2">
          <Text variant="caption" className="font-semibold text-content">
            {message.senderId.slice(0, 8)}
          </Text>
          <Text variant="caption" className="text-content-tertiary">
            {formatTime(message.createdAt)}
          </Text>
          {message.isEdited && (
            <Text variant="caption" className="text-content-tertiary italic">
              (edited)
            </Text>
          )}
        </Box>
        <Text variant="body-sm" className="text-content break-words whitespace-pre-wrap">
          {message.content}
        </Text>
      </Box>

      {/* Delete action (shown on hover) */}
      {showActions && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleDelete()}
          disabled={deleting}
          aria-label="Delete message"
          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-red-500 hover:text-red-700"
        >
          {deleting ? "…" : "Delete"}
        </Button>
      )}
    </Box>
  );
}
MessageItem.displayName = "MessageItem";

// ─── Message Thread Panel ─────────────────────────────────────────────────────

interface MessageThreadProps {
  channel: ChatChannelDetail | null;
  channelId: string | null;
}

function MessageThreadPanel({ channel, channelId }: MessageThreadProps): ReactNode {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [msgError, setMsgError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadMessages = useCallback(async (): Promise<void> => {
    if (!channelId) return;
    setLoadingMsgs(true);
    setMsgError(null);
    try {
      const res = await chatApi.getMessages(channelId, { limit: 50 });
      setMessages(res.data);
    } catch (err) {
      setMsgError(errMsg(err));
    } finally {
      setLoadingMsgs(false);
    }
  }, [channelId]);

  // Seed from channel's recentMessages on first load, then fetch full list
  useEffect(() => {
    if (channel?.recentMessages) {
      setMessages(channel.recentMessages);
    }
    void loadMessages();
  }, [channel, loadMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!channelId || !draft.trim()) return;
    setSending(true);
    setSendError(null);
    const content = draft.trim();
    setDraft("");
    try {
      const res = await chatApi.sendMessage(channelId, { content });
      setMessages((prev) => [
        ...prev,
        {
          id: res.data.id,
          senderId: "you",
          content: res.data.content,
          replyToId: null,
          isEdited: false,
          createdAt: res.data.createdAt,
        },
      ]);
    } catch (err) {
      setSendError(errMsg(err));
      setDraft(content); // restore draft on failure
    } finally {
      setSending(false);
    }
  }

  function handleDelete(id: string): void {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  if (!channelId) {
    return (
      <Box className="flex-1 flex items-center justify-center">
        <Box className="text-center space-y-2">
          <Text variant="heading-md" className="text-content-tertiary">
            Select a channel
          </Text>
          <Text variant="body-sm" className="text-content-tertiary">
            Choose a channel from the left to start chatting.
          </Text>
        </Box>
      </Box>
    );
  }

  // Group messages by day
  const grouped = messages.reduce<DayGroup[]>((acc, msg) => {
    const day = formatDate(msg.createdAt);
    const last = acc[acc.length - 1];
    if (last && last.date === day) {
      last.messages.push(msg);
    } else {
      acc.push({ date: day, messages: [msg] });
    }
    return acc;
  }, []);

  return (
    <Box className="flex-1 flex flex-col min-h-0">
      {/* Channel header */}
      <Box className="px-5 py-3 border-b border-border flex-shrink-0">
        <Text variant="heading-sm" className="font-semibold text-content">
          # {channel?.name ?? "…"}
        </Text>
        {channel?.topic && (
          <Text variant="caption" className="text-content-secondary">
            {channel.topic}
          </Text>
        )}
      </Box>

      {/* Messages area */}
      <Box
        className="flex-1 overflow-y-auto py-3 space-y-0.5"
        role="log"
        aria-live="polite"
        aria-label="Messages"
      >
        {loadingMsgs && messages.length === 0 && <LoadingSkeleton />}
        {msgError && <ErrorBanner message={msgError} onRetry={() => void loadMessages()} />}

        {grouped.map((group) => (
          <Box key={group.date}>
            {/* Day divider */}
            <Box className="flex items-center gap-3 px-4 py-2">
              <Box className="flex-1 h-px bg-border" />
              <Text variant="caption" className="text-content-tertiary flex-shrink-0">
                {group.date}
              </Text>
              <Box className="flex-1 h-px bg-border" />
            </Box>

            {group.messages.map((msg) => (
              <MessageItem key={msg.id} message={msg} onDelete={handleDelete} />
            ))}
          </Box>
        ))}

        {messages.length === 0 && !loadingMsgs && !msgError && (
          <Box className="px-4 py-8 text-center">
            <Text variant="body-sm" className="text-content-tertiary">
              No messages yet. Send the first one!
            </Text>
          </Box>
        )}

        <Box ref={bottomRef} />
      </Box>

      {/* Send form */}
      <Box className="border-t border-border px-4 py-3 flex-shrink-0">
        {sendError && (
          <Text variant="caption" className="text-red-600 mb-1 block">
            {sendError}
          </Text>
        )}
        <Box
          as="form"
          className="flex items-end gap-2"
          onSubmit={(e: FormEvent) => void handleSend(e)}
          aria-label={`Send message to ${channel?.name ?? "channel"}`}
        >
          <Input
            placeholder={`Message #${channel?.name ?? "channel"}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend(e as unknown as FormEvent);
              }
            }}
            disabled={sending}
            aria-label="Message input"
            className="flex-1"
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={sending || !draft.trim()}
            aria-label="Send message"
          >
            {sending ? "Sending…" : "Send"}
          </Button>
        </Box>
        <Text variant="caption" className="text-content-tertiary mt-1">
          Press Enter to send · Shift+Enter for new line
        </Text>
      </Box>
    </Box>
  );
}
MessageThreadPanel.displayName = "MessageThreadPanel";

// ─── Helpers for grouping ─────────────────────────────────────────────────────

interface DayGroup {
  date: string;
  messages: ChatMessage[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChatPage(): ReactNode {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<ChatChannelDetail | null>(null);
  const [loadingChannel, setLoadingChannel] = useState(false);

  const loadChannels = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await chatApi.listChannels();
      setChannels(res.data);
      // Auto-select first channel if nothing selected
      if (res.data.length > 0 && !selectedId) {
        setSelectedId(res.data[0]?.id ?? null);
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  // Load channel detail when selection changes
  useEffect(() => {
    if (!selectedId) {
      setSelectedChannel(null);
      return;
    }
    setLoadingChannel(true);
    chatApi
      .getChannel(selectedId)
      .then((res) => {
        setSelectedChannel(res.data);
      })
      .catch(() => {
        setSelectedChannel(null);
      })
      .finally(() => {
        setLoadingChannel(false);
      });
  }, [selectedId]);

  function handleChannelSelect(ch: ChatChannel): void {
    setSelectedId(ch.id);
  }

  function handleChannelCreated(ch: ChatChannel): void {
    setChannels((prev) => [ch, ...prev]);
    setSelectedId(ch.id);
  }

  return (
    <PageLayout title="Team Chat">
      <Box className="flex h-full min-h-0">
        {/* Channel list */}
        {loading ? (
          <Box className="w-64 flex-shrink-0 border-r border-border bg-surface-secondary">
            <LoadingSkeleton />
          </Box>
        ) : error ? (
          <Box className="w-64 flex-shrink-0 border-r border-border bg-surface-secondary">
            <ErrorBanner message={error} onRetry={() => void loadChannels()} />
          </Box>
        ) : (
          <ChannelListPanel
            channels={channels}
            selectedId={selectedId}
            onSelect={handleChannelSelect}
            onCreated={handleChannelCreated}
          />
        )}

        {/* Message thread */}
        {loadingChannel ? (
          <Box className="flex-1 flex items-center justify-center">
            <Text variant="body-sm" className="text-content-tertiary animate-pulse">
              Loading messages…
            </Text>
          </Box>
        ) : (
          <MessageThreadPanel channel={selectedChannel} channelId={selectedId} />
        )}
      </Box>
    </PageLayout>
  );
}
