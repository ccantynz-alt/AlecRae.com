/**
 * @alecrae/analytics - TypeScript type definitions
 * All types for the Analytics service.
 */

// ─── Result Type ────────────────────────────────────────────────────────────

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ─── Event Types ────────────────────────────────────────────────────────────

export type EventType =
  | "delivery"
  | "bounce"
  | "open"
  | "click"
  | "complaint"
  | "unsubscribe"
  | "defer"
  | "drop";

export type BounceSubtype = "hard" | "soft" | "block" | "undetermined";

export interface TrackingEvent {
  id: string;
  messageId: string;
  accountId: string;
  eventType: EventType;
  recipient: string;
  timestamp: Date;
  metadata: EventMetadata;
}

export interface EventMetadata {
  // Delivery metadata
  smtpResponse?: string;
  mxHost?: string;
  deliveryTimeMs?: number;

  // Bounce metadata
  bounceSubtype?: BounceSubtype;
  bounceCode?: string;
  bounceDiagnostic?: string;

  // Open metadata
  userAgent?: string;
  ipAddress?: string;
  deviceType?: "desktop" | "mobile" | "tablet" | "unknown";
  emailClient?: string;

  // Click metadata
  url?: string;
  linkIndex?: number;
  linkTag?: string;

  // Complaint metadata
  complaintType?: "abuse" | "fraud" | "virus" | "other";
  feedbackId?: string;

  // General
  campaignId?: string;
  tags?: string[];
  geolocation?: GeoLocation;
}

export interface GeoLocation {
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

// ─── Pixel & Link Tracking Types ────────────────────────────────────────────

export interface TrackingPixel {
  messageId: string;
  accountId: string;
  recipient: string;
  url: string;
  createdAt: Date;
}

export interface TrackedLink {
  id: string;
  messageId: string;
  accountId: string;
  originalUrl: string;
  trackingUrl: string;
  linkIndex: number;
  tag?: string;
  createdAt: Date;
}

// ─── Ingestion Types ────────────────────────────────────────────────────────

export interface EventBatch {
  events: TrackingEvent[];
  receivedAt: Date;
  source: string;
}

export interface IngestionStats {
  eventsReceived: number;
  eventsProcessed: number;
  eventsFailed: number;
  eventsPerSecond: number;
  avgProcessingTimeMs: number;
  lastEventAt: Date | null;
}

export interface IngestionConfig {
  batchSize: number;
  flushIntervalMs: number;
  maxQueueSize: number;
  deduplicationWindowMs: number;
  workers: number;
}

// ─── Reporting Types ────────────────────────────────────────────────────────

export type ReportPeriod = "daily" | "weekly" | "monthly" | "custom";

export type ReportFormat = "json" | "csv" | "html";

export interface ReportRequest {
  accountId: string;
  period: ReportPeriod;
  startDate: Date;
  endDate: Date;
  metrics: MetricType[];
  groupBy?: GroupByDimension[];
  filters?: ReportFilter[];
  format: ReportFormat;
  includeComparison: boolean;
}

export type MetricType =
  | "deliveries"
  | "delivery_rate"
  | "bounces"
  | "bounce_rate"
  | "opens"
  | "open_rate"
  | "unique_opens"
  | "clicks"
  | "click_rate"
  | "unique_clicks"
  | "click_to_open_rate"
  | "complaints"
  | "complaint_rate"
  | "unsubscribes"
  | "unsubscribe_rate"
  | "avg_delivery_time";

export type GroupByDimension =
  | "date"
  | "hour"
  | "domain"
  | "campaign"
  | "tag"
  | "recipient_domain"
  | "device_type"
  | "country";

export interface ReportFilter {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains";
  value: unknown;
}

export interface Report {
  id: string;
  accountId: string;
  request: ReportRequest;
  summary: ReportSummary;
  timeSeries: TimeSeriesDataPoint[];
  breakdowns: Record<string, BreakdownEntry[]>;
  comparison?: ReportComparison;
  generatedAt: Date;
  durationMs: number;
}

export interface ReportSummary {
  totalSent: number;
  totalDelivered: number;
  totalBounced: number;
  totalOpens: number;
  totalUniqueOpens: number;
  totalClicks: number;
  totalUniqueClicks: number;
  totalComplaints: number;
  totalUnsubscribes: number;
  deliveryRate: number;
  bounceRate: number;
  openRate: number;
  clickRate: number;
  clickToOpenRate: number;
  complaintRate: number;
  unsubscribeRate: number;
  avgDeliveryTimeMs: number;
}

export interface TimeSeriesDataPoint {
  timestamp: Date;
  metrics: Partial<Record<MetricType, number>>;
}

export interface BreakdownEntry {
  dimension: string;
  value: string;
  metrics: Partial<Record<MetricType, number>>;
  percentage: number;
}

export interface ReportComparison {
  previousPeriod: ReportSummary;
  changes: Partial<Record<MetricType, MetricChange>>;
}

export interface MetricChange {
  current: number;
  previous: number;
  absoluteChange: number;
  percentChange: number;
  trend: "up" | "down" | "stable";
  significant: boolean;
}

// ─── AI Insights Types ──────────────────────────────────────────────────────

export type InsightType =
  | "trend"
  | "anomaly"
  | "opportunity"
  | "warning"
  | "achievement";

export type InsightSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface Insight {
  id: string;
  accountId: string;
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  description: string;
  recommendation: string;
  metrics: InsightMetric[];
  affectedDomains: string[];
  detectedAt: Date;
  expiresAt: Date;
  dismissed: boolean;
}

export interface InsightMetric {
  name: MetricType;
  currentValue: number;
  previousValue: number;
  change: number;
  threshold?: number;
}

export interface AnomalyDetectionConfig {
  sensitivityLevel: "low" | "medium" | "high";
  minDataPoints: number;
  zScoreThreshold: number;
  movingAverageWindow: number;
  seasonalityPeriod: number;
}

export interface TrendAnalysis {
  metric: MetricType;
  direction: "increasing" | "decreasing" | "stable" | "volatile";
  slope: number;
  rSquared: number;
  confidence: number;
  forecast: number[];
  changePoints: Date[];
}

// ─── Export Types ───────────────────────────────────────────────────────────

export type ExportFormat = "csv" | "json" | "ndjson";

export type ExportDestination = "download" | "s3" | "webhook" | "email";

export interface ExportRequest {
  id: string;
  accountId: string;
  format: ExportFormat;
  destination: ExportDestination;
  dateRange: { start: Date; end: Date };
  eventTypes: EventType[];
  fields: string[];
  filters?: ReportFilter[];
  schedule?: ExportSchedule;
  createdAt: Date;
}

export interface ExportSchedule {
  frequency: "daily" | "weekly" | "monthly";
  dayOfWeek?: number; // 0-6
  dayOfMonth?: number; // 1-31
  hour: number; // 0-23
  timezone: string;
  enabled: boolean;
}

export interface ExportJob {
  id: string;
  requestId: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number; // 0-100
  totalRows: number;
  processedRows: number;
  fileSizeBytes: number;
  outputUrl?: string;
  error?: string;
  startedAt: Date;
  completedAt: Date | null;
}

export interface StreamConfig {
  batchSize: number;
  flushIntervalMs: number;
  backpressureThreshold: number;
  maxRetries: number;
  retryDelayMs: number;
}
