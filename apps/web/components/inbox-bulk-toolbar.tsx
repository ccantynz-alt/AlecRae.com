"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { SPRING_BOUNCY, useAlecRaeReducedMotion } from "../lib/animations";

export interface InboxBulkToolbarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  /** Optimistically remove + persist archive of the selection. */
  onArchive: () => void;
  /** Optimistically remove + persist delete of the selection. */
  onDelete: () => void;
  /** Persist read state on the selection. */
  onMarkRead: () => void;
  /** Persist unread state on the selection. */
  onMarkUnread: () => void;
  /** Persist star on the selection. */
  onStar: () => void;
  /** Persist mute for the selected threads. */
  onMute: () => void;
  /** Open the labels manager scoped to the selection. */
  onLabel: () => void;
  /** True while any bulk request is in flight (disables the buttons). */
  busy?: boolean;
}

export function InboxBulkToolbar({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onArchive,
  onDelete,
  onMarkRead,
  onMarkUnread,
  onStar,
  onMute,
  onLabel,
  busy = false,
}: InboxBulkToolbarProps): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const [moreOpen, setMoreOpen] = useState(false);

  if (selectedCount === 0) return null;

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={SPRING_BOUNCY}
      className="flex flex-wrap items-center gap-1.5 border-b border-brand-200 bg-brand-50 px-4 py-2"
      role="toolbar"
      aria-label="Bulk email actions"
    >
      <span className="text-sm font-medium text-brand-700">
        {selectedCount} selected
      </span>

      {selectedCount < totalCount ? (
        <button
          type="button"
          onClick={onSelectAll}
          className="text-xs font-medium text-brand-600 transition-colors hover:text-brand-800"
        >
          Select all {totalCount}
        </button>
      ) : (
        <button
          type="button"
          onClick={onDeselectAll}
          className="text-xs font-medium text-brand-600 transition-colors hover:text-brand-800"
        >
          Deselect all
        </button>
      )}

      <div className="mx-1 h-4 w-px bg-brand-200" aria-hidden="true" />

      <ToolbarButton label="Archive" onClick={onArchive} disabled={busy} icon="M5 8l4 4 4-4" />
      <ToolbarButton label="Delete" onClick={onDelete} disabled={busy} icon="M6 6l8 8M6 14l8-8" danger />
      <ToolbarButton label="Read" onClick={onMarkRead} disabled={busy} icon="M3 8l4 4 8-8" />
      <ToolbarButton label="Unread" onClick={onMarkUnread} disabled={busy} icon="M12 4a8 8 0 100 16 8 8 0 000-16z" />
      <ToolbarButton label="Star" onClick={onStar} disabled={busy} icon="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01z" />
      <ToolbarButton label="Label" onClick={onLabel} disabled={busy} icon="M4 4h9l7 8-7 8H4z" />

      <div className="relative">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:bg-surface hover:text-content disabled:opacity-50"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          aria-label="More bulk actions"
        >
          More
        </button>
        {moreOpen && (
          <div
            className="absolute left-0 top-full z-10 mt-1 min-w-[10rem] rounded-md border border-border bg-surface py-1 shadow-lg"
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreOpen(false);
                onMute();
              }}
              disabled={busy}
              className="block w-full px-3 py-1.5 text-left text-xs text-content-secondary transition-colors hover:bg-surface-secondary hover:text-content disabled:opacity-50"
            >
              Mute thread{selectedCount === 1 ? "" : "s"}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ToolbarButton({
  label,
  onClick,
  icon,
  danger = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  icon: string;
  danger?: boolean;
  disabled?: boolean;
}): React.ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        danger
          ? "text-red-600 hover:bg-red-50 hover:text-red-700"
          : "text-content-secondary hover:bg-surface hover:text-content"
      }`}
      aria-label={label}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={icon} />
      </svg>
      {label}
    </button>
  );
}
