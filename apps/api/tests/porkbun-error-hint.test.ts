/**
 * augmentPorkbunError appends the concrete per-domain fix ONLY when Porkbun's
 * message is auth/permission-shaped — the overwhelmingly common cause is the
 * per-domain "API Access" toggle being off, which Porkbun reports with no
 * guidance. Unrelated errors must pass through unchanged so we never mislabel
 * them.
 */

import { describe, it, expect } from "vitest";
import { augmentPorkbunError } from "../src/lib/dns-providers/porkbun.js";

describe("augmentPorkbunError", () => {
  const hintMarker = "API Access";

  it.each([
    "Authentication error",
    "Invalid API key. (002)",
    "Invalid apikey",
    "Domain is not opted in to API access.",
    "All API access has been disabled.",
    "Unauthorized",
    "Permission denied",
  ])("appends the per-domain fix for auth-shaped message %j", (msg) => {
    const out = augmentPorkbunError(msg);
    expect(out.startsWith(msg)).toBe(true);
    expect(out).toContain(hintMarker);
    expect(out).toContain("pk1_");
    expect(out).toContain("sk1_");
  });

  it.each([
    "Record already exists",
    "Invalid record type",
    "The DNS record content is malformed.",
    "Rate limit exceeded",
  ])("leaves unrelated message %j untouched", (msg) => {
    expect(augmentPorkbunError(msg)).toBe(msg);
  });

  it("gives a sane default hint when the message is empty or undefined", () => {
    expect(augmentPorkbunError(undefined)).toBe("Porkbun rejected the request");
    expect(augmentPorkbunError("   ")).toBe("Porkbun rejected the request");
  });
});
