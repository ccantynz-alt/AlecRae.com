/**
 * @alecrae/analytics - Analytics Service
 *
 * Event tracking, reporting, AI-generated insights, and data export
 * for the AlecRae email infrastructure platform.
 */

export {
  EventIngestionPipeline,
  generateTrackingPixel,
  generatePixelHtml,
  rewriteLink,
  rewriteAllLinks,
  parseUserAgent,
  decodeTrackingToken,
  createDeliveryEvent,
  createBounceEvent,
  createOpenEvent,
  createClickEvent,
  createComplaintEvent,
} from "./tracking/events";
export type { EventSink } from "./tracking/events";

export {
  ReportGenerator,
  formatReportAsCsv,
  formatReportAsHtml,
} from "./reporting/generator";
export type { EventStore } from "./reporting/generator";

export {
  AiInsightsEngine,
  detectAnomalies,
  analyzeTrend,
} from "./insights/ai-insights";
export type { AnomalyResult } from "./insights/ai-insights";

export {
  DataExporter,
  EventStream,
} from "./export/exporter";
export type {
  ExportEventSource,
  ExportDestination,
  ExportWriter,
  StreamEventHandler,
} from "./export/exporter";

export type {
  // Events
  TrackingEvent,
  TrackingPixel,
  TrackedLink,
  EventType,
  EventMetadata,
  EventBatch,
  GeoLocation,
  // Ingestion
  IngestionStats,
  IngestionConfig,
  // Reporting
  Report,
  ReportRequest,
  ReportSummary,
  ReportComparison,
  ReportPeriod,
  ReportFormat,
  ReportFilter,
  MetricType,
  MetricChange,
  GroupByDimension,
  TimeSeriesDataPoint,
  BreakdownEntry,
  // Insights
  Insight,
  InsightType,
  InsightSeverity,
  InsightMetric,
  TrendAnalysis,
  AnomalyDetectionConfig,
  // Export
  ExportRequest,
  ExportJob,
  ExportFormat,
  ExportDestination as ExportDestinationType,
  ExportSchedule,
  StreamConfig,
  // Utility
  Result,
} from "./types";

export { ok, err } from "./types";
