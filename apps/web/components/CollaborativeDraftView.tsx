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
} from "@emailed/ui";
import { useCollaborativeDraft } from "../lib/use-collaborative-draft";
import { collaborationApi } from "../lib/api";

export interface CollaborativeDraftViewProps {
  draftId: string;
  sessionId: string;
  token: string;
  session: CollabSessionInfo;
  user: {
    userId: string;
    name: string;
    avatarUrl?: string | undefined;
    cursorColor?: string | undefined;
  };
  isOwner?: boolean | undefined;
  initialParticipants?: Collaborator[] | undefined;
  initialInvites?: CollabInvite[] | undefined;
  apiBaseUrl?: string | undefined;
  apiToken?: string | undefined;
  onSend?: (() => void) | undefined;
  onContentChange?: ((content: { text: string; html: string }) => void) | undefined;
  collabEndpoint?: string | undefined;
  className?: string | undefined;
}

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
  const [pendingInvites, setPendingInvites] = useState<CollabInvite[]>(initialInvites);
  const [history, setHistory] = useState<CollabHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collab = useCollaborativeDraft({
    draftId,
    sessionId,
    token,
    endpoint: collabEndpoint,
    user,
    autoConnect: true,
  });

  const allCollaborators: Collaborator[] = mergeCollaborators(
    initialParticipants,
    collab.collaborators,
    user,
  );

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
      const { data } = await collaborationApi.getHistory(sessionId, { limit: 20, offset });
      setHistory((prev) => [...prev, ...data.entries]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setHistoryLoading(false);
    }
  }, [sessionId, history.length]);

  return (
    <Box className={`flex gap-4 ${className}`}>
      <Box className="flex-1 min-w-0">
        {error && (
          <Box className="mb-3 px-4 py-2 bg-status-error/10 border border-status-error/20 rounded-lg flex items-center justify-between">
            <Text variant="body-sm" className="text-status-error">{error}</Text>
            <Button variant="ghost" size="sm" onClick={() => setError(null)} aria-label="Dismiss error">Dismiss</Button>
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

function mergeCollaborators(
  apiParticipants: Collaborator[],
  liveCollaborators: Collaborator[],
  currentUser: { userId: string; name: string; avatarUrl?: string | undefined; cursorColor?: string | undefined },
): Collaborator[] {
  const merged = new Map<string, Collaborator>();
  for (const p of apiParticipants) merged.set(p.userId, { ...p, isOnline: false });
  if (!merged.has(currentUser.userId)) {
    const entry: Collaborator = {
      userId: currentUser.userId,
      name: currentUser.name,
      cursorColor: currentUser.cursorColor ?? "#3b82f6",
      isOnline: true,
      role: "owner",
    };
    if (currentUser.avatarUrl !== undefined) entry.avatarUrl = currentUser.avatarUrl;
    merged.set(currentUser.userId, entry);
  } else {
    const existing = merged.get(currentUser.userId);
    if (existing) merged.set(currentUser.userId, { ...existing, isOnline: true });
  }
  for (const lc of liveCollaborators) {
    const existing = merged.get(lc.userId);
    if (existing) {
      merged.set(lc.userId, { ...existing, isOnline: true, cursorColor: lc.cursorColor || existing.cursorColor });
    } else {
      merged.set(lc.userId, lc);
    }
  }
  return Array.from(merged.values());
}
