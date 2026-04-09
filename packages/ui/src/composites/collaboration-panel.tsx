"use client";

import {
  forwardRef,
  useState,
  useCallback,
  type HTMLAttributes,
} from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import {
  CollaboratorAvatars,
  type Collaborator,
} from "./collaborator-avatars";

// ─── Types ──────────────────────────────────────────────────────────────────

export type CollabPanelView = "participants" | "invite" | "history";

export interface CollabInvite {
  id: string;
  inviteeEmail: string;
  role: "editor" | "viewer";
  status: "pending" | "accepted" | "declined" | "revoked";
  expiresAt: string;
  createdAt: string;
}

export interface CollabHistoryEntry {
  id: string;
  version: number;
  editedBy: string | null;
  updateSize: number;
  summary: string | null;
  createdAt: string;
}

export type CollabSessionStatus = "active" | "closed" | "archived";

export interface CollabSessionInfo {
  id: string;
  draftId: string;
  title: string;
  status: CollabSessionStatus;
  currentVersion: number;
  createdAt: string;
}

export interface CollaborationPanelProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onError"> {
  /** The current collaboration session info. */
  session: CollabSessionInfo;
  /** Active collaborators in the session. */
  collaborators: Collaborator[];
  /** Pending invites. */
  pendingInvites?: CollabInvite[];
  /** Version history entries. */
  history?: CollabHistoryEntry[];
  /** Whether the current user is the session owner. */
  isOwner?: boolean;
  /** Callback to invite a collaborator. */
  onInvite?: (email: string, role: "editor" | "viewer") => Promise<void>;
  /** Callback to remove a collaborator. */
  onRemoveCollaborator?: (userId: string) => Promise<void>;
  /** Callback to load more history entries. */
  onLoadHistory?: () => Promise<void>;
  /** Callback when an error occurs. */
  onError?: (error: string) => void;
  /** Callback to close the panel. */
  onClose?: () => void;
  /** Whether the panel is in a loading state. */
  loading?: boolean;
  className?: string;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ParticipantItem({
  collaborator,
  isOwner,
  onRemove,
}: {
  collaborator: Collaborator;
  isOwner: boolean;
  onRemove?: ((userId: string) => void) | undefined;
}): React.JSX.Element {
  return (
    <Box className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-surface-secondary transition-colors">
      <Box className="flex items-center gap-3">
        <CollaboratorAvatars
          collaborators={[collaborator]}
          size="sm"
          maxVisible={1}
          showTooltip={false}
        />
        <Box className="flex flex-col">
          <Text variant="body-sm" className="font-medium text-content">
            {collaborator.name}
          </Text>
          <Text variant="caption" className="text-content-secondary capitalize">
            {collaborator.role}
            {collaborator.isOnline ? " \u2022 Online" : ""}
          </Text>
        </Box>
      </Box>

      {isOwner && collaborator.role !== "owner" && onRemove && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(collaborator.userId)}
          aria-label={`Remove ${collaborator.name}`}
          className="text-content-secondary hover:text-status-error"
        >
          <Box as="span" aria-hidden="true">
            {"\u00D7"}
          </Box>
        </Button>
      )}
    </Box>
  );
}

ParticipantItem.displayName = "ParticipantItem";

function PendingInviteItem({
  invite,
}: {
  invite: CollabInvite;
}): React.JSX.Element {
  const isExpired = new Date(invite.expiresAt) < new Date();

  return (
    <Box className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-secondary">
      <Box className="flex flex-col">
        <Text variant="body-sm" className="text-content">
          {invite.inviteeEmail}
        </Text>
        <Text variant="caption" className="text-content-secondary capitalize">
          {invite.role} {"\u2022"}{" "}
          {isExpired ? "Expired" : `Pending`}
        </Text>
      </Box>
      <Box
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
          isExpired
            ? "bg-status-error/10 text-status-error"
            : "bg-status-warning/10 text-status-warning"
        }`}
      >
        {isExpired ? "Expired" : "Pending"}
      </Box>
    </Box>
  );
}

PendingInviteItem.displayName = "PendingInviteItem";

function HistoryItem({
  entry,
}: {
  entry: CollabHistoryEntry;
}): React.JSX.Element {
  return (
    <Box className="flex items-start gap-3 py-2 px-3">
      <Box className="mt-1 w-2 h-2 rounded-full bg-brand-500 flex-shrink-0" />
      <Box className="flex flex-col flex-1 min-w-0">
        <Box className="flex items-center justify-between gap-2">
          <Text variant="body-sm" className="text-content font-medium">
            v{entry.version}
          </Text>
          <Text variant="caption" className="text-content-secondary flex-shrink-0">
            {formatRelativeTime(entry.createdAt)}
          </Text>
        </Box>
        {entry.summary && (
          <Text
            variant="caption"
            className="text-content-secondary mt-0.5 truncate"
          >
            {entry.summary}
          </Text>
        )}
        <Text variant="caption" className="text-content-tertiary">
          {entry.editedBy ?? "Unknown"} {"\u2022"}{" "}
          {formatByteSize(entry.updateSize)}
        </Text>
      </Box>
    </Box>
  );
}

HistoryItem.displayName = "HistoryItem";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export const CollaborationPanel = forwardRef<
  HTMLDivElement,
  CollaborationPanelProps
>(function CollaborationPanel(
  {
    session,
    collaborators,
    pendingInvites = [],
    history = [],
    isOwner = false,
    onInvite,
    onRemoveCollaborator,
    onLoadHistory,
    onError,
    onClose,
    loading = false,
    className = "",
    ...props
  },
  ref,
) {
  const [view, setView] = useState<CollabPanelView>("participants");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const handleInvite = useCallback(async () => {
    if (!inviteEmail.trim() || !onInvite) return;

    // Basic email validation.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) {
      onError?.("Please enter a valid email address");
      return;
    }

    setInviting(true);
    try {
      await onInvite(inviteEmail.trim(), inviteRole);
      setInviteEmail("");
    } catch (err) {
      onError?.((err as Error).message ?? "Failed to send invite");
    } finally {
      setInviting(false);
    }
  }, [inviteEmail, inviteRole, onInvite, onError]);

  const handleRemove = useCallback(
    async (userId: string) => {
      if (!onRemoveCollaborator) return;
      setRemoving(userId);
      try {
        await onRemoveCollaborator(userId);
      } catch (err) {
        onError?.((err as Error).message ?? "Failed to remove collaborator");
      } finally {
        setRemoving(null);
      }
    },
    [onRemoveCollaborator, onError],
  );

  const onlineCount = collaborators.filter((c) => c.isOnline).length;

  return (
    <Box
      ref={ref}
      className={`flex flex-col bg-surface-primary border border-border rounded-xl shadow-lg overflow-hidden ${className}`}
      role="dialog"
      aria-label="Collaboration panel"
      {...props}
    >
      {/* Header */}
      <Box className="flex items-center justify-between px-4 py-3 border-b border-border">
        <Box className="flex flex-col">
          <Text variant="body-md" className="font-semibold text-content">
            {session.title}
          </Text>
          <Text variant="caption" className="text-content-secondary">
            {onlineCount} online {"\u2022"} v{session.currentVersion}
          </Text>
        </Box>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close collaboration panel"
          >
            <Box as="span" className="text-lg" aria-hidden="true">
              {"\u00D7"}
            </Box>
          </Button>
        )}
      </Box>

      {/* Tab bar */}
      <Box className="flex border-b border-border" role="tablist">
        {(
          [
            { key: "participants", label: "People" },
            { key: "invite", label: "Invite" },
            { key: "history", label: "History" },
          ] as const
        ).map((tab) => (
          <Button
            key={tab.key}
            variant="ghost"
            size="sm"
            role="tab"
            aria-selected={view === tab.key}
            aria-controls={`collab-panel-${tab.key}`}
            onClick={() => setView(tab.key)}
            className={`flex-1 rounded-none border-b-2 transition-colors ${
              view === tab.key
                ? "border-brand-500 text-brand-600 font-medium"
                : "border-transparent text-content-secondary"
            }`}
          >
            {tab.label}
            {tab.key === "participants" && (
              <Box
                as="span"
                className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-surface-tertiary text-[10px] font-medium"
              >
                {collaborators.length}
              </Box>
            )}
          </Button>
        ))}
      </Box>

      {/* Panel content */}
      <Box
        className="flex-1 overflow-y-auto p-2"
        style={{ maxHeight: 400 }}
        id={`collab-panel-${view}`}
        role="tabpanel"
      >
        {/* Participants view */}
        {view === "participants" && (
          <Box className="flex flex-col gap-1">
            {collaborators.length === 0 ? (
              <Box className="flex items-center justify-center py-8">
                <Text
                  variant="body-sm"
                  className="text-content-secondary"
                >
                  No collaborators yet
                </Text>
              </Box>
            ) : (
              collaborators.map((c) => (
                <ParticipantItem
                  key={c.userId}
                  collaborator={c}
                  isOwner={isOwner}
                  onRemove={
                    removing === c.userId ? undefined : handleRemove
                  }
                />
              ))
            )}

            {pendingInvites.length > 0 && (
              <Box className="mt-3">
                <Text
                  variant="caption"
                  className="px-3 py-1 text-content-secondary font-medium uppercase tracking-wider"
                >
                  Pending Invites
                </Text>
                <Box className="flex flex-col gap-1 mt-1">
                  {pendingInvites.map((inv) => (
                    <PendingInviteItem key={inv.id} invite={inv} />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        )}

        {/* Invite view */}
        {view === "invite" && (
          <Box className="flex flex-col gap-3 p-2">
            <Text variant="body-sm" className="text-content-secondary">
              Invite someone to collaborate on this draft. They will receive
              an email with a link to join.
            </Text>

            <Box className="flex flex-col gap-2">
              <Input
                type="email"
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setInviteEmail(e.target.value)
                }
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleInvite();
                  }
                }}
                aria-label="Invitee email address"
                disabled={inviting || !isOwner}
              />

              <Box className="flex items-center gap-2">
                <Box
                  as="select"
                  value={inviteRole}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setInviteRole(
                      e.target.value as "editor" | "viewer",
                    )
                  }
                  className="h-10 px-3 rounded-lg border border-border bg-surface-primary text-content text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  aria-label="Collaborator role"
                >
                  <Box as="option" value="editor">
                    Editor
                  </Box>
                  <Box as="option" value="viewer">
                    Viewer
                  </Box>
                </Box>

                <Button
                  variant="primary"
                  size="md"
                  onClick={() => void handleInvite()}
                  loading={inviting}
                  disabled={
                    !inviteEmail.trim() || inviting || !isOwner
                  }
                  className="flex-1"
                >
                  Send Invite
                </Button>
              </Box>
            </Box>

            {!isOwner && (
              <Text
                variant="caption"
                className="text-status-warning mt-1"
              >
                Only the session owner can invite collaborators.
              </Text>
            )}
          </Box>
        )}

        {/* History view */}
        {view === "history" && (
          <Box className="flex flex-col gap-0">
            {history.length === 0 ? (
              <Box className="flex items-center justify-center py-8">
                <Text
                  variant="body-sm"
                  className="text-content-secondary"
                >
                  No version history yet
                </Text>
              </Box>
            ) : (
              <>
                {history.map((entry) => (
                  <HistoryItem key={entry.id} entry={entry} />
                ))}

                {onLoadHistory && (
                  <Box className="flex justify-center py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void onLoadHistory()}
                      loading={loading}
                    >
                      Load more
                    </Button>
                  </Box>
                )}
              </>
            )}
          </Box>
        )}
      </Box>

      {/* Footer status bar */}
      <Box className="flex items-center justify-between px-4 py-2 border-t border-border bg-surface-secondary">
        <CollaboratorAvatars
          collaborators={collaborators}
          size="sm"
          maxVisible={4}
        />
        <Box
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
            session.status === "active"
              ? "bg-status-success/10 text-status-success"
              : "bg-surface-tertiary text-content-secondary"
          }`}
        >
          <Box
            className={`w-1.5 h-1.5 rounded-full ${
              session.status === "active"
                ? "bg-status-success"
                : "bg-content-tertiary"
            }`}
            aria-hidden="true"
          />
          {session.status === "active" ? "Live" : "Closed"}
        </Box>
      </Box>
    </Box>
  );
});

CollaborationPanel.displayName = "CollaborationPanel";
