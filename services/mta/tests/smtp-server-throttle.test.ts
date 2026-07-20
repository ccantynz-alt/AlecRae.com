/**
 * Tests for per-IP abuse throttling on the SMTP listener (Known Issue #78
 * incident, 2026-07-20): a global maxConnections cap alone doesn't stop a
 * single source IP from hammering the port, which is exactly what let an
 * unauthenticated scanner/spammer run unchecked for 9 days.
 *
 * These connect real sockets to a server started on an ephemeral local
 * port — every test client is 127.0.0.1, so all connections share one
 * source IP, which is what the per-IP limiter should react to.
 */

import { describe, it, expect, afterEach } from "bun:test";
import * as net from "node:net";
import { SmtpServer } from "../src/smtp/server.js";

let server: SmtpServer | null = null;

afterEach(async () => {
  if (server) {
    await server.stop();
    server = null;
  }
});

function connectAndAwaitData(port: number, timeoutMs = 500): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    let received = "";
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(received.length > 0 ? received : null);
    }, timeoutMs);

    socket.on("data", (chunk) => {
      received += chunk.toString("utf-8");
      clearTimeout(timer);
      socket.destroy();
      resolve(received);
    });

    socket.on("close", () => {
      clearTimeout(timer);
      resolve(received.length > 0 ? received : null);
    });

    socket.on("error", () => {
      clearTimeout(timer);
      resolve(received.length > 0 ? received : null);
    });
  });
}

describe("SmtpServer per-IP throttling", () => {
  it("bans an IP after it exceeds the new-connection rate window, with no greeting sent", async () => {
    server = new SmtpServer({
      port: 0,
      host: "127.0.0.1",
      maxConnectionsPerIp: 100,
      maxNewConnectionsPerIpPerWindow: 3,
      ipRateWindowMs: 60_000,
      ipBanDurationMs: 60_000,
    });
    const addr = await server.start();

    // First 3 connections are within the window — each should get a greeting.
    for (let i = 0; i < 3; i++) {
      const data = await connectAndAwaitData(addr.port);
      expect(data).not.toBeNull();
      expect(data).toContain("220");
    }

    // The 4th connection within the same window should be banned — socket
    // closes with zero bytes received (no greeting, matching a real
    // Fail2ban-style silent drop).
    const bannedData = await connectAndAwaitData(addr.port, 300);
    expect(bannedData).toBeNull();
  });

  it("rejects a connection once the per-IP concurrent cap is hit", async () => {
    server = new SmtpServer({
      port: 0,
      host: "127.0.0.1",
      maxConnectionsPerIp: 1,
      maxNewConnectionsPerIpPerWindow: 100,
      ipRateWindowMs: 60_000,
      ipBanDurationMs: 60_000,
    });
    const addr = await server.start();

    // Hold the first connection open (don't destroy it) so it still counts
    // toward the concurrent-per-IP limit.
    const held = net.connect(addr.port, "127.0.0.1");
    await new Promise<void>((resolve) => held.once("data", () => resolve()));

    const secondData = await connectAndAwaitData(addr.port, 300);
    expect(secondData).toBeNull();

    held.destroy();
  });

  it("allows a fresh IP-equivalent connection after the concurrent slot frees up", async () => {
    server = new SmtpServer({
      port: 0,
      host: "127.0.0.1",
      maxConnectionsPerIp: 1,
      maxNewConnectionsPerIpPerWindow: 100,
      ipRateWindowMs: 60_000,
      ipBanDurationMs: 60_000,
    });
    const addr = await server.start();

    const first = net.connect(addr.port, "127.0.0.1");
    await new Promise<void>((resolve) => first.once("data", () => resolve()));
    first.destroy();
    // Give the server's 'close' handler a tick to release the slot.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const secondData = await connectAndAwaitData(addr.port);
    expect(secondData).not.toBeNull();
    expect(secondData).toContain("220");
  });
});
