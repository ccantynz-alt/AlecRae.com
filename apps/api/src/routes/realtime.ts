/**
 * Real-Time WebSocket Route — Push Notifications for Email Events
 *
 * GET /v1/realtime?token=<JWT> — WebSocket upgrade endpoint
 *
 * Authentication is via query param `token` because the WebSocket API
 * does not support custom Authorization headers during the upgrade handshake.
 *
 * On connection:
 *   - Verify JWT from `token` query param
 *   - Extract accountId from JWT payload
 *   - Register connection with ConnectionManager
 *
 * On message:
 *   - Handle ping/pong keepalive
 *
 * On close:
 *   - Remove connection from ConnectionManager
 */

import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import type { WSContext } from "hono/ws";
import { verifyAccessToken } from "../lib/jwt.js";
import { getConnectionManager } from "../lib/realtime.js";

// ─── Create the Bun WebSocket adapter ──────────────────────────────────────

const { upgradeWebSocket, websocket: bunWebSocket } = createBunWebSocket();

// ─── Route ─────────────────────────────────────────────────────────────────

const realtime = new Hono();

realtime.get(
  "/",
  upgradeWebSocket(async (c) => {
    // Extract token from query param
    const token = c.req.query("token");

    // We will verify the token and store accountId in a closure variable.
    // If auth fails, we close the connection in onOpen.
    let accountId: string | null = null;
    let authError: string | null = null;

    if (!token) {
      authError = "Missing token query parameter";
    } else {
      try {
        const payload = await verifyAccessToken(token);
        accountId = payload.sub as string;
        if (!accountId) {
          authError = "Token missing subject (accountId)";
        }
      } catch {
        authError = "Invalid or expired token";
      }
    }

    return {
      onOpen(_evt: Event, ws: WSContext): void {
        if (authError || !accountId) {
          // Send error message and close
          try {
            ws.send(
              JSON.stringify({
                type: "error",
                payload: {
                  code: "auth_failed",
                  message: authError ?? "Authentication failed",
                },
                timestamp: new Date().toISOString(),
              }),
            );
          } catch {
            // Best effort
          }
          ws.close(4401, authError ?? "Authentication failed");
          return;
        }

        const manager = getConnectionManager();
        manager.addConnection(accountId, ws);

        // Send a welcome message confirming the connection
        ws.send(
          JSON.stringify({
            type: "connected",
            payload: { accountId },
            timestamp: new Date().toISOString(),
          }),
        );
      },

      onMessage(evt: MessageEvent, ws: WSContext): void {
        if (!accountId) return;

        try {
          const data =
            typeof evt.data === "string"
              ? evt.data
              : new TextDecoder().decode(evt.data as ArrayBuffer);
          const msg = JSON.parse(data) as { type?: string };

          // Handle ping/pong keepalive
          if (msg.type === "ping") {
            ws.send(
              JSON.stringify({
                type: "pong",
                timestamp: new Date().toISOString(),
              }),
            );
          }
        } catch {
          // Ignore malformed messages
        }
      },

      onClose(_evt: CloseEvent, ws: WSContext): void {
        if (!accountId) return;

        const manager = getConnectionManager();
        manager.removeConnection(accountId, ws);
      },

      onError(_evt: Event, ws: WSContext): void {
        if (!accountId) return;

        const manager = getConnectionManager();
        manager.removeConnection(accountId, ws);
      },
    };
  }),
);

export { realtime, bunWebSocket };
