/**
 * @emailed/analytics - Event Tracking
 *
 * Handles open (pixel tracking), click (link rewriting), delivery, bounce,
 * and complaint events. High-throughput event ingestion with batching
 * and deduplication.
 */

import type {
  TrackingEvent,
  TrackingPixel,
  TrackedLink,
  EventBatch,
  IngestionStats,
  IngestionConfig,
  GeoLocation,
  Result,
} from "../types";
import { ok, err } from "../types";

// ─── Tracking Pixel & Link Generation ───────────────────────────────────────

const TRACKING_BASE_URL = process.env.TRACKING_BASE_URL ?? "https://t.emailed.dev";

/**
 * Generate a 1x1 tracking pixel URL for open tracking.
 * The pixel encodes the message ID and recipient for attribution.
 */
export function generateTrackingPixel(
  messageId: string,
  accountId: string,
  recipient: string,
): TrackingPixel {
  const token = encodeTrackingToken(messageId, accountId, recipient);
  return {
    messageId,
    accountId,
    recipient,
    url: `${TRACKING_BASE_URL}/o/${token}.gif`,
    createdAt: new Date(),
  };
}

/**
 * Generate tracking pixel HTML to embed in email body.
 */
export function generatePixelHtml(pixel: TrackingPixel): string {
  return `<img src="${pixel.url}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;
}

/**
 * Rewrite a URL for click tracking. Returns a redirect URL that logs
 * the click before forwarding to the original destination.
 */
export function rewriteLink(
  originalUrl: string,
  messageId: string,
  accountId: string,
  linkIndex: number,
  tag?: string,
): TrackedLink {
  const id = generateLinkId();
  const token = encodeTrackingToken(messageId, accountId, originalUrl);
  const trackingUrl = `${TRACKING_BASE_URL}/c/${token}`;

  return {
    id,
    messageId,
    accountId,
    originalUrl,
    trackingUrl,
    linkIndex,
    ...(tag !== undefined ? { tag } : {}),
    createdAt: new Date(),
  };
}

/**
 * Rewrite all links in an HTML email body for click tracking.
 */
export function rewriteAllLinks(
  html: string,
  messageId: string,
  accountId: string,
): { html: string; links: TrackedLink[] } {
  const links: TrackedLink[] = [];
  let linkIndex = 0;

  // Match href attributes in anchor tags
  const rewritten = html.replace(
    /<a\s+([^>]*?)href\s*=\s*"(https?:\/\/[^"]+)"([^>]*?)>/gi,
    (match, before, url, after) => {
      // Don't rewrite unsubscribe or mailto links
      if (url.startsWith("mailto:") || url.includes("unsubscribe")) {
        return match;
      }

      // Extract data-tag attribute if present
      const tagMatch = (before + after).match(/data-track-tag\s*=\s*"([^"]+)"/);
      const tag = tagMatch?.[1];

      const tracked = rewriteLink(url, messageId, accountId, linkIndex, tag);
      links.push(tracked);
      linkIndex++;

      return `<a ${before}href="${tracked.trackingUrl}"${after}>`;
    },
  );

  return { html: rewritten, links };
}

// ─── User Agent Parsing ─────────────────────────────────────────────────────

interface ParsedUserAgent {
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  emailClient: string;
}

export function parseUserAgent(ua: string): ParsedUserAgent {
  const lower = ua.toLowerCase();

  // Email client detection
  let emailClient = "unknown";
  if (lower.includes("thunderbird")) emailClient = "Thunderbird";
  else if (lower.includes("outlook") || lower.includes("microsoft")) emailClient = "Outlook";
  else if (lower.includes("apple mail") || lower.includes("webkit") && lower.includes("macintosh")) emailClient = "Apple Mail";
  else if (lower.includes("gmail")) emailClient = "Gmail";
  else if (lower.includes("yahoo")) emailClient = "Yahoo Mail";
  else if (lower.includes("googleimageproxy")) emailClient = "Gmail (image proxy)";

  // Device type detection
  let deviceType: ParsedUserAgent["deviceType"] = "unknown";
  if (lower.includes("mobile") || lower.includes("iphone") || lower.includes("android") && !lower.includes("tablet")) {
    deviceType = "mobile";
  } else if (lower.includes("ipad") || lower.includes("tablet")) {
    deviceType = "tablet";
  } else if (lower.includes("windows") || lower.includes("macintosh") || lower.includes("linux")) {
    deviceType = "desktop";
  }

  return { deviceType, emailClient };
}

// ─── Event Creation Helpers ─────────────────────────────────────────────────

export function createDeliveryEvent(
  messageId: string,
  accountId: string,
  recipient: string,
  metadata: {
    smtpResponse: string;
    mxHost: string;
    deliveryTimeMs: number;
    campaignId?: string;
    tags?: string[];
  },
): TrackingEvent {
  return {
    id: generateEventId(),
    messageId,
    accountId,
    eventType: "delivery",
    recipient,
    timestamp: new Date(),
    metadata: {
      smtpResponse: metadata.smtpResponse,
      mxHost: metadata.mxHost,
      deliveryTimeMs: metadata.deliveryTimeMs,
      ...(metadata.campaignId !== undefined ? { campaignId: metadata.campaignId } : {}),
      ...(metadata.tags !== undefined ? { tags: metadata.tags } : {}),
    },
  };
}

export function createBounceEvent(
  messageId: string,
  accountId: string,
  recipient: string,
  metadata: {
    bounceSubtype: "hard" | "soft" | "block" | "undetermined";
    bounceCode: string;
    bounceDiagnostic: string;
    mxHost?: string;
    campaignId?: string;
    tags?: string[];
  },
): TrackingEvent {
  return {
    id: generateEventId(),
    messageId,
    accountId,
    eventType: "bounce",
    recipient,
    timestamp: new Date(),
    metadata,
  };
}

export function createOpenEvent(
  messageId: string,
  accountId: string,
  recipient: string,
  metadata: {
    userAgent: string;
    ipAddress: string;
    geolocation?: GeoLocation;
    campaignId?: string;
    tags?: string[];
  },
): TrackingEvent {
  const parsed = parseUserAgent(metadata.userAgent);

  return {
    id: generateEventId(),
    messageId,
    accountId,
    eventType: "open",
    recipient,
    timestamp: new Date(),
    metadata: {
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
      deviceType: parsed.deviceType,
      emailClient: parsed.emailClient,
      ...(metadata.geolocation !== undefined ? { geolocation: metadata.geolocation } : {}),
      ...(metadata.campaignId !== undefined ? { campaignId: metadata.campaignId } : {}),
      ...(metadata.tags !== undefined ? { tags: metadata.tags } : {}),
    },
  };
}

export function createClickEvent(
  messageId: string,
  accountId: string,
  recipient: string,
  metadata: {
    url: string;
    linkIndex: number;
    linkTag?: string;
    userAgent: string;
    ipAddress: string;
    geolocation?: GeoLocation;
    campaignId?: string;
    tags?: string[];
  },
): TrackingEvent {
  const parsed = parseUserAgent(metadata.userAgent);

  return {
    id: generateEventId(),
    messageId,
    accountId,
    eventType: "click",
    recipient,
    timestamp: new Date(),
    metadata: {
      url: metadata.url,
      linkIndex: metadata.linkIndex,
      ...(metadata.linkTag !== undefined ? { linkTag: metadata.linkTag } : {}),
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
      deviceType: parsed.deviceType,
      emailClient: parsed.emailClient,
      ...(metadata.geolocation !== undefined ? { geolocation: metadata.geolocation } : {}),
      ...(metadata.campaignId !== undefined ? { campaignId: metadata.campaignId } : {}),
      ...(metadata.tags !== undefined ? { tags: metadata.tags } : {}),
    },
  };
}

export function createComplaintEvent(
  messageId: string,
  accountId: string,
  recipient: string,
  metadata: {
    complaintType: "abuse" | "fraud" | "virus" | "other";
    feedbackId: string;
    campaignId?: string;
    tags?: string[];
  },
): TrackingEvent {
  return {
    id: generateEventId(),
    messageId,
    accountId,
    eventType: "complaint",
    recipient,
    timestamp: new Date(),
    metadata,
  };
}

// ─── Event Ingestion Pipeline ───────────────────────────────────────────────

export interface EventSink {
  write(events: TrackingEvent[]): Promise<void>;
}

/**
 * High-throughput event ingestion pipeline with batching,
 * deduplication, and backpressure handling.
 */
export class EventIngestionPipeline {
  private buffer: TrackingEvent[] = [];
  private readonly seen = new Map<string, number>(); // eventId -> timestamp for dedup
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly sinks: EventSink[];
  private readonly config: IngestionConfig;
  private stats: IngestionStats;
  private running = false;

  constructor(sinks: EventSink[], config?: Partial<IngestionConfig>) {
    this.sinks = sinks;
    this.config = {
      batchSize: 500,
      flushIntervalMs: 1000,
      maxQueueSize: 50_000,
      deduplicationWindowMs: 300_000, // 5 minutes
      workers: 4,
      ...config,
    };
    this.stats = {
      eventsReceived: 0,
      eventsProcessed: 0,
      eventsFailed: 0,
      eventsPerSecond: 0,
      avgProcessingTimeMs: 0,
      lastEventAt: null,
    };
  }

  /** Start the ingestion pipeline. */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Periodic flush
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        void this.flush();
      }
      this.cleanDeduplicationCache();
    }, this.config.flushIntervalMs);

    // Rate calculation interval
    setInterval(() => {
      // Simple EPS based on recent processed count
      this.stats.eventsPerSecond = this.stats.eventsProcessed / Math.max(1, Date.now() / 1000);
    }, 5000);
  }

  /** Stop the ingestion pipeline and flush remaining events. */
  async stop(): Promise<void> {
    this.running = false;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer.length > 0) {
      await this.flush();
    }
  }

  /**
   * Ingest a single event. Events are buffered and flushed
   * in batches for throughput.
   */
  ingest(event: TrackingEvent): Result<void> {
    if (!this.running) {
      return err(new Error("Pipeline is not running"));
    }

    if (this.buffer.length >= this.config.maxQueueSize) {
      return err(new Error("Event queue is full - backpressure"));
    }

    // Deduplication check
    if (this.seen.has(event.id)) {
      return ok(undefined); // Silently deduplicate
    }

    this.seen.set(event.id, Date.now());
    this.buffer.push(event);
    this.stats.eventsReceived++;
    this.stats.lastEventAt = new Date();

    // Auto-flush if batch is full
    if (this.buffer.length >= this.config.batchSize) {
      void this.flush();
    }

    return ok(undefined);
  }

  /**
   * Ingest a batch of events at once.
   */
  ingestBatch(batch: EventBatch): Result<{ accepted: number; deduplicated: number }> {
    if (!this.running) {
      return err(new Error("Pipeline is not running"));
    }

    let accepted = 0;
    let deduplicated = 0;

    for (const event of batch.events) {
      if (this.seen.has(event.id)) {
        deduplicated++;
        continue;
      }

      if (this.buffer.length >= this.config.maxQueueSize) {
        break;
      }

      this.seen.set(event.id, Date.now());
      this.buffer.push(event);
      accepted++;
    }

    this.stats.eventsReceived += accepted;
    this.stats.lastEventAt = new Date();

    if (this.buffer.length >= this.config.batchSize) {
      void this.flush();
    }

    return ok({ accepted, deduplicated });
  }

  /** Get current ingestion stats. */
  getStats(): IngestionStats {
    return { ...this.stats };
  }

  /** Get current queue depth. */
  getQueueDepth(): number {
    return this.buffer.length;
  }

  // ─── Private Methods ────────────────────────────────────────────────────

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    // Grab the current batch and reset buffer
    const batch = this.buffer.splice(0, this.config.batchSize);
    const startTime = Date.now();

    try {
      // Write to all sinks in parallel
      await Promise.all(
        this.sinks.map((sink) => sink.write(batch)),
      );

      this.stats.eventsProcessed += batch.length;
      const duration = Date.now() - startTime;
      // Running average of processing time
      this.stats.avgProcessingTimeMs =
        this.stats.avgProcessingTimeMs * 0.9 + duration * 0.1;
    } catch {
      this.stats.eventsFailed += batch.length;
      // On failure, put events back in buffer for retry (at the front)
      this.buffer.unshift(...batch);
    }
  }

  private cleanDeduplicationCache(): void {
    const cutoff = Date.now() - this.config.deduplicationWindowMs;
    for (const [id, timestamp] of this.seen) {
      if (timestamp < cutoff) {
        this.seen.delete(id);
      }
    }
  }
}

// ─── Event Processing & Enrichment ──────────────────────────────────────────

/**
 * Decode a tracking pixel/link request back to its components.
 */
export function decodeTrackingToken(
  token: string,
): Result<{ messageId: string; accountId: string; payload: string }> {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split("|");
    const messageId = parts[0];
    const accountId = parts[1];
    if (parts.length < 3 || messageId === undefined || accountId === undefined) {
      return err(new Error("Invalid tracking token format"));
    }
    return ok({
      messageId,
      accountId,
      payload: parts.slice(2).join("|"),
    });
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function encodeTrackingToken(
  messageId: string,
  accountId: string,
  payload: string,
): string {
  const raw = `${messageId}|${accountId}|${payload}`;
  return Buffer.from(raw, "utf-8").toString("base64url");
}

let eventCounter = 0;

function generateEventId(): string {
  eventCounter++;
  const ts = Date.now().toString(36);
  const counter = eventCounter.toString(36).padStart(6, "0");
  const random = Math.random().toString(36).slice(2, 6);
  return `evt-${ts}-${counter}-${random}`;
}

function generateLinkId(): string {
  return `lnk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
