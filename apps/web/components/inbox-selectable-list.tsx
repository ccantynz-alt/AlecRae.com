"use client";

import type { EmailListItem } from "@alecrae/ui";

export interface InboxSelectableListProps {
  emails: readonly EmailListItem[];
  selectedId?: string | undefined;
  /** IDs currently checked for bulk selection. */
  checkedIds: ReadonlySet<string>;
  onSelect: (email: EmailListItem) => void;
  onStar: (email: EmailListItem) => void;
  onToggleCheck: (id: string) => void;
  /** IDs of muted threads — renders a muted badge. */
  mutedIds: ReadonlySet<string>;
}

const priorityIndicator: Record<EmailListItem["priority"], string> = {
  high: "bg-status-error",
  normal: "bg-brand-400",
  low: "bg-content-tertiary",
};

/**
 * A selection-aware email list. Mirrors the visual language of @alecrae/ui's
 * EmailList but adds a leading checkbox per row + a muted badge, without
 * modifying the shared composite (which has no per-row selection affordance).
 */
export function InboxSelectableList({
  emails,
  selectedId,
  checkedIds,
  onSelect,
  onStar,
  onToggleCheck,
  mutedIds,
}: InboxSelectableListProps): React.ReactNode {
  return (
    <ul role="list" className="flex flex-col divide-y divide-border">
      {emails.map((email) => {
        const checked = checkedIds.has(email.id);
        const muted = mutedIds.has(email.id);
        const selected = email.id === selectedId;
        return (
          <li
            key={email.id}
            className={`flex items-start gap-2 px-3 py-3 transition-colors duration-100 ${
              selected ? "bg-brand-50" : email.read ? "bg-surface" : "bg-surface-secondary"
            } hover:bg-surface-tertiary`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggleCheck(email.id)}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="mt-1.5 h-3.5 w-3.5 flex-shrink-0 rounded border-border text-brand-600 focus:ring-brand-500"
              aria-label={`Select email from ${email.sender.name}: ${email.subject}`}
            />
            <div
              role="button"
              tabIndex={0}
              className="flex flex-1 cursor-pointer items-start gap-3 min-w-0"
              onClick={() => onSelect(email)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(email);
                }
              }}
            >
              <span
                className={`mt-2 h-2 w-2 flex-shrink-0 rounded-full ${priorityIndicator[email.priority]}`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`truncate text-body-sm ${!email.read ? "font-semibold" : ""}`}
                  >
                    {email.sender.name}
                  </span>
                  <span className="flex-shrink-0 text-caption text-content-tertiary">
                    {email.timestamp}
                  </span>
                </div>
                <div
                  className={`truncate text-body-sm ${
                    !email.read ? "font-semibold text-content" : "text-content-secondary"
                  }`}
                >
                  {email.subject}
                  {muted && (
                    <span className="ml-1.5 rounded bg-surface-tertiary px-1.5 py-0.5 text-[10px] font-medium text-content-tertiary align-middle">
                      Muted
                    </span>
                  )}
                </div>
                <div className="truncate text-caption text-content-tertiary">
                  {email.preview}
                </div>
              </div>
            </div>
            <button
              type="button"
              className={`mt-1 flex-shrink-0 transition-colors ${
                email.starred ? "text-yellow-400" : "text-content-tertiary hover:text-yellow-400"
              }`}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onStar(email);
              }}
              aria-label={email.starred ? "Unstar email" : "Star email"}
            >
              <span className="text-body-md">{email.starred ? "★" : "☆"}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
