"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";

export interface EmailAttachment {
  id: string;
  name: string;
  size: string;
  type: string;
}

export interface EmailMessage {
  id: string;
  sender: {
    name: string;
    email: string;
    avatar?: string;
  };
  recipients: { name: string; email: string }[];
  cc?: { name: string; email: string }[];
  subject: string;
  timestamp: string;
  bodyParts: EmailBodyPart[];
  attachments?: EmailAttachment[];
}

export type EmailBodyPart =
  | { type: "paragraph"; content: string }
  | { type: "heading"; level: 1 | 2 | 3; content: string }
  | { type: "blockquote"; content: string }
  | { type: "code"; language?: string; content: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "divider" }
  | { type: "image"; src: string; alt: string };

export interface EmailViewerProps extends HTMLAttributes<HTMLDivElement> {
  email: EmailMessage | null;
  onReply?: () => void;
  onReplyAll?: () => void;
  onForward?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  className?: string;
}

export const EmailViewer = forwardRef<HTMLDivElement, EmailViewerProps>(function EmailViewer(
  { email, onReply, onReplyAll, onForward, onArchive, onDelete, className = "", ...props },
  ref
) {
  if (!email) {
    return (
      <Box ref={ref} className={`flex items-center justify-center h-full ${className}`} {...props}>
        <Text variant="body-md" muted>
          Select an email to read
        </Text>
      </Box>
    );
  }

  return (
    <Box ref={ref} className={`flex flex-col h-full ${className}`} {...props}>
      <EmailViewerHeader email={email} />
      <EmailViewerActions
        {...(onReply ? { onReply } : {})}
        {...(onReplyAll ? { onReplyAll } : {})}
        {...(onForward ? { onForward } : {})}
        {...(onArchive ? { onArchive } : {})}
        {...(onDelete ? { onDelete } : {})}
      />
      <EmailViewerBody parts={email.bodyParts} />
      {email.attachments && email.attachments.length > 0 && (
        <EmailViewerAttachments attachments={email.attachments} />
      )}
    </Box>
  );
});

EmailViewer.displayName = "EmailViewer";

function EmailViewerHeader({ email }: { email: EmailMessage }) {
  return (
    <Box className="px-6 py-4 border-b border-border">
      <Text variant="heading-md" className="mb-2">
        {email.subject}
      </Text>
      <Box className="flex items-center gap-3">
        <Box className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
          <Text variant="body-sm" className="text-brand-700 font-semibold">
            {email.sender.name.charAt(0).toUpperCase()}
          </Text>
        </Box>
        <Box className="flex-1 min-w-0">
          <Text variant="body-sm" className="font-semibold">
            {email.sender.name}
          </Text>
          <Text variant="caption">
            {email.sender.email}
          </Text>
        </Box>
        <Text variant="caption">{email.timestamp}</Text>
      </Box>
      {email.recipients.length > 0 && (
        <Box className="mt-2">
          <Text variant="caption">
            To: {email.recipients.map((r) => r.name || r.email).join(", ")}
          </Text>
        </Box>
      )}
    </Box>
  );
}

EmailViewerHeader.displayName = "EmailViewerHeader";

interface EmailViewerActionsProps {
  onReply?: () => void;
  onReplyAll?: () => void;
  onForward?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
}

function EmailViewerActions({ onReply, onReplyAll, onForward, onArchive, onDelete }: EmailViewerActionsProps) {
  return (
    <Box className="flex items-center gap-2 px-6 py-2 border-b border-border">
      <Button variant="ghost" size="sm" onClick={onReply}>
        Reply
      </Button>
      <Button variant="ghost" size="sm" onClick={onReplyAll}>
        Reply All
      </Button>
      <Button variant="ghost" size="sm" onClick={onForward}>
        Forward
      </Button>
      <Box className="flex-1" />
      <Button variant="ghost" size="sm" onClick={onArchive}>
        Archive
      </Button>
      <Button variant="destructive" size="sm" onClick={onDelete}>
        Delete
      </Button>
    </Box>
  );
}

EmailViewerActions.displayName = "EmailViewerActions";

function EmailViewerBody({ parts }: { parts: EmailBodyPart[] }) {
  return (
    <Box className="flex-1 overflow-auto px-6 py-4">
      {parts.map((part, index) => (
        <EmailBodyPartRenderer key={index} part={part} />
      ))}
    </Box>
  );
}

EmailViewerBody.displayName = "EmailViewerBody";

function EmailBodyPartRenderer({ part }: { part: EmailBodyPart }) {
  switch (part.type) {
    case "paragraph":
      return (
        <Text variant="body-md" className="mb-4 leading-relaxed">
          {part.content}
        </Text>
      );
    case "heading": {
      const variant = part.level === 1 ? "heading-lg" : part.level === 2 ? "heading-md" : "heading-sm";
      return (
        <Text variant={variant} className="mb-3 mt-6">
          {part.content}
        </Text>
      );
    }
    case "blockquote":
      return (
        <Box as="blockquote" className="border-l-4 border-brand-200 pl-4 my-4 italic">
          <Text variant="body-md" muted>
            {part.content}
          </Text>
        </Box>
      );
    case "code":
      return (
        <Box as="pre" className="bg-surface-tertiary rounded-lg p-4 my-4 overflow-x-auto">
          <Text as="code" variant="body-sm" className="font-mono">
            {part.content}
          </Text>
        </Box>
      );
    case "list":
      return (
        <Box as={part.ordered ? "ol" : "ul"} className={`my-4 pl-6 ${part.ordered ? "list-decimal" : "list-disc"}`}>
          {part.items.map((item, i) => (
            <Box as="li" key={i} className="mb-1">
              <Text variant="body-md">{item}</Text>
            </Box>
          ))}
        </Box>
      );
    case "divider":
      return <Box as="hr" className="my-6 border-border" />;
    case "image":
      return (
        <Box className="my-4">
          <Box as="img" src={part.src} alt={part.alt} className="max-w-full rounded-lg" />
        </Box>
      );
    default:
      return null;
  }
}

EmailBodyPartRenderer.displayName = "EmailBodyPartRenderer";

function EmailViewerAttachments({ attachments }: { attachments: EmailAttachment[] }) {
  return (
    <Box className="px-6 py-4 border-t border-border">
      <Text variant="label" className="mb-2">
        Attachments ({attachments.length})
      </Text>
      <Box className="flex flex-wrap gap-2">
        {attachments.map((attachment) => (
          <Box
            key={attachment.id}
            className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg hover:bg-surface-tertiary cursor-pointer transition-colors"
          >
            <Text variant="body-sm">{attachment.name}</Text>
            <Text variant="caption">{attachment.size}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

EmailViewerAttachments.displayName = "EmailViewerAttachments";
