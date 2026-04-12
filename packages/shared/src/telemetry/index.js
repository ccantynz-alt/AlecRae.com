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
import { trace, metrics, ValueType, DiagConsoleLogger, DiagLogLevel, diag, } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { ConsoleSpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
// ─── State ──────────────────────────────────────────────────────────────────
let sdk = null;
let serviceName = "alecrae";
let initialized = false;
// ─── Helpers ────────────────────────────────────────────────────────────────
function isEnabled() {
    return process.env["OTEL_ENABLED"] === "true";
}
function getEndpoint() {
    return process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] ?? "http://localhost:4318";
}
// ─── Initialization ─────────────────────────────────────────────────────────
/**
 * Initialize OpenTelemetry SDK for the calling service.
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * @param name - Logical service name (e.g. "alecrae-api", "alecrae-mta")
 */
export async function initTelemetry(name) {
    if (initialized)
        return;
    initialized = true;
    serviceName = process.env["OTEL_SERVICE_NAME"] ?? name;
    if (!isEnabled()) {
        console.log(`[telemetry] OpenTelemetry disabled for ${serviceName} (set OTEL_ENABLED=true to enable)`);
        return;
    }
    // Enable diagnostic logging in development
    if (process.env["NODE_ENV"] !== "production") {
        diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);
    }
    const endpoint = getEndpoint();
    console.log(`[telemetry] Initializing OpenTelemetry for ${serviceName} -> ${endpoint}`);
    const resource = new Resource({
        [ATTR_SERVICE_NAME]: serviceName,
        [ATTR_SERVICE_VERSION]: process.env["SERVICE_VERSION"] ?? "0.1.0",
        "deployment.environment": process.env["NODE_ENV"] ?? "development",
    });
    // Trace exporter — OTLP/HTTP with console fallback in development
    const traceExporter = new OTLPTraceExporter({
        url: `${endpoint}/v1/traces`,
    });
    // Metric exporter — OTLP/HTTP
    const metricExporter = new OTLPMetricExporter({
        url: `${endpoint}/v1/metrics`,
    });
    const metricReader = new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 15_000, // Export every 15 seconds
    });
    sdk = new NodeSDK({
        resource,
        traceExporter,
        metricReader,
        // Add console span exporter in development for debugging
        ...(process.env["NODE_ENV"] !== "production"
            ? { spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())] }
            : {}),
    });
    sdk.start();
    // Eagerly create all standard metrics so they are registered
    createStandardMetrics();
    console.log(`[telemetry] OpenTelemetry initialized for ${serviceName}`);
}
/**
 * Gracefully shut down the OpenTelemetry SDK, flushing pending telemetry.
 */
export async function shutdownTelemetry() {
    if (!sdk)
        return;
    try {
        await sdk.shutdown();
        console.log("[telemetry] OpenTelemetry shut down");
    }
    catch (error) {
        console.error("[telemetry] Error during shutdown:", error);
    }
}
// ─── Tracer / Meter access ──────────────────────────────────────────────────
/**
 * Get a named tracer instance. Defaults to the service name.
 */
export function getTracer(name) {
    return trace.getTracer(name ?? serviceName);
}
/**
 * Get a named meter instance. Defaults to the service name.
 */
export function getMeter(name) {
    return metrics.getMeter(name ?? serviceName);
}
let standardMetrics = null;
function createStandardMetrics() {
    if (standardMetrics)
        return standardMetrics;
    const meter = getMeter();
    standardMetrics = {
        emailsSentTotal: meter.createCounter("emails_sent_total", {
            description: "Total number of emails sent",
            valueType: ValueType.INT,
        }),
        emailsReceivedTotal: meter.createCounter("emails_received_total", {
            description: "Total number of emails received",
            valueType: ValueType.INT,
        }),
        emailSendDuration: meter.createHistogram("email_send_duration_ms", {
            description: "Duration of email send operations in milliseconds",
            unit: "ms",
            valueType: ValueType.DOUBLE,
        }),
        emailFilterDuration: meter.createHistogram("email_filter_duration_ms", {
            description: "Duration of email filter stages in milliseconds",
            unit: "ms",
            valueType: ValueType.DOUBLE,
        }),
        apiRequestDuration: meter.createHistogram("api_request_duration_ms", {
            description: "Duration of API requests in milliseconds",
            unit: "ms",
            valueType: ValueType.DOUBLE,
        }),
        apiRequestTotal: meter.createCounter("api_request_total", {
            description: "Total number of API requests",
            valueType: ValueType.INT,
        }),
        activeConnections: meter.createUpDownCounter("active_connections", {
            description: "Number of active connections",
            valueType: ValueType.INT,
        }),
        queueDepth: meter.createUpDownCounter("queue_depth", {
            description: "Current queue depth",
            valueType: ValueType.INT,
        }),
        webhookDeliveryTotal: meter.createCounter("webhook_delivery_total", {
            description: "Total number of webhook deliveries",
            valueType: ValueType.INT,
        }),
    };
    return standardMetrics;
}
function getStandardMetrics() {
    if (!standardMetrics) {
        return createStandardMetrics();
    }
    return standardMetrics;
}
// ─── Metric Recording Helpers ───────────────────────────────────────────────
/**
 * Record an outbound email send event.
 */
export function recordEmailSent(domain, status) {
    getStandardMetrics().emailsSentTotal.add(1, { domain, status });
}
/**
 * Record the duration of an email send operation.
 */
export function recordEmailSendDuration(domain, durationMs) {
    getStandardMetrics().emailSendDuration.record(durationMs, { domain });
}
/**
 * Record an inbound email receive event.
 */
export function recordEmailReceived(domain, verdict) {
    getStandardMetrics().emailsReceivedTotal.add(1, { domain, verdict });
}
/**
 * Record the duration of an email filter stage.
 */
export function recordEmailFilterDuration(stage, durationMs) {
    getStandardMetrics().emailFilterDuration.record(durationMs, { stage });
}
/**
 * Record an API request.
 */
export function recordApiRequest(method, route, status, durationMs) {
    const m = getStandardMetrics();
    const attrs = { method, route, status: String(status) };
    m.apiRequestTotal.add(1, attrs);
    m.apiRequestDuration.record(durationMs, attrs);
}
/**
 * Adjust the active connection count for a service.
 */
export function recordActiveConnection(service, delta) {
    getStandardMetrics().activeConnections.add(delta, { service });
}
/**
 * Adjust the queue depth for a named queue.
 */
export function recordQueueDepth(queueName, delta) {
    getStandardMetrics().queueDepth.add(delta, { queue_name: queueName });
}
/**
 * Record a webhook delivery attempt.
 */
export function recordWebhookDelivery(status) {
    getStandardMetrics().webhookDeliveryTotal.add(1, { status });
}
// Re-export OpenTelemetry API types for convenience
export { SpanStatusCode, SpanKind } from "@opentelemetry/api";
//# sourceMappingURL=index.js.map