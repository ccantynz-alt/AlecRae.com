"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
} from "@emailed/ui";
import { messagesApi, type Message, type MessageDetail } from "../../../lib/api";

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

export default function InboxPage() {
  const router = useRouter();
  const [emailItems, setEmailItems] = useState<EmailListItem[]>([]);
  const [selectedEmailId, setSelectedEmailId] = useState<string | undefined>();
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread" | "starred">("all");

  const fetchEmails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await messagesApi.list({ limit: 50 });
      const items = res.data.map(toEmailListItem);
      setEmailItems(items);
      if (items.length > 0 && !selectedEmailId) {
        setSelectedEmailId(items[0]!.id);
      }
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
  }, [fetchEmails]);

  useEffect(() => {
    if (selectedEmailId) {
      fetchDetail(selectedEmailId);
    }
  }, [selectedEmailId, fetchDetail]);

  const handleSelect = (email: EmailListItem) => {
    setSelectedEmailId(email.id);
    setEmailItems((prev) =>
      prev.map((e) => (e.id === email.id ? { ...e, read: true } : e)),
    );
  };

  const handleStar = (email: EmailListItem) => {
    setEmailItems((prev) =>
      prev.map((e) => (e.id === email.id ? { ...e, starred: !e.starred } : e)),
    );
  };

  const filteredEmails = emailItems.filter((e) => {
    if (filter === "unread") return !e.read;
    if (filter === "starred") return e.starred;
    return true;
  });

  const searchHeader = (
    <Box className="flex items-center gap-4 w-full">
      <Input
        variant="search"
        placeholder="Search emails..."
        inputSize="sm"
        className="max-w-md"
      />
      <Box className="flex items-center gap-2 ml-auto">
        <Button
          variant={filter === "all" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          All
        </Button>
        <Button
          variant={filter === "unread" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setFilter("unread")}
        >
          Unread
        </Button>
        <Button
          variant={filter === "starred" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setFilter("starred")}
        >
          Starred
        </Button>
      </Box>
    </Box>
  );

  if (loading) {
    return (
      <PageLayout header={searchHeader} fullWidth>
        <Box className="flex items-center justify-center h-full">
          <Text variant="body-md" muted>Loading emails...</Text>
        </Box>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout header={searchHeader} fullWidth>
        <Box className="flex flex-col items-center justify-center h-full gap-4">
          <Text variant="body-md" muted>{error}</Text>
          <Button variant="secondary" size="sm" onClick={fetchEmails}>
            Retry
          </Button>
        </Box>
      </PageLayout>
    );
  }

  return (
    <PageLayout header={searchHeader} fullWidth>
      <Box className="flex flex-1 h-full">
        <Box className="w-96 border-r border-border overflow-y-auto flex-shrink-0">
          <Box className="px-4 py-2 border-b border-border bg-surface-secondary">
            <Text variant="body-sm" muted>
              {filteredEmails.filter((e) => !e.read).length} unread of {filteredEmails.length} emails
            </Text>
          </Box>
          {filteredEmails.length === 0 ? (
            <Box className="flex items-center justify-center p-8">
              <Text variant="body-sm" muted>
                {filter === "all" ? "No emails yet" : `No ${filter} emails`}
              </Text>
            </Box>
          ) : (
            <EmailList
              emails={filteredEmails}
              selectedId={selectedEmailId}
              onSelect={handleSelect}
              onStar={handleStar}
            />
          )}
        </Box>
        <Box className="flex-1 min-w-0">
          {detailLoading ? (
            <Box className="flex items-center justify-center h-full">
              <Text variant="body-md" muted>Loading...</Text>
            </Box>
          ) : (
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
                if (selectedEmailId) {
                  setEmailItems((prev) => prev.filter((e) => e.id !== selectedEmailId));
                  setSelectedEmailId(undefined);
                  setSelectedEmail(null);
                }
              }}
              onDelete={() => {
                if (selectedEmailId) {
                  setEmailItems((prev) => prev.filter((e) => e.id !== selectedEmailId));
                  setSelectedEmailId(undefined);
                  setSelectedEmail(null);
                }
              }}
            />
          )}
        </Box>
      </Box>
    </PageLayout>
  );
}
