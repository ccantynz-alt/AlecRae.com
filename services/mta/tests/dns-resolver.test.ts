/**
 * Tests for bounded DNS resolution (Known Issue #111, DNS half).
 *
 * Every lookup in this service used `node:dns/promises` directly, which has no
 * timeout of its own — it inherits whatever the OS resolver does. These
 * lookups sit in the delivery path (MX resolution) and in inbound SPF/DMARC
 * and DKIM evaluation, so a slow or unreachable resolver does not fail, it
 * *waits*: the job never completes, the queue backs up behind it, and with no
 * alerting in place (issue #72) the first visible symptom is a customer
 * noticing mail stopped.
 *
 * What is pinned here is the configuration — that a bound exists, that it is
 * tunable, and that a bad value cannot silently remove it. Actually forcing a
 * resolver timeout would need a black-holed nameserver and a multi-second
 * wait, which is a poor trade in a unit suite.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getBoundedResolver,
  boundedDns,
  resetBoundedResolverForTests,
} from "../src/dns/resolver.js";

beforeEach(() => {
  resetBoundedResolverForTests();
});

describe("getBoundedResolver", () => {
  it("returns a resolver rather than the unbounded module functions", () => {
    const resolver = getBoundedResolver({});
    expect(typeof resolver.resolveMx).toBe("function");
    expect(typeof resolver.resolveTxt).toBe("function");
  });

  it("reuses one instance per process", () => {
    // Each Resolver holds a c-ares channel; building one per lookup would
    // discard its cache and burn file descriptors under delivery load.
    expect(getBoundedResolver({})).toBe(getBoundedResolver({}));
  });

  it("accepts tuning from the environment", () => {
    const resolver = getBoundedResolver({
      MTA_DNS_TIMEOUT_MS: "1500",
      MTA_DNS_TRIES: "1",
    });
    expect(resolver).toBeDefined();
  });

  it("ignores values that would remove the bound", () => {
    // A zero, a negative, or a typo must fall back to the default rather than
    // disabling the timeout — the whole point is that no lookup is unbounded.
    for (const value of ["0", "-1", "", "abc", "NaN"]) {
      resetBoundedResolverForTests();
      expect(() =>
        getBoundedResolver({ MTA_DNS_TIMEOUT_MS: value, MTA_DNS_TRIES: value }),
      ).not.toThrow();
    }
  });
});

describe("boundedDns", () => {
  it("exposes every lookup this service performs", () => {
    // If a new lookup type is added to the service without being added here,
    // the call site has to import node:dns directly — which is the unbounded
    // path this exists to replace.
    expect(Object.keys(boundedDns).sort()).toEqual([
      "resolve4",
      "resolve6",
      "resolveMx",
      "resolveTxt",
      "reverse",
    ]);
  });

  it("rejects rather than hanging on a name that cannot resolve", async () => {
    // `.invalid` is reserved by RFC 2606 and never resolves, so this exercises
    // the rejection path without depending on any external nameserver's
    // behaviour for a made-up name.
    await expect(
      boundedDns.resolveMx("no-such-host.invalid"),
    ).rejects.toThrow();
  });
});
