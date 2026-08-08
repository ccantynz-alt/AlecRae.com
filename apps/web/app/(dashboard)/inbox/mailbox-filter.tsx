"use client";

import { Box, Text } from "@alecrae/ui";

/**
 * One selectable mailbox in the inbox filter. `unreadCount` is optional because
 * the counts endpoint is newer than the mailboxes list — when only addresses
 * are available the filter still works, it just shows no badge.
 */
export interface MailboxFilterItem {
  id: string;
  address: string;
  unreadCount?: number;
}

export interface MailboxFilterProps {
  mailboxes: readonly MailboxFilterItem[];
  /** Unread count for catch-all / unrouted mail; omitted when unknown. */
  unroutedCount?: number | undefined;
  /**
   * Currently selected filter: `null` = All mail, "unrouted" = catch-all,
   * otherwise a mailbox id.
   */
  selected: string | null;
  onSelect: (value: string | null) => void;
  loading?: boolean;
}

/**
 * Mailbox filter for the business-email inbox.
 *
 * Lets the operator narrow the list to a single provisioned mailbox
 * (info@ / support@ / sales@ …) or to catch-all mail, with per-mailbox unread
 * counts. Rendered as a compact vertical list at the top of the inbox's left
 * rail so it sits alongside the message list without a second column.
 *
 * Presentational only — the inbox page owns the data and refetches messages
 * when `onSelect` fires. When there are no provisioned mailboxes the whole
 * section renders nothing, so a consumer/connected-account inbox is unchanged.
 */
export function MailboxFilter({
  mailboxes,
  unroutedCount,
  selected,
  onSelect,
  loading = false,
}: MailboxFilterProps): React.ReactNode {
  // Nothing to filter by on a consumer inbox — stay out of the way entirely.
  if (mailboxes.length === 0 && !loading) return null;

  return (
    <Box
      as="nav"
      aria-label="Filter inbox by mailbox"
      className="border-b border-border bg-surface px-2 py-2"
    >
      <Box className="px-1 pb-1">
        <Text variant="caption" muted className="uppercase tracking-wide">
          Mailboxes
        </Text>
      </Box>
      <ul role="list" className="flex flex-col gap-0.5">
        <MailboxFilterRow
          label="All mail"
          active={selected === null}
          onSelect={() => onSelect(null)}
        />
        {mailboxes.map((mb) => (
          <MailboxFilterRow
            key={mb.id}
            label={mb.address}
            count={mb.unreadCount}
            active={selected === mb.id}
            onSelect={() => onSelect(mb.id)}
          />
        ))}
        <MailboxFilterRow
          label="Unrouted"
          count={unroutedCount}
          active={selected === "unrouted"}
          onSelect={() => onSelect("unrouted")}
        />
      </ul>
      {loading && mailboxes.length === 0 && (
        <Box className="px-2 py-1">
          <Text variant="caption" muted>
            Loading mailboxes…
          </Text>
        </Box>
      )}
    </Box>
  );
}

MailboxFilter.displayName = "MailboxFilter";

interface MailboxFilterRowProps {
  label: string;
  count?: number | undefined;
  active: boolean;
  onSelect: () => void;
}

function MailboxFilterRow({ label, count, active, onSelect }: MailboxFilterRowProps) {
  const showBadge = typeof count === "number" && count > 0;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
          active
            ? "bg-brand-50 text-brand-700"
            : "text-content-secondary hover:bg-surface-tertiary"
        }`}
      >
        <span className={`flex-1 truncate text-body-sm ${active ? "font-semibold" : ""}`}>
          {label}
        </span>
        {showBadge && (
          <span
            className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              active ? "bg-brand-100 text-brand-700" : "bg-surface-tertiary text-content-tertiary"
            }`}
            aria-label={`${count} unread`}
          >
            {count}
          </span>
        )}
      </button>
    </li>
  );
}

MailboxFilterRow.displayName = "MailboxFilterRow";
