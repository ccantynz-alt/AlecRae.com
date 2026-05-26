/**
 * Real-Time WebSocket Connection Manager
 *
 * Singleton that tracks active WebSocket connections by accountId.
 * Used to push real-time events (new emails, status changes, sync progress)
 * to all connected clients for a given account.
 *
 * Event types:
 *   - "email.new"      — a new email has arrived
 *   - "email.sent"     — an email has been queued for delivery
 *   - "email.status"   — delivery status update (delivered, bounced, etc.)
 *   - "sync.progress"  — background sync progress for an account
 */

import type { WSContext } from "hono/ws";

// ─── Event types ───────────────────────────────────────────────────────────

export interface RealtimeEvent {
  type: "email.new" | "email.sent" | "email.status" | "sync.progress";
  payload: Record<string, unknown>;
  timestamp: string;
}

// ─── Connection Manager ────────────────────────────────────────────────────

class ConnectionManager {
  /** Map of accountId → Set of active WebSocket connections */
  private connections: Map<string, Set<WSContext>> = new Map();

  /**
   * Register a new WebSocket connection for an account.
   */
  addConnection(accountId: string, ws: WSContext): void {
    let set = this.connections.get(accountId);
    if (!set) {
      set = new Set();
      this.connections.set(accountId, set);
    }
    set.add(ws);

    console.log(
      `[realtime] Connection added for account ${accountId} (total: ${set.size})`,
    );
  }

  /**
   * Remove a WebSocket connection for an account.
   * Cleans up the account entry if no connections remain.
   */
  removeConnection(accountId: string, ws: WSContext): void {
    const set = this.connections.get(accountId);
    if (!set) return;

    set.delete(ws);

    if (set.size === 0) {
      this.connections.delete(accountId);
    }

    console.log(
      `[realtime] Connection removed for account ${accountId} (remaining: ${set?.size ?? 0})`,
    );
  }

  /**
   * Broadcast an event to all connected clients for a given account.
   * Fire-and-forget — silently removes dead connections.
   */
  broadcast(accountId: string, event: RealtimeEvent): void {
    const set = this.connections.get(accountId);
    if (!set || set.size === 0) return;

    const message = JSON.stringify(event);
    const dead: WSContext[] = [];

    for (const ws of set) {
      try {
        if (ws.readyState === 1) {
          // OPEN
          ws.send(message);
        } else {
          dead.push(ws);
        }
      } catch {
        dead.push(ws);
      }
    }

    // Clean up dead connections
    for (const ws of dead) {
      set.delete(ws);
    }
    if (set.size === 0) {
      this.connections.delete(accountId);
    }
  }

  /**
   * Get the number of active connections for an account.
   */
  getConnectionCount(accountId: string): number {
    return this.connections.get(accountId)?.size ?? 0;
  }

  /**
   * Get the total number of active connections across all accounts.
   */
  getTotalConnectionCount(): number {
    let total = 0;
    for (const set of this.connections.values()) {
      total += set.size;
    }
    return total;
  }

  /**
   * Close all connections. Called during graceful shutdown.
   */
  closeAll(): void {
    for (const [accountId, set] of this.connections) {
      for (const ws of set) {
        try {
          ws.close(1001, "Server shutting down");
        } catch {
          // Best-effort close
        }
      }
      set.clear();
    }
    this.connections.clear();
    console.log("[realtime] All connections closed");
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

const connectionManager = new ConnectionManager();

export function getConnectionManager(): ConnectionManager {
  return connectionManager;
}

export { ConnectionManager };
