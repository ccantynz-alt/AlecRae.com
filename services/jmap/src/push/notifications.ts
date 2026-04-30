import type { JmapId, PushSubscription, StateChange } from "../types.js";

/**
 * Push notification support for real-time updates.
 * Implements JMAP push via EventSource (SSE) and WebSocket.
 */

// --- Subscription Manager ---

interface SubscriptionEntry {
  subscription: PushSubscription;
  accountId: JmapId;
  verified: boolean;
  createdAt: Date;
}

export class PushNotificationService {
  private subscriptions = new Map<JmapId, SubscriptionEntry>();
  private eventSourceClients = new Map<string, EventSourceClient>();
  private webSocketClients = new Map<string, WebSocketClient>();
  private stateVersions = new Map<string, Map<string, string>>(); // accountId -> (type -> state)

  // --- Push Subscription Management (RFC 8620 Section 7.2) ---

  createSubscription(
    accountId: JmapId,
    input: Omit<PushSubscription, "id" | "verificationCode">,
  ): PushSubscription {
    const id = this.generateId();
    const verificationCode = this.generateVerificationCode();

    const subscription: PushSubscription = {
      id,
      deviceClientId: input.deviceClientId,
      url: input.url,
      keys: input.keys,
      verificationCode,
      expires: input.expires,
      types: input.types,
    };

    this.subscriptions.set(id, {
      subscription,
      accountId,
      verified: false,
      createdAt: new Date(),
    });

    // Send verification request to the push URL
    this.sendVerification(subscription).catch((err) => {
      console.error(`[Push] Verification failed for ${id}:`, err);
    });

    return subscription;
  }

  getSubscription(id: JmapId): PushSubscription | null {
    return this.subscriptions.get(id)?.subscription ?? null;
  }

  updateSubscription(id: JmapId, updates: Partial<PushSubscription>): PushSubscription | null {
    const entry = this.subscriptions.get(id);
    if (!entry) return null;

    if (updates.expires !== undefined) entry.subscription.expires = updates.expires;
    if (updates.types !== undefined) entry.subscription.types = updates.types;

    return entry.subscription;
  }

  destroySubscription(id: JmapId): boolean {
    return this.subscriptions.delete(id);
  }

  /**
   * Verify a push subscription with the provided verification code.
   */
  verifySubscription(id: JmapId, code: string): boolean {
    const entry = this.subscriptions.get(id);
    if (!entry) return false;

    if (entry.subscription.verificationCode === code) {
      entry.verified = true;
      return true;
    }
    return false;
  }

  // --- EventSource (SSE) Support (RFC 8620 Section 7.3) ---

  /**
   * Register an EventSource client for server-sent events.
   */
  registerEventSource(
    clientId: string,
    accountId: JmapId,
    options: {
      types?: string[];
      closeAfter?: "state" | "no";
      pingInterval?: number;
    },
  ): EventSourceClient {
    const client = new EventSourceClient(clientId, accountId, options);
    this.eventSourceClients.set(clientId, client);

    // Start ping interval if requested
    if (options.pingInterval && options.pingInterval > 0) {
      client.startPing(options.pingInterval);
    }

    return client;
  }

  /**
   * Unregister an EventSource client.
   */
  removeEventSource(clientId: string): void {
    const client = this.eventSourceClients.get(clientId);
    if (client) {
      client.close();
      this.eventSourceClients.delete(clientId);
    }
  }

  // --- WebSocket Support ---

  /**
   * Register a WebSocket client for bidirectional push.
   */
  registerWebSocket(
    clientId: string,
    accountId: JmapId,
    options: { types?: string[] },
  ): WebSocketClient {
    const client = new WebSocketClient(clientId, accountId, options);
    this.webSocketClients.set(clientId, client);
    return client;
  }

  /**
   * Unregister a WebSocket client.
   */
  removeWebSocket(clientId: string): void {
    const client = this.webSocketClients.get(clientId);
    if (client) {
      client.close();
      this.webSocketClients.delete(clientId);
    }
  }

  // --- State Change Notification ---

  /**
   * Notify all connected clients of a state change.
   * Called when any JMAP object is modified.
   */
  async notifyStateChange(accountId: JmapId, changes: Record<string, string>): Promise<void> {
    // Update stored state versions
    let accountStates = this.stateVersions.get(accountId);
    if (!accountStates) {
      accountStates = new Map();
      this.stateVersions.set(accountId, accountStates);
    }
    for (const [type, state] of Object.entries(changes)) {
      accountStates.set(type, state);
    }

    const stateChange: StateChange = {
      "@type": "StateChange",
      changed: {
        [accountId]: changes,
      },
    };

    // Notify EventSource clients
    for (const client of this.eventSourceClients.values()) {
      if (client.accountId !== accountId) continue;
      if (client.shouldReceive(changes)) {
        client.send(stateChange);
      }
    }

    // Notify WebSocket clients
    for (const client of this.webSocketClients.values()) {
      if (client.accountId !== accountId) continue;
      if (client.shouldReceive(changes)) {
        client.send(stateChange);
      }
    }

    // Send to verified push subscriptions
    await this.pushToSubscriptions(accountId, stateChange);
  }

  /**
   * Send state change to push subscription endpoints.
   */
  private async pushToSubscriptions(accountId: JmapId, stateChange: StateChange): Promise<void> {
    for (const entry of this.subscriptions.values()) {
      if (entry.accountId !== accountId) continue;
      if (!entry.verified) continue;

      // Check expiry
      if (entry.subscription.expires) {
        const expiry = new Date(entry.subscription.expires);
        if (expiry < new Date()) {
          this.subscriptions.delete(entry.subscription.id);
          continue;
        }
      }

      // Check type filter
      const types = entry.subscription.types;
      if (types) {
        const changedTypes = Object.keys(stateChange.changed[accountId] ?? {});
        const hasMatch = changedTypes.some((t) => types.includes(t));
        if (!hasMatch) continue;
      }

      try {
        // In production: use Web Push protocol with encryption if keys are provided
        await fetch(entry.subscription.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "TTL": "86400",
          },
          body: JSON.stringify(stateChange),
        });
      } catch (err) {
        console.error(`[Push] Failed to push to ${entry.subscription.url}:`, err);
      }
    }
  }

  private async sendVerification(subscription: PushSubscription): Promise<void> {
    // In production: send a PushVerification object to the subscription URL
    const verification = {
      "@type": "PushVerification",
      pushSubscriptionId: subscription.id,
      verificationCode: subscription.verificationCode,
    };

    try {
      await fetch(subscription.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(verification),
      });
    } catch {
      // Verification delivery failed; client must retry
    }
  }

  private generateId(): JmapId {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return "ps_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  private generateVerificationCode(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Get connection statistics.
   */
  getStats(): {
    subscriptions: number;
    verifiedSubscriptions: number;
    eventSourceClients: number;
    webSocketClients: number;
  } {
    let verified = 0;
    for (const entry of this.subscriptions.values()) {
      if (entry.verified) verified++;
    }

    return {
      subscriptions: this.subscriptions.size,
      verifiedSubscriptions: verified,
      eventSourceClients: this.eventSourceClients.size,
      webSocketClients: this.webSocketClients.size,
    };
  }
}

// --- EventSource Client ---

export class EventSourceClient {
  private listeners: ((data: string) => void)[] = [];
  private pingTimer?: ReturnType<typeof setInterval>;
  private closed = false;

  constructor(
    public readonly clientId: string,
    public readonly accountId: JmapId,
    private readonly options: {
      types?: string[];
      closeAfter?: "state" | "no";
      pingInterval?: number;
    },
  ) {}

  /**
   * Register a listener for SSE data events.
   */
  onData(listener: (data: string) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Send a state change event to the client.
   */
  send(stateChange: StateChange): void {
    if (this.closed) return;

    const sseData = this.formatSSE("state", JSON.stringify(stateChange));
    for (const listener of this.listeners) {
      listener(sseData);
    }

    if (this.options.closeAfter === "state") {
      this.close();
    }
  }

  /**
   * Check if this client should receive changes for the given types.
   */
  shouldReceive(changes: Record<string, string>): boolean {
    const types = this.options.types;
    if (!types) return true;
    return Object.keys(changes).some((type) => types.includes(type));
  }

  startPing(intervalSeconds: number): void {
    this.pingTimer = setInterval(() => {
      if (this.closed) return;
      const pingData = this.formatSSE("ping", new Date().toISOString());
      for (const listener of this.listeners) {
        listener(pingData);
      }
    }, intervalSeconds * 1000);
  }

  close(): void {
    this.closed = true;
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      delete this.pingTimer;
    }
    this.listeners = [];
  }

  private formatSSE(event: string, data: string): string {
    return `event: ${event}\ndata: ${data}\n\n`;
  }

  isClosed(): boolean {
    return this.closed;
  }
}

// --- WebSocket Client ---

export class WebSocketClient {
  private listeners: ((data: string) => void)[] = [];
  private closed = false;

  constructor(
    public readonly clientId: string,
    public readonly accountId: JmapId,
    private readonly options: { types?: string[] },
  ) {}

  /**
   * Register a listener for outgoing messages.
   */
  onMessage(listener: (data: string) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Send a state change to the WebSocket client.
   */
  send(stateChange: StateChange): void {
    if (this.closed) return;

    const data = JSON.stringify(stateChange);
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  /**
   * Check if this client should receive changes for the given types.
   */
  shouldReceive(changes: Record<string, string>): boolean {
    const types = this.options.types;
    if (!types) return true;
    return Object.keys(changes).some((type) => types.includes(type));
  }

  /**
   * Handle an incoming message from the WebSocket client.
   * Supports enabling/disabling push for specific types.
   */
  handleIncoming(message: string): void {
    try {
      const parsed = JSON.parse(message);
      if (parsed["@type"] === "WebSocketPushEnable") {
        this.options.types = parsed.dataTypes ?? null;
      } else if (parsed["@type"] === "WebSocketPushDisable") {
        this.close();
      }
    } catch {
      // Ignore malformed messages
    }
  }

  close(): void {
    this.closed = true;
    this.listeners = [];
  }

  isClosed(): boolean {
    return this.closed;
  }
}
