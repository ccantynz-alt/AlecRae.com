/**
 * Tests for fail-fast production env validation (apps/api/src/lib/env.ts).
 *
 * Verifies:
 *  1. Non-production NODE_ENV is a no-op (CI/local dev boot with no env)
 *  2. Production with a complete env passes silently
 *  3. Production with missing/invalid vars throws ONE aggregated error
 *     naming every problem (DATABASE_URL, JWT_SECRET, WEBAUTHN_RP_ID,
 *     WEBAUTHN_ORIGIN)
 *  4. JWT_SECRET shorter than 32 chars is rejected
 *  5. WEBAUTHN_ORIGIN must be a URL
 *  6. Recommended vars (REDIS_URL, WEBHOOK_SECRET, ANTHROPIC_API_KEY,
 *     STRIPE_SECRET_KEY) warn but never throw
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { assertProductionEnv } from "../src/lib/env.js";

const VALID_PRODUCTION_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://user:pass@db.example.com:5432/alecrae",
  JWT_SECRET: "a".repeat(32),
  WEBAUTHN_RP_ID: "alecrae.com",
  WEBAUTHN_ORIGIN: "https://mail.alecrae.com",
  REDIS_URL: "redis://localhost:6379",
  WEBHOOK_SECRET: "whsec_test",
  ANTHROPIC_API_KEY: "sk-ant-test",
  STRIPE_SECRET_KEY: "sk_test_123",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("assertProductionEnv — non-production", () => {
  it("is a no-op when NODE_ENV is not production (even with empty env)", () => {
    expect(() => assertProductionEnv({})).not.toThrow();
    expect(() => assertProductionEnv({ NODE_ENV: "test" })).not.toThrow();
    expect(() => assertProductionEnv({ NODE_ENV: "development" })).not.toThrow();
  });

  it("does not warn outside production", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    assertProductionEnv({ NODE_ENV: "development" });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("assertProductionEnv — production, valid env", () => {
  it("passes silently with a complete environment", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() => assertProductionEnv(VALID_PRODUCTION_ENV)).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("assertProductionEnv — production, invalid env", () => {
  it("throws one aggregated error listing every missing required var", () => {
    let thrown: Error | null = null;
    try {
      assertProductionEnv({ NODE_ENV: "production" });
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = thrown?.message ?? "";
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("JWT_SECRET");
    expect(message).toContain("WEBAUTHN_RP_ID");
    expect(message).toContain("WEBAUTHN_ORIGIN");
    expect(message).toContain("4 problems");
  });

  it("rejects a JWT_SECRET shorter than 32 characters", () => {
    const env = { ...VALID_PRODUCTION_ENV, JWT_SECRET: "too-short" };
    expect(() => assertProductionEnv(env)).toThrowError(/JWT_SECRET.*32/s);
  });

  it("rejects a non-URL WEBAUTHN_ORIGIN", () => {
    const env = { ...VALID_PRODUCTION_ENV, WEBAUTHN_ORIGIN: "mail.alecrae.com" };
    expect(() => assertProductionEnv(env)).toThrowError(/WEBAUTHN_ORIGIN.*URL/s);
  });

  it("only reports the vars that are actually broken", () => {
    const env: NodeJS.ProcessEnv = {
      ...VALID_PRODUCTION_ENV,
      DATABASE_URL: undefined,
    };
    let thrown: Error | null = null;
    try {
      assertProductionEnv(env);
    } catch (error) {
      thrown = error as Error;
    }
    const message = thrown?.message ?? "";
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("1 problem");
    expect(message).not.toContain("WEBAUTHN_RP_ID:");
  });
});

describe("assertProductionEnv — recommended vars", () => {
  it("warns (but does not throw) when recommended vars are unset", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "production",
      DATABASE_URL: VALID_PRODUCTION_ENV["DATABASE_URL"],
      JWT_SECRET: VALID_PRODUCTION_ENV["JWT_SECRET"],
      WEBAUTHN_RP_ID: VALID_PRODUCTION_ENV["WEBAUTHN_RP_ID"],
      WEBAUTHN_ORIGIN: VALID_PRODUCTION_ENV["WEBAUTHN_ORIGIN"],
    };

    expect(() => assertProductionEnv(env)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warning = String(warnSpy.mock.calls[0]?.[0] ?? "");
    expect(warning).toContain("REDIS_URL");
    expect(warning).toContain("WEBHOOK_SECRET");
    expect(warning).toContain("ANTHROPIC_API_KEY");
    expect(warning).toContain("STRIPE_SECRET_KEY");
  });

  it("treats whitespace-only recommended vars as unset", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const env = { ...VALID_PRODUCTION_ENV, REDIS_URL: "   " };
    assertProductionEnv(env);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warning = String(warnSpy.mock.calls[0]?.[0] ?? "");
    expect(warning).toContain("REDIS_URL");
    expect(warning).not.toContain("WEBHOOK_SECRET");
  });
});
