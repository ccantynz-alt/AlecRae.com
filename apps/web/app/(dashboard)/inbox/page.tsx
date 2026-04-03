"use client";

import { useState } from "react";
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

const sampleEmails: EmailListItem[] = [
  {
    id: "1",
    sender: { name: "Alice Chen", email: "alice@example.com" },
    subject: "Q2 Product Roadmap Review",
    preview: "Hi team, I've attached the updated roadmap for Q2. Please review the timeline changes...",
    timestamp: "10:32 AM",
    read: false,
    starred: true,
    priority: "high",
    threadCount: 4,
    hasAttachments: true,
  },
  {
    id: "2",
    sender: { name: "GitHub", email: "notifications@github.com" },
    subject: "[emailed/api] PR #142: Add rate limiting middleware",
    preview: "mergify bot merged pull request #142. 12 files changed, 847 insertions...",
    timestamp: "9:15 AM",
    read: false,
    starred: false,
    priority: "normal",
  },
  {
    id: "3",
    sender: { name: "David Park", email: "david@emailed.dev" },
    subject: "DNS verification issue on client domain",
    preview: "Hey, one of our enterprise clients is having trouble with DKIM verification...",
    timestamp: "Yesterday",
    read: true,
    starred: false,
    priority: "high",
    threadCount: 7,
  },
  {
    id: "4",
    sender: { name: "Stripe", email: "receipts@stripe.com" },
    subject: "Your invoice for March 2026",
    preview: "Your March invoice is ready. Amount due: $2,450.00. View your invoice...",
    timestamp: "Yesterday",
    read: true,
    starred: false,
    priority: "low",
    hasAttachments: true,
  },
  {
    id: "5",
    sender: { name: "Maria Santos", email: "maria@partner.io" },
    subject: "Partnership proposal - Email API integration",
    preview: "Hi, we'd love to explore a partnership opportunity. Our platform serves...",
    timestamp: "Mar 31",
    read: true,
    starred: true,
    priority: "normal",
  },
];

const sampleEmailDetail: EmailMessage = {
  id: "1",
  sender: { name: "Alice Chen", email: "alice@example.com" },
  recipients: [
    { name: "Team", email: "team@emailed.dev" },
  ],
  subject: "Q2 Product Roadmap Review",
  timestamp: "April 3, 2026 at 10:32 AM",
  bodyParts: [
    { type: "paragraph", content: "Hi team," },
    {
      type: "paragraph",
      content:
        "I've attached the updated roadmap for Q2. There are a few key timeline changes I want to highlight before our sync tomorrow.",
    },
    { type: "heading", level: 2, content: "Key Changes" },
    {
      type: "list",
      ordered: false,
      items: [
        "AI compose assistant moved up to April (was May)",
        "Domain analytics dashboard pushed to late May",
        "New: Passkey authentication added for June",
      ],
    },
    {
      type: "paragraph",
      content:
        "Let me know if you have any concerns or if the new timeline conflicts with other priorities. We can discuss in detail tomorrow.",
    },
    { type: "paragraph", content: "Best,\nAlice" },
  ],
  attachments: [
    { id: "a1", name: "Q2-Roadmap-v3.pdf", size: "2.4 MB", type: "application/pdf" },
    { id: "a2", name: "timeline-changes.xlsx", size: "156 KB", type: "application/xlsx" },
  ],
};

export default function InboxPage() {
  const [selectedEmailId, setSelectedEmailId] = useState<string | undefined>("1");
  const [emails, setEmails] = useState(sampleEmails);

  const handleSelect = (email: EmailListItem) => {
    setSelectedEmailId(email.id);
    setEmails((prev) =>
      prev.map((e) => (e.id === email.id ? { ...e, read: true } : e))
    );
  };

  const handleStar = (email: EmailListItem) => {
    setEmails((prev) =>
      prev.map((e) => (e.id === email.id ? { ...e, starred: !e.starred } : e))
    );
  };

  const selectedEmail = selectedEmailId === "1" ? sampleEmailDetail : null;

  const searchHeader = (
    <Box className="flex items-center gap-4 w-full">
      <Input
        variant="search"
        placeholder="Search emails..."
        inputSize="sm"
        className="max-w-md"
      />
      <Box className="flex items-center gap-2 ml-auto">
        <Button variant="ghost" size="sm">
          All
        </Button>
        <Button variant="ghost" size="sm">
          Unread
        </Button>
        <Button variant="ghost" size="sm">
          Starred
        </Button>
        <Button variant="ghost" size="sm">
          Priority
        </Button>
      </Box>
    </Box>
  );

  return (
    <PageLayout header={searchHeader} fullWidth>
      <Box className="flex flex-1 h-full">
        <Box className="w-96 border-r border-border overflow-y-auto flex-shrink-0">
          <Box className="px-4 py-2 border-b border-border bg-surface-secondary">
            <Text variant="body-sm" muted>
              {emails.filter((e) => !e.read).length} unread of {emails.length} emails
            </Text>
          </Box>
          <EmailList
            emails={emails}
            selectedId={selectedEmailId}
            onSelect={handleSelect}
            onStar={handleStar}
          />
        </Box>
        <Box className="flex-1 min-w-0">
          <EmailViewer
            email={selectedEmail}
            onReply={() => {}}
            onReplyAll={() => {}}
            onForward={() => {}}
            onArchive={() => {}}
            onDelete={() => {}}
          />
        </Box>
      </Box>
    </PageLayout>
  );
}
