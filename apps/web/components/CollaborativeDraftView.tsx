"use client";

import { useState, useCallback } from "react";
import {
  Box,
  Text,
  Button,
  CollaborativeEditor,
  CollaborationPanel,
  type CollabSessionInfo,
  type CollabInvite,
  type CollabHistoryEntry,
  type Collaborator,
} from "@alecrae/ui";
import {
  useCollaborativeDraft,
  type UseCollaborativeDraftOptions,
} from "../lib/use-collaborative-draft";
import { collaborationApi } from "../lib/api";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CollaborativeDraftViewProps {
  /** Config for the collaboration session (from API). */
  draftId: string;
  sessionId: string;
  token: string;
  /** Session metadata. */
  session: CollabSessionInfo;
  /** Current user info. */
  user: {
    userId: string;
    name: string;
    avatarUrl?: string | undefined;
    cursorColor?: string | undefined;
  };
  /** Whether the current user is the session owner. */
  isOwner?: boolean | undefined;
  /** Initial participants from the API. */
  initialParticipants?: Collaborator[] | undefined;
  /** Initial pending invites from the API. */
  initialInvites?: CollabInvite[] | undefined;
  /** @deprecated API base URL — now uses centralized apiFetch. */
  apiBaseUrl?: string | undefined;
  /** @deprecated Auth token — now uses centralized apiFetch. */
  apiToken?: string | undefined;
  /** Callback when the draft is sent. */
  onSend?: (() => void) | undefined;
  /** Callback when the draft content changes. */
  onContentChange?: ((content: { text: string; html: string }) => void) | undefined;
  /** WebSocket endpoint override. */
  collabEndpoint?: string | undefined;
  className?: string | undefined;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CollaborativeDraftView({
  draftId,
  sessionId,
  token,
  session,
  user,
  isOwner = false,
  initialParticipants = [],
  initialInvites = [],
  apiBaseUrl: _apiBaseUrl = "/api",
  apiToken: _apiToken,
  onSend: _onSend,
  onContentChange,
  collabEndpoint,
  className = "",
}: CollaborativeDraftViewProps): React.JSX.Element {
  const [showPanel, setShowPanel] = useState(false);
  const [pendingInvites, setPendingInvites] =
    useState<CollabInvite[]>(initialInvites);
  const [history, setHistory] = useState<CollabHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wire up the collaboration client.
  const collab = useCollaborativeDraft({
    draftId,
    sessionId,
    token,
    endpoint: collabEndpoint,
    user,
    autoConnect: true,
  });

  // Merge API participants with live collaborators from awareness.
  const allCollaborators: Collaborator[] = mergeCollaborators(
    initialParticipants,
    collab.collaborators,
    user,
  );

  // ─── API calls (typed client) ────────────────────────────────────────────

  const handleInvite = useCallback(
    async (email: string, role: "editor" | "viewer") => {
      const { data } = await collaborationApi.invite(sessionId, { email, role });

      setPendingInvites((prev) => [
        ...prev,
        {
          id: data.inviteId,
          inviteeEmail: data.inviteeEmail,
          role: data.role as "editor" | "viewer",
          status: "pending" as const,
          expiresAt: data.expiresAt,
          createdAt: new Date().toISOString(),
        },
      ]);
    },
    [sessionId],
  );

  const handleRemoveCollaborator = useCallback(
    async (userId: string) => {
      await collaborationApi.removeCollaborator(sessionId, userId);
    },
    [sessionId],
  );

  const handleLoadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const offset = history.length;
      const { data } = await collaborationApi.getHistory(sessionId, {
        limit: 20,
        offset,
      });
      setHistory((prev) => [...prev, ...data.entries]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setHistoryLoading(false);
    }
  }, [sessionId, history.length]);

  return (
    <Box className={`flex gap-4 ${className}`}>
      {/* Main editor area */}
      <Box className="flex-1 min-w-0">
        {error && (
          <Box className="mb-3 px-4 py-2 bg-status-error/10 border border-status-error/20 rounded-lg flex items-center justify-between">
            <Text variant="body-sm" className="text-status-error">
              {error}
            </Text>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              Dismiss
            </Button>
          </Box>
        )}

        <CollaborativeEditor
          collabConfig={collab.config}
          connectionStatus={collab.status}
          collaborators={allCollaborators}
          currentUser={user}
          placeholder="Start drafting your email together..."
          onChange={onContentChange}
          onOpenPanel={() => setShowPanel(true)}
          showToolbar
          showCollaborators
          minHeight={300}
        />
      </Box>

      {/* Side panel */}
      {showPanel && (
        <Box className="w-80 flex-shrink-0">
          <CollaborationPanel
            session={session}
            collaborators={allCollaborators}
            pendingInvites={pendingInvites}
            history={history}
            isOwner={isOwner}
            onInvite={handleInvite}
            onRemoveCollaborator={handleRemoveCollaborator}
            onLoadHistory={handleLoadHistory}
            onError={(msg) => setError(msg)}
            onClose={() => setShowPanel(false)}
            loading={historyLoading}
          />
        </Box>
      )}
    </Box>
  );
}

CollaborativeDraftView.displayName = "CollaborativeDraftView";

// ─── Helper: merge API participants with live awareness data ─────────────────

function mergeCollaborators(
  apiParticipants: Collaborator[],
  liveCollaborators: Collaborator[],
  currentUser: { userId: string; name: string; avatarUrl?: string | undefined; cursorColor?: string | undefined },
): Collaborator[] {
  const merged = new Map<string, Collaborator>();

  // Start with API participants (have role info).
  for (const p of apiParticipants) {
    merged.set(p.userId, { ...p, isOnline: false });
  }

  // Add current user.
  if (!merged.has(currentUser.userId)) {
    const entry: Collaborator = {
      userId: currentUser.userId,
      name: currentUser.name,
      cursorColor: currentUser.cursorColor ?? "#3b82f6",
      isOnline: true,
      role: "owner",
    };
    if (currentUser.avatarUrl !== undefined) {
      entry.avatarUrl = currentUser.avatarUrl;
    }
    merged.set(currentUser.userId, entry);
  } else {
    const existing = merged.get(currentUser.userId);
    if (existing) {
      merged.set(currentUser.userId, { ...existing, isOnline: true });
    }
  }

  // Overlay live awareness data.
  for (const lc of liveCollaborators) {
    const existing = merged.get(lc.userId);
    if (existing) {
      merged.set(lc.userId, {
        ...existing,
        isOnline: true,
        cursorColor: lc.cursorColor || existing.cursorColor,
      });
    } else {
      merged.set(lc.userId, lc);
    }
  }

  return Array.from(merged.values());
}
