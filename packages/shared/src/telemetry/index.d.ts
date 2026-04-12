/**
 * @alecrae/shared — OpenTelemetry Instrumentation
 *
 * Provides unified telemetry (traces + metrics) for all AlecRae services.
 *
 * Configuration via environment variables:
 *   OTEL_ENABLED          — "true" to enable (default: "false")
 *   OTEL_EXPORTER_OTLP_ENDPOINT — OTLP collector endpoint (default: http://localhost:4318)
 *   OTEL_SERVICE_NAME     — Override the service name passed to initTelemetry()
 *
 * Usage:
 *   import { initTelemetry, getTracer, getMeter, shutdownTelemetry } from "@alecrae/shared/telemetry";
 *   await initTelemetry("alecrae-api");
 *   const tracer = getTracer();
 *   const meter  = getMeter();
 */
import { type Tracer, type Meter } from "@opentelemetry/api";
/**
 * Initialize OpenTelemetry SDK for the calling service.
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * @param name - Logical service name (e.g. "alecrae-api", "alecrae-mta")
 */
export declare function initTelemetry(name: string): Promise<void>;
/**
 * Gracefully shut down the OpenTelemetry SDK, flushing pending telemetry.
 */
export declare function shutdownTelemetry(): Promise<void>;
/**
 * Get a named tracer instance. Defaults to the service name.
 */
export declare function getTracer(name?: string): Tracer;
/**
 * Get a named meter instance. Defaults to the service name.
 */
export declare function getMeter(name?: string): Meter;
/**
 * Record an outbound email send event.
 */
export declare function recordEmailSent(domain: string, status: string): void;
/**
 * Record the duration of an email send operation.
 */
export declare function recordEmailSendDuration(domain: string, durationMs: number): void;
/**
 * Record an inbound email receive event.
 */
export declare function recordEmailReceived(domain: string, verdict: string): void;
/**
 * Record the duration of an email filter stage.
 */
export declare function recordEmailFilterDuration(stage: string, durationMs: number): void;
/**
 * Record an API request.
 */
export declare function recordApiRequest(method: string, route: string, status: number, durationMs: number): void;
/**
 * Adjust the active connection count for a service.
 */
export declare function recordActiveConnection(service: string, delta: number): void;
/**
 * Adjust the queue depth for a named queue.
 */
export declare function recordQueueDepth(queueName: string, delta: number): void;
/**
 * Record a webhook delivery attempt.
 */
export declare function recordWebhookDelivery(status: string): void;
export { SpanStatusCode, SpanKind } from "@opentelemetry/api";
export type { Span, Tracer, Meter, Counter, Histogram } from "@opentelemetry/api";
//# sourceMappingURL=index.d.ts.map