import { describe, expect, test } from "bun:test";

import {
  initTelemetry,
  meter,
  metrics,
  tracer,
  type TelemetryConfig,
} from "./telemetry";

const disabledConfig: TelemetryConfig = {
  serviceName: "alecrae-mta-test",
  serviceVersion: "0.0.0",
  environment: "development",
  enabled: false,
};

describe("telemetry — no-op path (enabled=false)", () => {
  test("initTelemetry returns a shutdown function that resolves", async () => {
    const handle = initTelemetry(disabledConfig);
    expect(typeof handle.shutdown).toBe("function");
    await expect(handle.shutdown()).resolves.toBeUndefined();
  });

  test("tracer.startSpan returns a span whose methods are all no-ops", () => {
    initTelemetry(disabledConfig);
    const span = tracer.startSpan("test.span", { foo: "bar", n: 1, ok: true });
    expect(span).toBeDefined();
    expect(() => {
      span.setAttribute("k", "v");
      span.setAttribute("num", 42);
      span.setAttribute("flag", false);
      span.setStatus("ok");
      span.setStatus("error", "boom");
      span.recordException(new Error("sample"));
      span.end();
    }).not.toThrow();
  });

  test("meter.counter().add() does not throw on any input", () => {
    initTelemetry(disabledConfig);
    const c = meter.counter("test.counter", "desc");
    expect(() => {
      c.add(1);
      c.add(0);
      c.add(1_000_000, { route: "/x", env: "test" });
    }).not.toThrow();
  });

  test("meter.histogram().record() accepts values + attrs without throwing", () => {
    initTelemetry(disabledConfig);
    const h = meter.histogram("test.histogram", "desc", "ms");
    expect(() => {
      h.record(12.5);
      h.record(0);
      h.record(9_999, { op: "deliver" });
    }).not.toThrow();
  });

  test("meter.gauge().record() accepts values + attrs without throwing", () => {
    initTelemetry(disabledConfig);
    const g = meter.gauge("test.gauge", "desc");
    expect(() => {
      g.record(0);
      g.record(42);
      g.record(7, { queue: "outbound" });
    }).not.toThrow();
  });

  test("pre-defined SMTP + DKIM metrics are exposed with the right shapes", () => {
    initTelemetry(disabledConfig);
    // Counters
    expect(() => metrics.smtpMessagesReceived.add(1)).not.toThrow();
    expect(() => metrics.smtpMessagesDelivered.add(1, { mx: "gmail.com" })).not.toThrow();
    expect(() => metrics.smtpMessagesBounced.add(1, { code: "550" })).not.toThrow();
    expect(() => metrics.dkimSigningFailures.add(1, { reason: "key-load" })).not.toThrow();
    // Gauges
    expect(() => metrics.smtpQueueDepth.record(17)).not.toThrow();
    expect(() => metrics.smtpConnectionActive.record(3, { kind: "inbound" })).not.toThrow();
    // Histogram
    expect(() => metrics.smtpDeliveryLatency.record(284, { mx: "outlook.com" })).not.toThrow();
  });

  test("tracer and meter are stable references across repeated init calls", () => {
    const firstTracer = tracer;
    const firstMeter = meter;
    initTelemetry(disabledConfig);
    initTelemetry(disabledConfig);
    expect(tracer).toBe(firstTracer);
    expect(meter).toBe(firstMeter);
  });

  test("shutdown is idempotent and safe to await multiple times", async () => {
    const handle = initTelemetry(disabledConfig);
    await handle.shutdown();
    await expect(handle.shutdown()).resolves.toBeUndefined();
  });
});
