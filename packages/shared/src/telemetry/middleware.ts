/**
 * @alecrae/shared — OpenTelemetry Hono Middleware
 *
 * Automatically traces every HTTP request and records standard API metrics.
 * Adds `X-Trace-Id` to response headers for distributed tracing correlation.
 *
 * Usage:
 *   import { telemetryMiddleware } from "@alecrae/shared/telemetry/middleware";
 *   app.use("*", telemetryMiddleware());
 */

import type { MiddlewareHandler } from "hono";
import { getTracer, recordApiRequest, SpanStatusCode, SpanKind } from "./index.js";

/**
 * Create a Hono middleware that instruments HTTP requests with OpenTelemetry
 * traces and records API request metrics.
 */
export function telemetryMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const tracer = getTracer("http");
    const method = c.req.method;
    const path = c.req.path;
    const startTime = performance.now();

    // Derive a route pattern (strip IDs for lower cardinality)
    const route = normalizeRoute(path);

    const span = tracer.startSpan(`${method} ${route}`, {
      kind: SpanKind.SERVER,
      attributes: {
        "http.method": method,
        "http.target": path,
        "http.route": route,
        "http.url": c.req.url,
        "http.user_agent": c.req.header("user-agent") ?? "",
      },
    });

    // Propagate trace ID to response headers
    const traceId = span.spanContext().traceId;
    c.header("X-Trace-Id", traceId);

    try {
      await next();

      const status = c.res.status;
      span.setAttribute("http.status_code", status);

      if (status >= 400) {
        span.setStatus({
          code: status >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.UNSET,
          message: `HTTP ${status}`,
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }

      // Record metrics
      const durationMs = performance.now() - startTime;
      recordApiRequest(method, route, status, durationMs);
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));

      // Record the request as a 500 error
      const durationMs = performance.now() - startTime;
      recordApiRequest(method, route, 500, durationMs);

      throw error;
    } finally {
      span.end();
    }
  };
}

/**
 * Normalize a URL path into a lower-cardinality route pattern by replacing
 * UUIDs and numeric IDs with placeholders.
 *
 * Examples:
 *   /v1/messages/abc123def456 -> /v1/messages/:id
 *   /v1/domains/550e8400-e29b-41d4-a716-446655440000 -> /v1/domains/:id
 *   /t/open/abc123 -> /t/open/:id
 */
function normalizeRoute(path: string): string {
  return path
    // Replace UUIDs (with or without hyphens)
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/[0-9a-f]{32}/gi, "/:id")
    // Replace numeric IDs
    .replace(/\/\d+/g, "/:id")
    // Replace alphanumeric IDs that look like identifiers (16+ hex chars)
    .replace(/\/[0-9a-f]{16,}/gi, "/:id");
}

export { normalizeRoute };
