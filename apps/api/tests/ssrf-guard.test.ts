/**
 * Tests for the SSRF guard (Fix S3 — SSRF in link-preview fetch).
 *
 * Verifies:
 *  1. A public URL (DNS → public IP) is allowed.
 *  2. localhost / 127.0.0.1 is blocked.
 *  3. The cloud-metadata IP 169.254.169.254 is blocked.
 *  4. RFC1918 private ranges (10/8, 172.16/12, 192.168/16) are blocked.
 *  5. Link-local, loopback, ULA, multicast IPv6 are blocked.
 *  6. Non-http(s) schemes are blocked.
 *  7. A public URL that redirects to an internal target is blocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock node:dns/promises so resolution is deterministic ──────────────────────

const lookupMock = vi.fn();

vi.mock("node:dns/promises", () => ({
  lookup: (...args: unknown[]): unknown => lookupMock(...args),
}));

import { validateUrl, safeFetch, isBlockedIp } from "../src/lib/ssrf-guard.js";

/** Helper: configure the mocked DNS lookup to resolve a hostname to given IPs. */
function resolveTo(...ips: { address: string; family: number }[]): void {
  lookupMock.mockResolvedValue(ips);
}

describe("isBlockedIp — IPv4 ranges", () => {
  it("blocks loopback 127.0.0.0/8", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("127.255.255.255")).toBe(true);
  });

  it("blocks the cloud-metadata IP 169.254.169.254", () => {
    expect(isBlockedIp("169.254.169.254")).toBe(true);
  });

  it("blocks link-local 169.254.0.0/16", () => {
    expect(isBlockedIp("169.254.0.1")).toBe(true);
  });

  it("blocks RFC1918 private ranges", () => {
    expect(isBlockedIp("10.0.0.1")).toBe(true);
    expect(isBlockedIp("172.16.0.1")).toBe(true);
    expect(isBlockedIp("172.31.255.255")).toBe(true);
    expect(isBlockedIp("192.168.1.1")).toBe(true);
  });

  it("blocks 0.0.0.0/8, CGNAT, multicast and reserved", () => {
    expect(isBlockedIp("0.0.0.0")).toBe(true);
    expect(isBlockedIp("100.64.0.1")).toBe(true);
    expect(isBlockedIp("224.0.0.1")).toBe(true);
    expect(isBlockedIp("255.255.255.255")).toBe(true);
  });

  it("allows ordinary public IPv4", () => {
    expect(isBlockedIp("8.8.8.8")).toBe(false);
    expect(isBlockedIp("93.184.216.34")).toBe(false);
    expect(isBlockedIp("172.15.0.1")).toBe(false); // just outside 172.16/12
    expect(isBlockedIp("172.32.0.1")).toBe(false);
  });
});

describe("isBlockedIp — IPv6 ranges", () => {
  it("blocks loopback ::1 and unspecified ::", () => {
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("::")).toBe(true);
  });

  it("blocks unique-local fc00::/7", () => {
    expect(isBlockedIp("fc00::1")).toBe(true);
    expect(isBlockedIp("fd12:3456:789a::1")).toBe(true);
  });

  it("blocks link-local fe80::/10", () => {
    expect(isBlockedIp("fe80::1")).toBe(true);
  });

  it("blocks multicast ff00::/8", () => {
    expect(isBlockedIp("ff02::1")).toBe(true);
  });

  it("blocks IPv4-mapped metadata ::ffff:169.254.169.254", () => {
    expect(isBlockedIp("::ffff:169.254.169.254")).toBe(true);
  });

  it("allows ordinary public IPv6", () => {
    expect(isBlockedIp("2606:4700:4700::1111")).toBe(false);
  });
});

describe("validateUrl", () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  it("allows a public URL (mocked DNS → public IP)", async () => {
    resolveTo({ address: "93.184.216.34", family: 4 });
    const result = await validateUrl("https://example.com/page");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hostname).toBe("example.com");
    }
  });

  it("blocks localhost", async () => {
    resolveTo({ address: "127.0.0.1", family: 4 });
    const result = await validateUrl("http://localhost/admin");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe("ip_blocked");
      expect(result.error.ip).toBe("127.0.0.1");
    }
  });

  it("blocks 127.0.0.1 literal without DNS", async () => {
    const result = await validateUrl("http://127.0.0.1:8080/");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("ip_blocked");
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("blocks the cloud-metadata IP 169.254.169.254", async () => {
    const result = await validateUrl("http://169.254.169.254/latest/meta-data/");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe("ip_blocked");
      expect(result.error.ip).toBe("169.254.169.254");
    }
  });

  it("blocks a hostname that resolves into a private range", async () => {
    resolveTo({ address: "10.1.2.3", family: 4 });
    const result = await validateUrl("https://internal.evil.example/");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe("ip_blocked");
      expect(result.error.ip).toBe("10.1.2.3");
    }
  });

  it("blocks if ANY resolved IP is private (mixed records)", async () => {
    resolveTo(
      { address: "93.184.216.34", family: 4 },
      { address: "192.168.0.5", family: 4 },
    );
    const result = await validateUrl("https://dual.example/");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("ip_blocked");
  });

  it("blocks non-http(s) schemes", async () => {
    const ftp = await validateUrl("ftp://example.com/file");
    expect(ftp.ok).toBe(false);
    if (!ftp.ok) expect(ftp.error.reason).toBe("scheme_not_allowed");

    const file = await validateUrl("file:///etc/passwd");
    expect(file.ok).toBe(false);
    if (!file.ok) expect(file.error.reason).toBe("scheme_not_allowed");

    const gopher = await validateUrl("gopher://example.com/");
    expect(gopher.ok).toBe(false);
    if (!gopher.ok) expect(gopher.error.reason).toBe("scheme_not_allowed");
  });

  it("blocks an unparseable URL", async () => {
    const result = await validateUrl("not a url");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("invalid_url");
  });

  it("blocks when DNS resolution fails", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
    const result = await validateUrl("https://nonexistent.example/");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("dns_resolution_failed");
  });
});

describe("safeFetch — redirect re-validation", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    lookupMock.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("blocks a public URL that redirects to an internal target", async () => {
    // First hop resolves public; the redirect target resolves to metadata IP.
    lookupMock.mockImplementation((host: string) => {
      if (host === "evil.example") {
        return Promise.resolve([{ address: "93.184.216.34", family: 4 }]);
      }
      if (host === "metadata.evil.example") {
        return Promise.resolve([{ address: "169.254.169.254", family: 4 }]);
      }
      return Promise.reject(new Error("ENOTFOUND"));
    });

    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: "http://metadata.evil.example/latest/meta-data/" },
        }),
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await safeFetch("https://evil.example/start");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe("ip_blocked");
      expect(result.error.ip).toBe("169.254.169.254");
    }
    // Only the first (public) hop should have been fetched; the internal hop
    // is rejected by re-validation before any request is made.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns the final response for an allowed redirect chain", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: "https://example.com/final" },
        }),
      )
      .mockResolvedValueOnce(new Response("OK", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await safeFetch("https://example.com/start");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("blocks when the redirect chain exceeds the hop cap", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

    let n = 0;
    const fetchMock = vi.fn(() => {
      n += 1;
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: `https://example.com/hop${n}` },
        }),
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await safeFetch("https://example.com/start", { maxRedirects: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("too_many_redirects");
  });

  it("sends method + body on the initial request (needed for POST-based webhook delivery, issue #108)", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

    const fetchMock = vi.fn(() => Promise.resolve(new Response("ok", { status: 200 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await safeFetch("https://example.com/webhook", {
      method: "POST",
      body: JSON.stringify({ hello: "world" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ hello: "world" }));
  });

  it("does not re-send the body to a redirect target", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "https://example.com/final" } }),
      )
      .mockResolvedValueOnce(new Response("OK", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await safeFetch("https://example.com/start", { method: "POST", body: "secret-payload" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(secondInit.body).toBeUndefined();
  });
});
