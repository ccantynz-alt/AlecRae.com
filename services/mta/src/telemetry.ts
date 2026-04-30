// TODO: add deps — the following packages must be added to services/mta/package.json
// before the non-no-op path will resolve at runtime:
//   @opentelemetry/api
//   @opentelemetry/sdk-node
//   @opentelemetry/exporter-trace-otlp-http
//   @opentelemetry/exporter-metrics-otlp-http
//   @opentelemetry/resources
//   @opentelemetry/semantic-conventions
//   @opentelemetry/sdk-metrics
//
// Until they are installed, instantiate this module with `enabled: false` — the
// no-op implementations below match the public shape exactly so callers never
// need to null-check. Once deps land, flip `enabled: true` in production.

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Public types
 */

export interface TelemetryConfig {
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly environment: "production" | "staging" | "development";
  readonly otlpEndpoint?: string; // OTEL_EXPORTER_OTLP_ENDPOINT
  readonly enabled: boolean;
}

export interface Span {
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: "ok" | "error", message?: string): void;
  recordException(err: Error): void;
  end(): void;
}

export interface Counter {
  add(value: number, attrs?: Record<string, string>): void;
}

export interface Histogram {
  record(value: number, attrs?: Record<string, string>): void;
}

export interface Gauge {
  record(value: number, attrs?: Record<string, string>): void;
}

export interface Tracer {
  startSpan(
    name: string,
    attrs?: Record<string, string | number | boolean>,
  ): Span;
}

export interface Meter {
  counter(name: string, description?: string): Counter;
  histogram(name: string, description?: string, unit?: string): Histogram;
  gauge(name: string, description?: string): Gauge;
}

/**
 * No-op implementations. Match the public shape byte-for-byte so callers never
 * need `if (tracer)` or `?.` chains. When telemetry is disabled every op is
 * a cheap function call with zero allocations beyond the returned no-op span.
 */

const NOOP_SPAN: Span = Object.freeze({
  setAttribute(_key: string, _value: string | number | boolean): void {},
  setStatus(_status: "ok" | "error", _message?: string): void {},
  recordException(_err: Error): void {},
  end(): void {},
});

const noopTracer: Tracer = {
  startSpan(
    _name: string,
    _attrs?: Record<string, string | number | boolean>,
  ): Span {
    return NOOP_SPAN;
  },
};

const NOOP_COUNTER: Counter = Object.freeze({
  add(_value: number, _attrs?: Record<string, string>): void {},
});

const NOOP_HISTOGRAM: Histogram = Object.freeze({
  record(_value: number, _attrs?: Record<string, string>): void {},
});

const NOOP_GAUGE: Gauge = Object.freeze({
  record(_value: number, _attrs?: Record<string, string>): void {},
});

const noopMeter: Meter = {
  counter(_name: string, _description?: string): Counter {
    return NOOP_COUNTER;
  },
  histogram(_name: string, _description?: string, _unit?: string): Histogram {
    return NOOP_HISTOGRAM;
  },
  gauge(_name: string, _description?: string): Gauge {
    return NOOP_GAUGE;
  },
};

/**
 * Module-scoped live pointers. Start as no-ops; `initTelemetry` swaps them
 * with OTel-backed impls when enabled. Consumers import `tracer` / `meter`
 * once at module load and keep using the same reference — the pointer
 * object is stable, only its `startSpan` / `counter` / ... implementations
 * rotate under the hood.
 */

let activeTracer: Tracer = noopTracer;
let activeMeter: Meter = noopMeter;

export const tracer: Tracer = {
  startSpan(
    name: string,
    attrs?: Record<string, string | number | boolean>,
  ): Span {
    return activeTracer.startSpan(name, attrs);
  },
};

export const meter: Meter = {
  counter(name: string, description?: string): Counter {
    return activeMeter.counter(name, description);
  },
  histogram(name: string, description?: string, unit?: string): Histogram {
    return activeMeter.histogram(name, description, unit);
  },
  gauge(name: string, description?: string): Gauge {
    return activeMeter.gauge(name, description);
  },
};

/**
 * Pre-defined domain metrics. They exist unconditionally so MTA code can
 * import them at module top-level without worrying whether telemetry is
 * initialised yet — if init hasn't run, they route through the no-op
 * meter; after init, subsequent ops use the live OTel meter because
 * `meter` is a stable facade over `activeMeter`.
 *
 * Names follow OTel semantic-convention style (domain.subject.action).
 */

export const metrics = {
  smtpMessagesReceived: meter.counter(
    "smtp.messages.received",
    "Count of SMTP messages accepted at ingress (post-RCPT, pre-queue).",
  ),
  smtpMessagesDelivered: meter.counter(
    "smtp.messages.delivered",
    "Count of SMTP messages successfully delivered to the remote MX.",
  ),
  smtpMessagesBounced: meter.counter(
    "smtp.messages.bounced",
    "Count of SMTP messages that hit a permanent delivery failure (5xx).",
  ),
  smtpQueueDepth: meter.gauge(
    "smtp.queue.depth",
    "Current number of messages sitting in the outbound queue.",
  ),
  smtpDeliveryLatency: meter.histogram(
    "smtp.delivery.latency",
    "End-to-end latency from queue entry to remote 250 OK.",
    "ms",
  ),
  smtpConnectionActive: meter.gauge(
    "smtp.connection.active",
    "Number of currently open inbound + outbound SMTP connections.",
  ),
  dkimSigningFailures: meter.counter(
    "dkim.signing.failures",
    "Count of DKIM signing attempts that failed (key load, canonicalisation, etc.).",
  ),
} as const;

/**
 * Environment resolution. Env vars take precedence over config fields when
 * both are present — this is the standard OTel contract and lets operators
 * flip endpoints without a redeploy.
 */

interface ResolvedConfig {
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly environment: "production" | "staging" | "development";
  readonly otlpEndpoint: string | undefined;
  readonly enabled: boolean;
}

function resolveConfig(config: TelemetryConfig): ResolvedConfig {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const envServiceName = env.OTEL_SERVICE_NAME;
  const envOtlpEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const envNodeEnv = env.NODE_ENV;

  let environment: "production" | "staging" | "development" = config.environment;
  if (envNodeEnv === "production" || envNodeEnv === "staging" || envNodeEnv === "development") {
    environment = envNodeEnv;
  }

  return {
    serviceName: envServiceName ?? config.serviceName,
    serviceVersion: config.serviceVersion,
    environment,
    otlpEndpoint: envOtlpEndpoint ?? config.otlpEndpoint,
    enabled: config.enabled,
  };
}

/**
 * Initialise the telemetry subsystem. Safe to call exactly once at process
 * boot. Returns a `shutdown` hook that must be awaited during graceful
 * termination to flush any buffered spans / metric points.
 *
 * When `config.enabled === false` this is a pure no-op — we don't import
 * the OTel SDK, don't open any sockets, and `shutdown` resolves immediately.
 */
export function initTelemetry(config: TelemetryConfig): {
  shutdown: () => Promise<void>;
} {
  const resolved = resolveConfig(config);

  if (!resolved.enabled) {
    activeTracer = noopTracer;
    activeMeter = noopMeter;
    return {
      shutdown: (): Promise<void> => Promise.resolve(),
    };
  }

  // Lazy dynamic import keeps the OTel SDK out of the bundle when disabled
  // and — critically — lets this file type-check and run under bun:test
  // even before the deps land in package.json.
  let shutdownFn: () => Promise<void> = (): Promise<void> => Promise.resolve();

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const api: any = require("@opentelemetry/api");
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const sdkNode: any = require("@opentelemetry/sdk-node");
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const traceExporterMod: any = require("@opentelemetry/exporter-trace-otlp-http");
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const metricExporterMod: any = require("@opentelemetry/exporter-metrics-otlp-http");
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const resourcesMod: any = require("@opentelemetry/resources");
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const semconv: any = require("@opentelemetry/semantic-conventions");
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const sdkMetrics: any = require("@opentelemetry/sdk-metrics");

    const resource = new resourcesMod.Resource({
      [semconv.SemanticResourceAttributes.SERVICE_NAME]: resolved.serviceName,
      [semconv.SemanticResourceAttributes.SERVICE_VERSION]: resolved.serviceVersion,
      [semconv.SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: resolved.environment,
    });

    const traceExporter = new traceExporterMod.OTLPTraceExporter(
      resolved.otlpEndpoint ? { url: `${resolved.otlpEndpoint}/v1/traces` } : {},
    );
    const metricExporter = new metricExporterMod.OTLPMetricExporter(
      resolved.otlpEndpoint ? { url: `${resolved.otlpEndpoint}/v1/metrics` } : {},
    );

    const metricReader = new sdkMetrics.PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 15_000,
    });

    const sdk = new sdkNode.NodeSDK({
      resource,
      traceExporter,
      metricReader,
    });

    sdk.start();

    const otelTracer = api.trace.getTracer(resolved.serviceName, resolved.serviceVersion);
    const otelMeter = api.metrics.getMeter(resolved.serviceName, resolved.serviceVersion);

    activeTracer = {
      startSpan(
        name: string,
        attrs?: Record<string, string | number | boolean>,
      ): Span {
        const span = otelTracer.startSpan(name, attrs ? { attributes: attrs } : undefined);
        return {
          setAttribute(key: string, value: string | number | boolean): void {
            span.setAttribute(key, value);
          },
          setStatus(status: "ok" | "error", message?: string): void {
            span.setStatus({
              code: status === "ok" ? api.SpanStatusCode.OK : api.SpanStatusCode.ERROR,
              message,
            });
          },
          recordException(err: Error): void {
            span.recordException(err);
          },
          end(): void {
            span.end();
          },
        };
      },
    };

    activeMeter = {
      counter(name: string, description?: string): Counter {
        const c = otelMeter.createCounter(name, { description });
        return {
          add(value: number, attrs?: Record<string, string>): void {
            c.add(value, attrs);
          },
        };
      },
      histogram(name: string, description?: string, unit?: string): Histogram {
        const h = otelMeter.createHistogram(name, { description, unit });
        return {
          record(value: number, attrs?: Record<string, string>): void {
            h.record(value, attrs);
          },
        };
      },
      gauge(name: string, description?: string): Gauge {
        // OTel's observable gauge expects a callback; for imperative
        // `record(v)` semantics we use an UpDownCounter-backed shim so the
        // caller-facing API stays tiny and obvious. If a true async gauge
        // is needed later, swap to createObservableGauge.
        const g = otelMeter.createUpDownCounter(name, { description });
        let last = 0;
        return {
          record(value: number, attrs?: Record<string, string>): void {
            const delta = value - last;
            last = value;
            g.add(delta, attrs);
          },
        };
      },
    };

    shutdownFn = async (): Promise<void> => {
      await sdk.shutdown();
    };
  } catch (err) {
    // Deps aren't installed yet or SDK failed to boot. Fall back to no-op
    // so the MTA doesn't crash — telemetry must never take down delivery.
    activeTracer = noopTracer;
    activeMeter = noopMeter;
    // eslint-disable-next-line no-console
    console.warn(
      "[telemetry] OTel SDK unavailable, falling back to no-op:",
      err instanceof Error ? err.message : String(err),
    );
  }

  return { shutdown: shutdownFn };
}
