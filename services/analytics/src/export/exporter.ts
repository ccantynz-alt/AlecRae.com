/**
 * @alecrae/analytics - Data Export
 *
 * Supports CSV, JSON, NDJSON export formats.
 * Scheduled exports and real-time streaming.
 */

import type {
  ExportRequest,
  ExportJob,
  ExportFormat,
  ExportSchedule,
  TrackingEvent,
  EventType,
  ReportFilter,
  StreamConfig,
  Result,
} from "../types";
import { ok, err } from "../types";

// ─── Event Source Interface ─────────────────────────────────────────────────

export interface ExportEventSource {
  /**
   * Stream events matching the given criteria.
   * Returns an async iterable for memory-efficient processing.
   */
  stream(params: {
    accountId: string;
    startDate: Date;
    endDate: Date;
    eventTypes: EventType[];
    filters?: ReportFilter[];
    batchSize: number;
  }): AsyncIterable<TrackingEvent[]>;

  /** Count total events matching criteria (for progress tracking). */
  count(params: {
    accountId: string;
    startDate: Date;
    endDate: Date;
    eventTypes: EventType[];
    filters?: ReportFilter[];
  }): Promise<number>;
}

/** Destination for writing export output. */
export interface ExportDestination {
  /** Open the destination for writing. Returns a writable handle. */
  open(jobId: string, format: ExportFormat): Promise<ExportWriter>;
}

export interface ExportWriter {
  write(chunk: string): Promise<void>;
  close(): Promise<{ url?: string; sizeBytes: number }>;
}

// ─── Format Serializers ─────────────────────────────────────────────────────

interface FieldExtractor {
  name: string;
  extract: (event: TrackingEvent) => string | number | boolean | null;
}

function buildFieldExtractors(fields: string[]): FieldExtractor[] {
  const extractorMap: Record<string, (event: TrackingEvent) => string | number | boolean | null> = {
    id: (e) => e.id,
    message_id: (e) => e.messageId,
    account_id: (e) => e.accountId,
    event_type: (e) => e.eventType,
    recipient: (e) => e.recipient,
    timestamp: (e) => e.timestamp.toISOString(),
    smtp_response: (e) => e.metadata.smtpResponse ?? null,
    mx_host: (e) => e.metadata.mxHost ?? null,
    delivery_time_ms: (e) => e.metadata.deliveryTimeMs ?? null,
    bounce_subtype: (e) => e.metadata.bounceSubtype ?? null,
    bounce_code: (e) => e.metadata.bounceCode ?? null,
    bounce_diagnostic: (e) => e.metadata.bounceDiagnostic ?? null,
    user_agent: (e) => e.metadata.userAgent ?? null,
    ip_address: (e) => e.metadata.ipAddress ?? null,
    device_type: (e) => e.metadata.deviceType ?? null,
    email_client: (e) => e.metadata.emailClient ?? null,
    url: (e) => e.metadata.url ?? null,
    link_index: (e) => e.metadata.linkIndex ?? null,
    link_tag: (e) => e.metadata.linkTag ?? null,
    complaint_type: (e) => e.metadata.complaintType ?? null,
    feedback_id: (e) => e.metadata.feedbackId ?? null,
    campaign_id: (e) => e.metadata.campaignId ?? null,
    tags: (e) => e.metadata.tags?.join(";") ?? null,
    country: (e) => e.metadata.geolocation?.country ?? null,
    region: (e) => e.metadata.geolocation?.region ?? null,
    city: (e) => e.metadata.geolocation?.city ?? null,
  };

  return fields
    .map((f) => {
      const extract = extractorMap[f];
      return extract ? { name: f, extract } : null;
    })
    .filter((v): v is FieldExtractor => v !== null);
}

const DEFAULT_FIELDS = [
  "id", "message_id", "account_id", "event_type", "recipient",
  "timestamp", "campaign_id", "tags",
];

/** Escape a CSV field value. */
function escapeCsv(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatEventCsv(
  event: TrackingEvent,
  extractors: FieldExtractor[],
): string {
  return extractors.map((ext) => escapeCsv(ext.extract(event))).join(",");
}

function formatEventJson(
  event: TrackingEvent,
  extractors: FieldExtractor[],
): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const ext of extractors) {
    obj[ext.name] = ext.extract(event);
  }
  return obj;
}

// ─── Data Exporter ──────────────────────────────────────────────────────────

export class DataExporter {
  private readonly source: ExportEventSource;
  private readonly destination: ExportDestination;
  private readonly jobs = new Map<string, ExportJob>();
  private readonly scheduledExports = new Map<string, { request: ExportRequest; timer: ReturnType<typeof setInterval> }>();

  constructor(source: ExportEventSource, destination: ExportDestination) {
    this.source = source;
    this.destination = destination;
  }

  /**
   * Start an export job. Processes data in streaming fashion
   * for memory efficiency.
   */
  async export(request: ExportRequest): Promise<Result<ExportJob>> {
    const job: ExportJob = {
      id: generateJobId(),
      requestId: request.id,
      status: "pending",
      progress: 0,
      totalRows: 0,
      processedRows: 0,
      fileSizeBytes: 0,
      startedAt: new Date(),
      completedAt: null,
    };

    this.jobs.set(job.id, job);

    // Run export asynchronously
    void this.runExport(job, request).catch((error) => {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : String(error);
    });

    return ok(job);
  }

  /**
   * Get the status of an export job.
   */
  getJobStatus(jobId: string): Result<ExportJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return err(new Error(`Export job not found: ${jobId}`));
    }
    return ok({ ...job });
  }

  /**
   * Cancel a running export job.
   */
  cancelJob(jobId: string): Result<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return err(new Error(`Export job not found: ${jobId}`));
    }
    if (job.status !== "pending" && job.status !== "processing") {
      return err(new Error(`Cannot cancel job in ${job.status} state`));
    }
    job.status = "failed";
    job.error = "Cancelled by user";
    return ok(undefined);
  }

  /**
   * Schedule a recurring export.
   */
  scheduleExport(request: ExportRequest): Result<string> {
    if (!request.schedule) {
      return err(new Error("Export request has no schedule"));
    }

    const scheduleId = `sched-${Date.now().toString(36)}`;
    const schedule = request.schedule;
    const intervalMs = this.getScheduleIntervalMs(schedule);

    const timer = setInterval(() => {
      const now = new Date();
      if (this.shouldRunSchedule(schedule, now)) {
        // Create a new request with updated date range
        const updatedRequest: ExportRequest = {
          ...request,
          id: `${request.id}-${Date.now()}`,
          dateRange: this.computeScheduleDateRange(schedule),
          createdAt: now,
        };
        void this.export(updatedRequest);
      }
    }, intervalMs);

    this.scheduledExports.set(scheduleId, { request, timer });
    return ok(scheduleId);
  }

  /**
   * Cancel a scheduled export.
   */
  cancelSchedule(scheduleId: string): Result<void> {
    const scheduled = this.scheduledExports.get(scheduleId);
    if (!scheduled) {
      return err(new Error(`Schedule not found: ${scheduleId}`));
    }
    clearInterval(scheduled.timer);
    this.scheduledExports.delete(scheduleId);
    return ok(undefined);
  }

  /**
   * List all active export jobs.
   */
  listJobs(_accountId?: string): ExportJob[] {
    const jobs = Array.from(this.jobs.values());
    return jobs.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  /** Stop all scheduled exports and clean up. */
  shutdown(): void {
    for (const [, { timer }] of this.scheduledExports) {
      clearInterval(timer);
    }
    this.scheduledExports.clear();
  }

  // ─── Private Methods ────────────────────────────────────────────────────

  private async runExport(
    job: ExportJob,
    request: ExportRequest,
  ): Promise<void> {
    job.status = "processing";

    // Count total rows for progress tracking
    const totalRows = await this.source.count({
      accountId: request.accountId,
      startDate: request.dateRange.start,
      endDate: request.dateRange.end,
      eventTypes: request.eventTypes,
      ...(request.filters !== undefined ? { filters: request.filters } : {}),
    });

    job.totalRows = totalRows;

    if (totalRows === 0) {
      job.status = "completed";
      job.progress = 100;
      job.completedAt = new Date();
      return;
    }

    const fields = request.fields.length > 0 ? request.fields : DEFAULT_FIELDS;
    const extractors = buildFieldExtractors(fields);
    const writer = await this.destination.open(job.id, request.format);

    try {
      // Write header
      if (request.format === "csv") {
        await writer.write(extractors.map((e) => e.name).join(",") + "\n");
      } else if (request.format === "json") {
        await writer.write("[\n");
      }

      let firstRecord = true;
      const eventStream = this.source.stream({
        accountId: request.accountId,
        startDate: request.dateRange.start,
        endDate: request.dateRange.end,
        eventTypes: request.eventTypes,
        ...(request.filters !== undefined ? { filters: request.filters } : {}),
        batchSize: 1000,
      });

      for await (const batch of eventStream) {
        // Check if job was cancelled (status can be mutated externally)
        if ((job.status as ExportJob["status"]) === "failed") break;

        for (const event of batch) {
          let line: string;

          switch (request.format) {
            case "csv":
              line = formatEventCsv(event, extractors) + "\n";
              break;
            case "ndjson":
              line = JSON.stringify(formatEventJson(event, extractors)) + "\n";
              break;
            case "json":
              line =
                (firstRecord ? "" : ",\n") +
                "  " +
                JSON.stringify(formatEventJson(event, extractors));
              firstRecord = false;
              break;
            default:
              line = JSON.stringify(formatEventJson(event, extractors)) + "\n";
          }

          await writer.write(line);
          job.processedRows++;
        }

        job.progress = Math.round((job.processedRows / totalRows) * 100);
      }

      // Write footer
      if (request.format === "json") {
        await writer.write("\n]\n");
      }

      const result = await writer.close();
      job.fileSizeBytes = result.sizeBytes;
      if (result.url !== undefined) {
        job.outputUrl = result.url;
      }
      job.status = "completed";
      job.progress = 100;
      job.completedAt = new Date();
    } catch (error) {
      try {
        await writer.close();
      } catch {
        // Ignore close errors on failure
      }
      job.status = "failed";
      job.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private getScheduleIntervalMs(_schedule: ExportSchedule): number {
    // Check every hour if a scheduled export should run
    return 3_600_000;
  }

  private shouldRunSchedule(schedule: ExportSchedule, now: Date): boolean {
    if (!schedule.enabled) return false;

    const hour = now.getUTCHours();
    if (hour !== schedule.hour) return false;

    // Only run at the start of the scheduled hour
    if (now.getUTCMinutes() > 5) return false;

    switch (schedule.frequency) {
      case "daily":
        return true;
      case "weekly":
        return now.getUTCDay() === (schedule.dayOfWeek ?? 1);
      case "monthly":
        return now.getUTCDate() === (schedule.dayOfMonth ?? 1);
      default:
        return false;
    }
  }

  private computeScheduleDateRange(
    schedule: ExportSchedule,
  ): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date(end);

    switch (schedule.frequency) {
      case "daily":
        start.setDate(start.getDate() - 1);
        break;
      case "weekly":
        start.setDate(start.getDate() - 7);
        break;
      case "monthly":
        start.setMonth(start.getMonth() - 1);
        break;
    }

    return { start, end };
  }
}

// ─── Real-Time Event Stream ─────────────────────────────────────────────────

export type StreamEventHandler = (events: TrackingEvent[]) => Promise<void>;

/**
 * Real-time event streaming. Buffers events and flushes
 * to registered handlers at configured intervals.
 */
export class EventStream {
  private buffer: TrackingEvent[] = [];
  private handlers: StreamEventHandler[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly config: StreamConfig;
  private running = false;
  private backpressure = false;

  constructor(config?: Partial<StreamConfig>) {
    this.config = {
      batchSize: 100,
      flushIntervalMs: 1000,
      backpressureThreshold: 10_000,
      maxRetries: 3,
      retryDelayMs: 1000,
      ...config,
    };
  }

  /** Register a handler to receive event batches. */
  subscribe(handler: StreamEventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  /** Start the stream processor. */
  start(): void {
    if (this.running) return;
    this.running = true;

    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        void this.flush();
      }
    }, this.config.flushIntervalMs);
  }

  /** Stop the stream processor and flush remaining events. */
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
   * Push an event into the stream.
   * Returns false if backpressure is active.
   */
  push(event: TrackingEvent): boolean {
    if (this.backpressure) return false;

    this.buffer.push(event);

    if (this.buffer.length >= this.config.backpressureThreshold) {
      this.backpressure = true;
    }

    if (this.buffer.length >= this.config.batchSize) {
      void this.flush();
    }

    return true;
  }

  /** Check if backpressure is active. */
  isBackpressured(): boolean {
    return this.backpressure;
  }

  /** Get current buffer depth. */
  getBufferDepth(): number {
    return this.buffer.length;
  }

  // ─── Private Methods ────────────────────────────────────────────────────

  private async flush(): Promise<void> {
    const batch = this.buffer.splice(0, this.config.batchSize);
    if (batch.length === 0) return;

    // Release backpressure if buffer is below threshold
    if (this.backpressure && this.buffer.length < this.config.backpressureThreshold * 0.5) {
      this.backpressure = false;
    }

    // Dispatch to all handlers with retry
    const dispatches = this.handlers.map((handler) =>
      this.dispatchWithRetry(handler, batch),
    );

    await Promise.allSettled(dispatches);
  }

  private async dispatchWithRetry(
    handler: StreamEventHandler,
    batch: TrackingEvent[],
  ): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        await handler(batch);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.config.maxRetries - 1) {
          await sleep(this.config.retryDelayMs * (attempt + 1));
        }
      }
    }

    // All retries exhausted - log and continue
    console.error(
      `[EventStream] Handler failed after ${this.config.maxRetries} retries:`,
      lastError?.message,
    );
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateJobId(): string {
  return `exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
