/**
 * Tests for the consent library. These are regulatory-critical — they
 * prove that AlecRae will not treat a missing consent record, a stale
 * version, or a browser privacy signal as permission to set
 * non-essential cookies.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildConsentRecord,
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  DEFAULT_CONSENT,
  detectDNTSignal,
  detectGPCSignal,
  hasConsent,
  loadConsent,
  resetConsent,
  saveConsent,
} from "./consent";

describe("consent", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults deny everything except necessary", () => {
    expect(DEFAULT_CONSENT.categories.necessary).toBe(true);
    expect(DEFAULT_CONSENT.categories.functional).toBe(false);
    expect(DEFAULT_CONSENT.categories.analytics).toBe(false);
    expect(DEFAULT_CONSENT.categories.performance).toBe(false);
  });

  it("returns null when no consent record has been saved", () => {
    expect(loadConsent()).toBeNull();
  });

  it("hasConsent('necessary') is always true, even with no record", () => {
    expect(hasConsent("necessary")).toBe(true);
  });

  it("hasConsent returns false for any non-necessary category without consent", () => {
    expect(hasConsent("functional")).toBe(false);
    expect(hasConsent("analytics")).toBe(false);
    expect(hasConsent("performance")).toBe(false);
  });

  it("saves and loads a consent record round-trip", () => {
    const record = buildConsentRecord({
      functional: true,
      analytics: false,
      performance: true,
    });
    saveConsent(record);
    const loaded = loadConsent();
    expect(loaded).not.toBeNull();
    expect(loaded?.categories.functional).toBe(true);
    expect(loaded?.categories.analytics).toBe(false);
    expect(loaded?.categories.performance).toBe(true);
    expect(loaded?.version).toBe(CONSENT_VERSION);
  });

  it("rejects a stored record whose version does not match", () => {
    const stale = JSON.stringify({
      version: CONSENT_VERSION - 1,
      decidedAt: new Date().toISOString(),
      categories: {
        necessary: true,
        functional: true,
        analytics: true,
        performance: true,
      },
      autoAppliedFromSignal: false,
    });
    window.localStorage.setItem(CONSENT_STORAGE_KEY, stale);
    expect(loadConsent()).toBeNull();
  });

  it("resetConsent removes the stored record", () => {
    saveConsent(buildConsentRecord({ functional: true }));
    expect(loadConsent()).not.toBeNull();
    resetConsent();
    expect(loadConsent()).toBeNull();
  });

  it("detectGPCSignal picks up navigator.globalPrivacyControl", () => {
    vi.stubGlobal("navigator", { globalPrivacyControl: true });
    expect(detectGPCSignal()).toBe(true);
  });

  it("detectGPCSignal ignores a missing signal", () => {
    vi.stubGlobal("navigator", {});
    expect(detectGPCSignal()).toBe(false);
  });

  it("detectDNTSignal recognises legacy DNT=1", () => {
    vi.stubGlobal("navigator", { doNotTrack: "1" });
    expect(detectDNTSignal()).toBe(true);
  });

  it("buildConsentRecord stamps version and ISO timestamp", () => {
    const record = buildConsentRecord({ analytics: true });
    expect(record.version).toBe(CONSENT_VERSION);
    expect(() => new Date(record.decidedAt).toISOString()).not.toThrow();
    expect(record.categories.analytics).toBe(true);
    expect(record.categories.functional).toBe(false);
    expect(record.categories.performance).toBe(false);
  });
});
