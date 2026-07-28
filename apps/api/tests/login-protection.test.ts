/**
 * Tests for per-account failed-login tracking (Known Issue #117, second half).
 *
 * `/v1/auth/*` had only a flat per-IP rate limit, which stops one machine
 * hammering one account and nothing else. It is blind to the attack that
 * works at scale: a botnet trying one password against one account from a
 * thousand IPs, each individually well under the cap.
 *
 * This matters for spam, not just account security — a taken-over account is
 * the usual way a legitimate sender starts emitting spam. The send-volume
 * detector catches the blast; this is the upstream cause.
 *
 * These run against the in-memory fallback (ioredis is stubbed so it never
 * becomes ready), which is also the behaviour worth pinning: a Redis outage
 * must degrade this control, not remove it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("ioredis", () => ({
  default: class {
    on(): void {
      /* never ready — forces the in-memory path */
    }
  },
}));

const IP = "203.0.113.10";

async function mod() {
  return await import("../src/lib/login-protection.js");
}

describe("login protection", () => {
  beforeEach(async () => {
    const m = await mod();
    m.__resetLoginProtectionMemory();
    process.env["LOGIN_FAIL_ACCOUNT_THRESHOLD"] = "5";
    process.env["LOGIN_FAIL_IP_THRESHOLD"] = "20";
    process.env["LOGIN_FAIL_WINDOW_SECONDS"] = "900";
  });

  afterEach(() => {
    delete process.env["LOGIN_FAIL_ACCOUNT_THRESHOLD"];
    delete process.env["LOGIN_FAIL_IP_THRESHOLD"];
    delete process.env["LOGIN_FAIL_WINDOW_SECONDS"];
  });

  it("allows a first attempt", async () => {
    const { checkLoginAllowed } = await mod();
    const r = await checkLoginAllowed("craig@alecrae.com", IP);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBeNull();
  });

  it("allows attempts below the account threshold", async () => {
    const { checkLoginAllowed, recordLoginFailure } = await mod();
    for (let i = 0; i < 4; i++) await recordLoginFailure("craig@alecrae.com", IP);

    const r = await checkLoginAllowed("craig@alecrae.com", IP);
    expect(r.allowed).toBe(true);
  });

  it("locks an account once its failure threshold is reached", async () => {
    const { checkLoginAllowed, recordLoginFailure } = await mod();
    for (let i = 0; i < 5; i++) await recordLoginFailure("craig@alecrae.com", IP);

    const r = await checkLoginAllowed("craig@alecrae.com", IP);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("account_locked");
    expect(r.retryAfterSeconds).toBe(900);
  });

  it("detects credential stuffing — one account, many different IPs", async () => {
    // The attack the per-IP rate limit cannot see. Each IP makes a single
    // attempt, so no IP is anywhere near its own threshold.
    const { checkLoginAllowed, recordLoginFailure } = await mod();
    for (let i = 0; i < 5; i++) {
      await recordLoginFailure("craig@alecrae.com", `198.51.100.${i}`);
    }

    const r = await checkLoginAllowed("craig@alecrae.com", "198.51.100.99");
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("account_locked");
  });

  it("does not lock an untargeted account when another is under attack", async () => {
    const { checkLoginAllowed, recordLoginFailure } = await mod();
    for (let i = 0; i < 5; i++) await recordLoginFailure("victim@alecrae.com", IP);

    const other = await checkLoginAllowed("someone-else@alecrae.com", "198.51.100.7");
    expect(other.allowed).toBe(true);
  });

  it("detects password spraying — one IP, many accounts", async () => {
    const { checkLoginAllowed, recordLoginFailure } = await mod();
    // Under the per-account threshold everywhere (4 each), but 20 failures
    // from this one IP.
    for (let a = 0; a < 5; a++) {
      for (let i = 0; i < 4; i++) await recordLoginFailure(`user${a}@alecrae.com`, IP);
    }

    const r = await checkLoginAllowed("fresh@alecrae.com", IP);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("ip_blocked");
  });

  it("clears the account counter on a successful login", async () => {
    const { checkLoginAllowed, recordLoginFailure, recordLoginSuccess } = await mod();
    for (let i = 0; i < 4; i++) await recordLoginFailure("craig@alecrae.com", IP);

    await recordLoginSuccess("craig@alecrae.com");

    // Four more failures would have tripped the threshold without the reset.
    for (let i = 0; i < 4; i++) await recordLoginFailure("craig@alecrae.com", IP);
    expect((await checkLoginAllowed("craig@alecrae.com", IP)).allowed).toBe(true);
  });

  it("does NOT clear the IP counter on success", async () => {
    // An attacker who guesses one password out of hundreds of attempts must
    // not be able to reset their own spray counter and carry on.
    const { checkLoginAllowed, recordLoginFailure, recordLoginSuccess } = await mod();
    for (let a = 0; a < 5; a++) {
      for (let i = 0; i < 4; i++) await recordLoginFailure(`user${a}@alecrae.com`, IP);
    }

    await recordLoginSuccess("user0@alecrae.com");

    const r = await checkLoginAllowed("fresh@alecrae.com", IP);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("ip_blocked");
  });

  it("treats the email case-insensitively", async () => {
    const { checkLoginAllowed, recordLoginFailure } = await mod();
    for (let i = 0; i < 5; i++) await recordLoginFailure("Craig@AlecRae.com", IP);

    const r = await checkLoginAllowed("craig@alecrae.com", IP);
    expect(r.allowed).toBe(false);
  });

  it("honours a tightened threshold without a deploy", async () => {
    process.env["LOGIN_FAIL_ACCOUNT_THRESHOLD"] = "2";
    const { checkLoginAllowed, recordLoginFailure } = await mod();
    for (let i = 0; i < 2; i++) await recordLoginFailure("craig@alecrae.com", IP);

    expect((await checkLoginAllowed("craig@alecrae.com", IP)).allowed).toBe(false);
  });
});
