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
/**
 * Create a Hono middleware that instruments HTTP requests with OpenTelemetry
 * traces and records API request metrics.
 */
export declare function telemetryMiddleware(): MiddlewareHandler;
/**
 * Normalize a URL path into a lower-cardinality route pattern by replacing
 * UUIDs and numeric IDs with placeholders.
 *
 * Examples:
 *   /v1/messages/abc123def456 -> /v1/messages/:id
 *   /v1/domains/550e8400-e29b-41d4-a716-446655440000 -> /v1/domains/:id
 *   /t/open/abc123 -> /t/open/:id
 */
declare function normalizeRoute(path: string): string;
export { normalizeRoute };
//# sourceMappingURL=middleware.d.ts.map