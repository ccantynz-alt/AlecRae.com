/**
 * Tests for the tracking-event recording throttle.
 *
 * `/t/*` takes no auth (mail clients have no session) and had no rate limit of
 * any kind, while each recorded event costs a DB insert AND a webhook delivery
 * to the customer's own endpoint. Anyone holding one tracking URL could
 * therefore drive unlimited outbound calls at a customer's receiver.
 *
 * The design point these tests pin is the CHOICE OF AXIS: throttling per email
 * rather than per IP. Gmail/Yahoo/Apple fetch pixels through image proxies, so
 * a per-IP limit tight enough to matter would drop open tracking for every
 * recipient behind those proxies.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  shouldRecordTrackingEvent,
  resetTrackingThrottleForTests,
} from "../src/lib/tracking-throttle.js";

const EMAIL_A = "eml_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const EMAIL_B = "eml_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const OPEN = "email.opened";

beforeEach(() => {
  // No REDIS_URL in tests, so the in-process counters are exercised — which is
  // also the degraded production path worth having covered.
  delete process.env["REDIS_URL"];
  resetTrackingThrottleForTests();
});

describe("per-email throttling", () => {
  it("records ordinary repeated opens — a person re-reading a message", async () => {
    for (let i = 0; i < 20; i++) {
      expect(await shouldRecordTrackingEvent(EMAIL_A, OPEN)).toBe(true);
    }
  });

  it("stops recording once one message is being hammered", async () => {
    for (let i = 0; i < 120; i++) {
      expect(await shouldRecordTrackingEvent(EMAIL_A, OPEN)).toBe(true);
    }
    expect(await shouldRecordTrackingEvent(EMAIL_A, OPEN)).toBe(false);
    expect(await shouldRecordTrackingEvent(EMAIL_A, OPEN)).toBe(false);
  });

  it("does not let a flood against one message affect another", async () => {
    // This is the property that makes a mail-provider image proxy safe: it
    // fetches for thousands of recipients, i.e. thousands of distinct ids.
    for (let i = 0; i < 200; i++) {
      await shouldRecordTrackingEvent(EMAIL_A, OPEN);
    }
    expect(await shouldRecordTrackingEvent(EMAIL_A, OPEN)).toBe(false);
    expect(await shouldRecordTrackingEvent(EMAIL_B, OPEN)).toBe(true);
  });

  it("counts each event type separately", async () => {
    for (let i = 0; i < 120; i++) {
      await shouldRecordTrackingEvent(EMAIL_A, OPEN);
    }
    expect(await shouldRecordTrackingEvent(EMAIL_A, OPEN)).toBe(false);
    // A click on a heavily-opened message must still register.
    expect(await shouldRecordTrackingEvent(EMAIL_A, "email.clicked")).toBe(true);
  });
});

describe("unsubscribe limit", () => {
  it("always allows the first unsubscribe — the one that must never be lost", async () => {
    expect(
      await shouldRecordTrackingEvent(EMAIL_A, "email.unsubscribed.request"),
    ).toBe(true);
  });

  it("applies a tighter limit than opens, since repeats carry no information", async () => {
    let allowed = 0;
    for (let i = 0; i < 30; i++) {
      if (await shouldRecordTrackingEvent(EMAIL_A, "email.unsubscribed.request")) {
        allowed++;
      }
    }
    expect(allowed).toBe(10);
  });
});

describe("window expiry", () => {
  it("recovers after the window passes", async () => {
    const t0 = Date.parse("2026-03-02T09:00:00.000Z");
    for (let i = 0; i < 121; i++) {
      await shouldRecordTrackingEvent(EMAIL_A, OPEN, t0);
    }
    expect(await shouldRecordTrackingEvent(EMAIL_A, OPEN, t0)).toBe(false);

    const laterThanWindow = t0 + 61 * 60 * 1000;
    expect(await shouldRecordTrackingEvent(EMAIL_A, OPEN, laterThanWindow)).toBe(true);
  });
});
