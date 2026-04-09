/**
 * useCollaborativeDraft — React hook that wires CollabDraft (Yjs client)
 * to the CollaborativeEditor component.
 *
 * Manages the full lifecycle: connect, sync, awareness, reconnect, destroy.
 * Returns everything the CollaborativeEditor and CollaborationPanel need.
 *
 * S2: CRDT Real-Time Collaborative Drafting
 *
 * Usage:
 *
 *   const collab = useCollaborativeDraft({
 *     draftId: "abc123",
 *     sessionId: "sess_xyz",
 *     token: "eyJhbGci...",
 *     user: { name: "Craig", color: "#3b82f6" },
 *   });
 *
 *   <CollaborativeEditor
 *     collabConfig={collab.config}
 *     connectionStatus={collab.status}
 *     collaborators={collab.collaborators}
 *     currentUser={collab.currentUser}
 *   />
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  CollabDraft,
  type CollabStatus,
  type CollabUser,
  type RemoteCollaborator,
} from "./collab-client";
import type {
  Collaborator,
  ConnectionStatus,
  CollaborativeEditorConfig,
} from "@emailed/ui";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UseCollaborativeDraftOptions {
  /** Draft ID to collaborate on. Null means standalone (no collab). */
  draftId: string | null;
  /** Collaboration session ID. */
  sessionId: string | null;
  /** JWT token for the collab service. */
  token: string | null;
  /** WebSocket endpoint override. */
  endpoint?: string | undefined;
  /** Current user info. */
  user: {
    userId: string;
    name: string;
    avatarUrl?: string | undefined;
    cursorColor?: string | undefined;
  };
  /** Auto-connect on mount when all required params are set. */
  autoConnect?: boolean | undefined;
}

export interface UseCollaborativeDraftReturn {
  /** Config to pass to CollaborativeEditor. Null if not collaborative. */
  config: CollaborativeEditorConfig | null;
  /** Current connection status. */
  status: ConnectionStatus;
  /** Remote collaborators (from awareness). */
  collaborators: Collaborator[];
  /** Current user info (for awareness / UI). */
  currentUser: UseCollaborativeDraftOptions["user"];
  /** The underlying CollabDraft instance (for advanced usage). */
  client: CollabDraft | null;
  /** Connect to the collab service. */
  connect: () => void;
  /** Disconnect from the collab service. */
  disconnect: () => void;
  /** Whether we are currently connected. */
  isConnected: boolean;
}

// ─── Map CollabStatus -> ConnectionStatus ────────────────────────────────────

function mapStatus(s: CollabStatus): ConnectionStatus {
  switch (s) {
    case "idle":
      return "idle";
    case "connecting":
      return "connecting";
    case "connected":
      return "connected";
    case "reconnecting":
      return "reconnecting";
    case "disconnected":
      return "disconnected";
    default:
      return "idle";
  }
}

// ─── Map RemoteCollaborator -> Collaborator ──────────────────────────────────

function mapCollaborator(rc: RemoteCollaborator): Collaborator {
  return {
    userId: rc.userId,
    name: rc.name,
    ...(rc.avatarUrl !== undefined ? { avatarUrl: rc.avatarUrl } : {}),
    cursorColor: rc.color,
    isOnline: true, // all remote collaborators in awareness are online
    role: "editor", // default; real role comes from the API
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCollaborativeDraft(
  opts: UseCollaborativeDraftOptions,
): UseCollaborativeDraftReturn {
  const clientRef = useRef<CollabDraft | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);

  const { draftId, sessionId, token, endpoint, user, autoConnect = true } = opts;

  // Create CollabDraft instance on mount.
  useEffect(() => {
    const client = new CollabDraft({
      ...(endpoint !== undefined ? { endpoint } : {}),
      onStatus: (s: CollabStatus) => setStatus(mapStatus(s)),
    });

    client.onCollaboratorsChange((remotes) => {
      setCollaborators(remotes.map(mapCollaborator));
    });

    clientRef.current = client;

    return () => {
      client.destroy();
      clientRef.current = null;
    };
    // We intentionally only create once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-connect when all params are available.
  useEffect(() => {
    if (!autoConnect || !draftId || !token || !clientRef.current) return;

    const client = clientRef.current;
    const connectUser: CollabUser = {
      name: user.name,
      color: user.cursorColor ?? "#3b82f6",
      ...(user.avatarUrl !== undefined ? { avatarUrl: user.avatarUrl } : {}),
    };
    void client.connect(draftId, token, {
      ...(sessionId !== null ? { sessionId } : {}),
      user: connectUser,
    });

    return () => {
      client.disconnect();
    };
    // Re-connect if draftId or token changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, draftId, token, sessionId]);

  const connect = useCallback(() => {
    const client = clientRef.current;
    if (!client || !draftId || !token) return;
    const connectUser: CollabUser = {
      name: user.name,
      color: user.cursorColor ?? "#3b82f6",
      ...(user.avatarUrl !== undefined ? { avatarUrl: user.avatarUrl } : {}),
    };
    void client.connect(draftId, token, {
      ...(sessionId !== null ? { sessionId } : {}),
      user: connectUser,
    });
  }, [draftId, token, sessionId, user]);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  // Build the config object for CollaborativeEditor.
  const config: CollaborativeEditorConfig | null =
    draftId && sessionId && token
      ? {
          websocketUrl: `${(endpoint ?? "wss://collab.48co.ai").replace(/\/$/, "")}/collab/${draftId}?token=${encodeURIComponent(token)}`,
          token,
          sessionId,
          draftId,
        }
      : null;

  return {
    config,
    status,
    collaborators,
    currentUser: user,
    client: clientRef.current,
    connect,
    disconnect,
    isConnected: status === "connected",
  };
}
