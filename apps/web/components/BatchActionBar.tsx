"use client";

import { motion } from "motion/react";
import { SPRING_BOUNCY, useAlecRaeReducedMotion } from "../lib/animations";

export interface BatchActionBarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onStar: () => void;
}

export function BatchActionBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onArchive,
  onDelete,
  onMarkRead,
  onMarkUnread,
  onStar,
}: BatchActionBarProps): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();

  if (selectedCount === 0) return null;

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={SPRING_BOUNCY}
      className="flex items-center gap-2 px-4 py-2 bg-brand-50 border-b border-brand-200"
      role="toolbar"
      aria-label="Batch email actions"
    >
      <span className="text-sm font-medium text-brand-700">
        {selectedCount} selected
      </span>

      {selectedCount < totalCount ? (
        <button
          type="button"
          onClick={onSelectAll}
          className="text-xs text-brand-600 hover:text-brand-800 font-medium transition-colors"
        >
          Select all {totalCount}
        </button>
      ) : (
        <button
          type="button"
          onClick={onDeselectAll}
          className="text-xs text-brand-600 hover:text-brand-800 font-medium transition-colors"
        >
          Deselect all
        </button>
      )}

      <div className="w-px h-4 bg-brand-200 mx-1" />

      <ActionButton label="Archive" onClick={onArchive} icon="M5 8l4 4 4-4" />
      <ActionButton label="Delete" onClick={onDelete} icon="M6 6l8 8M6 14l8-8" danger />
      <ActionButton label="Read" onClick={onMarkRead} icon="M3 8l4 4 8-8" />
      <ActionButton label="Unread" onClick={onMarkUnread} icon="M12 4a8 8 0 100 16 8 8 0 000-16z" />
      <ActionButton label="Star" onClick={onStar} icon="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01z" />
    </motion.div>
  );
}

function ActionButton({
  label,
  onClick,
  icon,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  icon: string;
  danger?: boolean;
}): React.ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
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
