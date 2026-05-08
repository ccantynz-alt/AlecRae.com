/**
 * Browser + server tracker — fire signals to /v1/flywheel/signal.
 *
 * Fail-soft: a tracking failure must never break the user-facing feature
 * that fired it. All errors are swallowed (and surfaced to the console
 * in dev only).
 *
 * Browser path uses navigator.sendBeacon when available so signals
 * survive page navigation. Server path uses fetch.
 */

import { SignalPayloadSchema, type SignalPayload } from "./types.js";

export interface TrackerConfig {
  readonly endpoint: string; // e.g. https://api.alecrae.com/v1/flywheel/signal
  readonly authToken?: () => string | null | undefined;
  readonly onError?: (err: unknown) => void;
  readonly buffer?: boolean; // batch sends (default true in browser)
}

interface QueuedSignal {
  readonly payload: SignalPayload;
  readonly capturedAtIso: string;
}

const FLUSH_INTERVAL_MS = 4_000;
const MAX_QUEUE = 50;

export class FlywheelTracker {
  private readonly config: TrackerConfig;
  private queue: QueuedSignal[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly inBrowser: boolean;

  constructor(config: TrackerConfig) {
    this.config = config;
    this.inBrowser =
      typeof window !== "undefined" && typeof navigator !== "undefined";
    if (this.inBrowser) {
      window.addEventListener("pagehide", () => this.flushSync());
      window.addEventListener("beforeunload", () => this.flushSync());
    }
  }

  /**
   * Validate + enqueue (or send immediately when buffering disabled).
   */
  record(payload: SignalPayload): void {
    let parsed: SignalPayload;
    try {
      parsed = SignalPayloadSchema.parse(payload);
    } catch (err) {
      this.fail(err);
      return;
    }

    const queued: QueuedSignal = {
      payload: parsed,
      capturedAtIso: new Date().toISOString(),
    };

    if (this.config.buffer === false) {
      void this.send([queued], /* sync */ false);
      return;
    }

    this.queue.push(queued);
    if (this.queue.length >= MAX_QUEUE) {
      void this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => void this.flush(), FLUSH_INTERVAL_MS);
    }
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    await this.send(batch, /* sync */ false);
  }

  flushSync(): void {
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    void this.send(batch, /* sync */ true);
  }

  private async send(batch: readonly QueuedSignal[], sync: boolean): Promise<void> {
    const body = JSON.stringify({ signals: batch });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = this.config.authToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    if (sync && this.inBrowser && typeof navigator.sendBeacon === "function") {
      try {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon(this.config.endpoint, blob);
      } catch (err) {
        this.fail(err);
      }
      return;
    }

    try {
      await fetch(this.config.endpoint, {
        method: "POST",
        headers,
        body,
        keepalive: this.inBrowser,
      });
    } catch (err) {
      this.fail(err);
    }
  }

  private fail(err: unknown): void {
    if (this.config.onError) this.config.onError(err);
    else if (typeof console !== "undefined" && process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[flywheel] tracker error", err);
    }
  }
}
