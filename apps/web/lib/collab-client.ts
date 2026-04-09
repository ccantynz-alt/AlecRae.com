/**
 * CollabDraft — browser client for the Vienna collaboration service.
 *
 * Wraps a Y.Doc + Awareness with a managed WebSocket connection that speaks
 * the y-websocket sync/awareness protocol. Local edits are immediate
 * (local-first); the network sync happens in the background.
 *
 * S2: CRDT Real-Time Collaborative Drafting
 *
 * Usage:
 *
 *   const collab = new CollabDraft();
 *   await collab.connect(draftId, jwt, {
 *     sessionId: "abc123",
 *     user: { name: "Craig", color: "#ff7a59", avatarUrl: "..." },
 *   });
 *   const ydoc = collab.getDoc();
 *   const yText = ydoc.getText("body");
 *   yText.insert(0, "Hello team");
 *
 *   // Awareness: live cursors + presence
 *   collab.getAwareness().setLocalStateField("user", {
 *     name: "Craig", color: "#ff7a59"
 *   });
 *
 *   // Listen for collaborator changes
 *   collab.onCollaboratorsChange((collaborators) => {
 *     console.log("Collaborators:", collaborators);
 *   });
 *
 *   collab.disconnect();
 */

import * as Y from "yjs";
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

export type CollabStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

/** User info for awareness state. */
export interface CollabUser {
  name: string;
  color: string;
  avatarUrl?: string | undefined;
}

/** Remote collaborator derived from awareness state. */
export interface RemoteCollaborator {
  clientId: number;
  userId: string;
  name: string;
  color: string;
  avatarUrl?: string | undefined;
  cursor?: { anchor: number; head: number } | null | undefined;
}

export interface CollabDraftOptions {
  /** Override the collab WS base, e.g. wss://collab.48co.ai */
  endpoint?: string | undefined;
  /** Initial reconnect delay in ms (default 500). */
  baseReconnectDelayMs?: number | undefined;
  /** Max reconnect delay in ms (default 30s). */
  maxReconnectDelayMs?: number | undefined;
  /** Listener for status changes (UI badges, etc). */
  onStatus?: ((status: CollabStatus) => void) | undefined;
}

export interface CollabConnectOptions {
  /** Session ID for tracking. */
  sessionId?: string | undefined;
  /** Current user info for awareness. */
  user?: CollabUser | undefined;
}

const DEFAULT_ENDPOINT =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_COLLAB_URL) ||
  "wss://collab.48co.ai";

export class CollabDraft {
  private readonly doc: Y.Doc;
  private readonly awareness: Awareness;
  private ws: WebSocket | null = null;
  private status: CollabStatus = "idle";
  private draftId: string | null = null;
  private token: string | null = null;
  private sessionId: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;
  private collaboratorListeners: Array<
    (collaborators: RemoteCollaborator[]) => void
  > = [];

  private readonly endpoint: string;
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly onStatus: ((status: CollabStatus) => void) | undefined;

  constructor(opts: CollabDraftOptions = {}) {
    this.doc = new Y.Doc();
    this.awareness = new Awareness(this.doc);
    this.endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
    this.baseDelay = opts.baseReconnectDelayMs ?? 500;
    this.maxDelay = opts.maxReconnectDelayMs ?? 30_000;
    this.onStatus = opts.onStatus;

    // Forward local doc updates to the server.
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === "remote") return;
      this.sendSyncUpdate(update);
    });

    // Forward local awareness changes to the server.
    this.awareness.on(
      "update",
      (
        {
          added,
          updated,
          removed,
        }: {
          added: number[];
          updated: number[];
          removed: number[];
        },
        origin: unknown,
      ) => {
        if (origin === "remote") return;
        const changed = added.concat(updated, removed);
        if (changed.length === 0) return;
        this.sendAwarenessUpdate(changed);
      },
    );

    // Notify collaborator listeners when awareness changes.
    this.awareness.on(
      "change",
      () => {
        this.notifyCollaboratorListeners();
      },
    );
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  getDoc(): Y.Doc {
    return this.doc;
  }

  getAwareness(): Awareness {
    return this.awareness;
  }

  getStatus(): CollabStatus {
    return this.status;
  }

  getDraftId(): string | null {
    return this.draftId;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  /** Get the Yjs Text type for the email body. */
  getBodyText(): Y.Text {
    return this.doc.getText("body");
  }

  /** Get the Yjs Text type for the email subject. */
  getSubjectText(): Y.Text {
    return this.doc.getText("subject");
  }

  /** Get the Yjs Map for draft metadata (to, cc, bcc, from). */
  getMetadata(): Y.Map<string> {
    return this.doc.getMap("metadata");
  }

  /** Get all remote collaborators from the awareness state. */
  getRemoteCollaborators(): RemoteCollaborator[] {
    const states = this.awareness.getStates();
    const collaborators: RemoteCollaborator[] = [];

    states.forEach((state: Record<string, unknown>, clientId: number) => {
      // Skip our own client.
      if (clientId === this.doc.clientID) return;

      const user = state.user as
        | {
            userId?: string;
            name?: string;
            color?: string;
            avatarUrl?: string;
          }
        | undefined;
      if (!user) return;

      const cursorRaw = state.cursor as
        | { anchor: number; head: number }
        | null
        | undefined;

      collaborators.push({
        clientId,
        userId: user.userId ?? `client-${clientId}`,
        name: user.name ?? "Anonymous",
        color: user.color ?? "#3b82f6",
        avatarUrl: user.avatarUrl ?? undefined,
        cursor: cursorRaw ?? null,
      });
    });

    return collaborators;
  }

  async connect(
    draftId: string,
    token: string,
    options: CollabConnectOptions = {},
  ): Promise<void> {
    this.draftId = draftId;
    this.token = token;
    this.sessionId = options.sessionId ?? null;
    this.intentionallyClosed = false;

    // Set local awareness state with user info.
    if (options.user) {
      this.awareness.setLocalStateField("user", {
        ...options.user,
        userId: `user-${this.doc.clientID}`,
      });
    }

    this.openSocket();
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // Drop our awareness entry locally so listeners react.
    removeAwarenessStates(
      this.awareness,
      [this.doc.clientID],
      "local-disconnect",
    );
    if (this.ws) {
      try {
        this.ws.close(1000, "client disconnect");
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.setStatus("disconnected");
  }

  destroy(): void {
    this.disconnect();
    this.collaboratorListeners = [];
    this.awareness.destroy();
    this.doc.destroy();
  }

  /** Register a listener for collaborator changes. Returns an unsubscribe fn. */
  onCollaboratorsChange(
    listener: (collaborators: RemoteCollaborator[]) => void,
  ): () => void {
    this.collaboratorListeners.push(listener);
    return () => {
      this.collaboratorListeners = this.collaboratorListeners.filter(
        (l) => l !== listener,
      );
    };
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private notifyCollaboratorListeners(): void {
    const collaborators = this.getRemoteCollaborators();
    for (const listener of this.collaboratorListeners) {
      try {
        listener(collaborators);
      } catch {
        // Don't let listener errors break the loop.
      }
    }
  }

  private setStatus(next: CollabStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.onStatus?.(next);
  }

  private openSocket(): void {
    if (!this.draftId || !this.token) return;
    this.setStatus(
      this.reconnectAttempts > 0 ? "reconnecting" : "connecting",
    );

    const url = `${this.endpoint.replace(/\/$/, "")}/collab/${encodeURIComponent(
      this.draftId,
    )}?token=${encodeURIComponent(this.token)}`;
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus("connected");

      // Initiate sync: send sync step 1 so the server can deliver missing ops.
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(encoder, this.doc);
      ws.send(encoding.toUint8Array(encoder));

      // Push our awareness state so peers see us immediately.
      const localState = this.awareness.getLocalState();
      if (localState) {
        this.sendAwarenessUpdate([this.doc.clientID]);
      }
    };

    ws.onmessage = (ev) => {
      const data = ev.data;
      if (!(data instanceof ArrayBuffer)) return;
      this.handleMessage(new Uint8Array(data));
    };

    ws.onerror = () => {
      // The close handler will fire after this; nothing to do here.
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.intentionallyClosed) {
        this.setStatus("disconnected");
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    this.setStatus("reconnecting");
    const attempt = this.reconnectAttempts++;
    const jitter = Math.random() * 0.3 + 0.85;
    const delay = Math.min(
      this.maxDelay,
      Math.round(this.baseDelay * 2 ** attempt * jitter),
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private handleMessage(message: Uint8Array): void {
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);
    switch (messageType) {
      case MESSAGE_SYNC: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(
          decoder,
          encoder,
          this.doc,
          "remote",
        );
        if (
          encoding.length(encoder) > 1 &&
          this.ws?.readyState === WebSocket.OPEN
        ) {
          this.ws.send(encoding.toUint8Array(encoder));
        }
        break;
      }
      case MESSAGE_AWARENESS: {
        applyAwarenessUpdate(
          this.awareness,
          decoding.readVarUint8Array(decoder),
          "remote",
        );
        break;
      }
      default:
        // Unknown message type — ignore.
        break;
    }
  }

  private sendSyncUpdate(update: Uint8Array): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    this.ws.send(encoding.toUint8Array(encoder));
  }

  private sendAwarenessUpdate(clients: number[]): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      encodeAwarenessUpdate(this.awareness, clients),
    );
    this.ws.send(encoding.toUint8Array(encoder));
  }
}
