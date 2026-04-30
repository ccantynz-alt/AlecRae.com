"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";

export interface EmailListItem {
  id: string;
  sender: {
    name: string;
    email: string;
    avatar?: string;
  };
  subject: string;
  preview: string;
  timestamp: string;
  read: boolean;
  starred: boolean;
  priority: "high" | "normal" | "low";
  labels?: string[];
  hasAttachments?: boolean;
  threadCount?: number;
}

export interface EmailListProps extends Omit<HTMLAttributes<HTMLUListElement>, "onSelect"> {
  emails: EmailListItem[];
  selectedId?: string;
  onSelect?: (email: EmailListItem) => void;
  onStar?: (email: EmailListItem) => void;
  className?: string;
}

const priorityIndicator = {
  high: "bg-status-error",
  normal: "bg-brand-400",
  low: "bg-content-tertiary",
} as const;

export const EmailList = forwardRef<HTMLUListElement, EmailListProps>(function EmailList(
  { emails, selectedId, onSelect, onStar, className = "", ...props },
  ref
) {
  return (
    <Box ref={ref} as="ul" role="list" className={`flex flex-col divide-y divide-border ${className}`} {...props}>
      {emails.map((email) => (
        <EmailListRow
          key={email.id}
          email={email}
          selected={email.id === selectedId}
          {...(onSelect ? { onSelect } : {})}
          {...(onStar ? { onStar } : {})}
        />
      ))}
      {emails.length === 0 && (
        <Box className="flex items-center justify-center py-16">
          <Text variant="body-md" muted>
            No emails to display
          </Text>
        </Box>
      )}
    </Box>
  );
});

EmailList.displayName = "EmailList";

interface EmailListRowProps {
  email: EmailListItem;
  selected: boolean;
  onSelect?: (email: EmailListItem) => void;
  onStar?: (email: EmailListItem) => void;
}

function EmailListRow({ email, selected, onSelect, onStar }: EmailListRowProps) {
  return (
    <Box
      as="li"
      role="button"
      tabIndex={0}
      className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors duration-100 ${
        selected ? "bg-brand-50" : email.read ? "bg-surface" : "bg-surface-secondary"
      } hover:bg-surface-tertiary`}
      onClick={() => onSelect?.(email)}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(email);
        }
      }}
    >
      <Box className={`mt-2 w-2 h-2 rounded-full flex-shrink-0 ${priorityIndicator[email.priority]}`} />
      <Box className="flex-1 min-w-0">
        <Box className="flex items-center justify-between gap-2">
          <Text
            variant="body-sm"
            className={`truncate ${!email.read ? "font-semibold" : ""}`}
          >
            {email.sender.name}
          </Text>
          <Text variant="caption" className="flex-shrink-0">
            {email.timestamp}
          </Text>
        </Box>
        <Text
          variant="body-sm"
          className={`truncate ${!email.read ? "font-semibold text-content" : "text-content-secondary"}`}
        >
          {email.subject}
          {email.threadCount && email.threadCount > 1 ? (
            <Text as="span" variant="caption" className="ml-1 text-content-tertiary">
              ({email.threadCount})
            </Text>
          ) : null}
        </Text>
        <Text variant="caption" className="truncate text-content-tertiary">
          {email.preview}
        </Text>
      </Box>
      {onStar && (
        <Box
          as="button"
          className={`mt-1 flex-shrink-0 transition-colors ${
            email.starred ? "text-yellow-400" : "text-content-tertiary hover:text-yellow-400"
          }`}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onStar(email);
          }}
          aria-label={email.starred ? "Unstar email" : "Star email"}
        >
          <Text as="span" variant="body-md">
            {email.starred ? "\u2605" : "\u2606"}
          </Text>
        </Box>
      )}
    </Box>
  );
}

EmailListRow.displayName = "EmailListRow";
