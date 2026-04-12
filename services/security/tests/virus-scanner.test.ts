/**
 * Tests for the VirusTotal attachment virus scanner.
 *
 * Mocks the VirusTotal API to test:
 *   - Clean file detection (hash lookup hit)
 *   - Infected file detection
 *   - Unknown file upload + polling
 *   - API unavailability (graceful degradation)
 *   - SHA-256 hash-based cache hit
 *   - File too large (>32MB skip)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock fetch globally ─────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Env management ──────────────────────────────────────────────────────────

const ORIGINAL_ENV = { ...process.env };

describe("virus-scanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    process.env["VIRUSTOTAL_API_KEY"] = "test-api-key-123";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.useRealTimers();
  });

  it("should return clean result when VirusTotal hash lookup finds a clean file", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          attributes: {
            last_analysis_stats: {
              malicious: 0,
              suspicious: 0,
              undetected: 60,
              harmless: 5,
              "type-unsupported": 0,
              timeout: 0,
            },
            last_analysis_results: {},
          },
        },
      }),
    });

    const { scanAttachment, isSafe } = await import("../src/virus-scanner.js");
    const buffer = Buffer.from("clean file content");
    const result = await scanAttachment(buffer, "document.pdf");

    expect(result.clean).toBe(true);
    expect(result.detections).toBe(0);
    expect(result.status).toBe("clean");
    expect(isSafe(result)).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]?.[0]).toContain("/files/");
  });

  it("should return infected result when VirusTotal detects malware", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          attributes: {
            last_analysis_stats: {
              malicious: 42,
              suspicious: 3,
              undetected: 15,
              harmless: 5,
              "type-unsupported": 0,
              timeout: 0,
            },
            last_analysis_results: {
              "Kaspersky": { category: "malicious", result: "Trojan.Win32.Agent" },
              "ESET": { category: "malicious", result: "Win32/Trojan.Agent" },
              "Norton": { category: "undetected", result: null },
            },
          },
        },
      }),
    });

    const { scanAttachment, isSafe } = await import("../src/virus-scanner.js");
    const buffer = Buffer.from("infected file content");
    const result = await scanAttachment(buffer, "malware.exe");

    expect(result.clean).toBe(false);
    expect(result.detections).toBe(45);
    expect(result.status).toBe("infected");
    expect(result.threats.length).toBeGreaterThan(0);
    expect(result.threats.some((t) => t.includes("Trojan"))).toBe(true);
    expect(isSafe(result)).toBe(false);
  });

  it("should upload unknown files and poll for results", async () => {
    // Mock GET /files/{hash} — 404 (unknown file)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    });

    // Mock POST /files — upload success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: { id: "analysis-id-123" },
      }),
    });

    // Mock GET /analyses/{id} — completed on first poll
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          attributes: {
            status: "completed",
            stats: {
              malicious: 0,
              suspicious: 0,
              undetected: 70,
              harmless: 2,
              "type-unsupported": 0,
              timeout: 0,
            },
            results: {},
          },
        },
      }),
    });

    const { scanAttachment } = await import("../src/virus-scanner.js");
    const buffer = Buffer.from("brand new file never seen before");
    const result = await scanAttachment(buffer, "new-document.docx");

    expect(result.clean).toBe(true);
    expect(result.detections).toBe(0);
    // 3 calls: hash lookup (404) + upload + 1 poll (completed immediately)
    expect(mockFetch).toHaveBeenCalledTimes(3);
  }, 15_000); // Extended timeout for the sleep(5000) in poll loop

  it("should degrade gracefully when API key is missing", async () => {
    delete process.env["VIRUSTOTAL_API_KEY"];

    const { scanAttachment } = await import("../src/virus-scanner.js");
    const buffer = Buffer.from("some file content no key");
    const result = await scanAttachment(buffer, "report.pdf");

    expect(result.clean).toBe(true);
    expect(result.status).toBe("skipped");
    // Ensure no fetch was called in THIS test (only check calls after clearAllMocks)
    expect(mockFetch).toHaveBeenCalledTimes(0);
  });

  it("should degrade gracefully when VirusTotal API is unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network unreachable"));

    const { scanAttachment } = await import("../src/virus-scanner.js");
    const buffer = Buffer.from("file during outage");
    const result = await scanAttachment(buffer, "document.pdf");

    expect(result.clean).toBe(true);
    expect(result.status).toBe("error");
  });

  it("should skip scan for files larger than 32MB", async () => {
    const { scanAttachment } = await import("../src/virus-scanner.js");
    const largeBuffer = Buffer.alloc(33 * 1024 * 1024);
    const result = await scanAttachment(largeBuffer, "huge-video.mp4");

    expect(result.clean).toBe(true);
    expect(result.status).toBe("skipped");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should use SHA-256 hash for cache hit (same content = same hash lookup)", async () => {
    const content = "identical file content for hash test";

    // Both calls: hash lookup returns clean
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          attributes: {
            last_analysis_stats: {
              malicious: 0,
              suspicious: 0,
              undetected: 50,
              harmless: 10,
              "type-unsupported": 0,
              timeout: 0,
            },
            last_analysis_results: {},
          },
        },
      }),
    });

    const { scanAttachment } = await import("../src/virus-scanner.js");

    const result1 = await scanAttachment(Buffer.from(content), "file1.txt");
    const result2 = await scanAttachment(Buffer.from(content), "file2.txt");

    // Both should return the same hash (same content)
    expect(result1.hash).toBe(result2.hash);
    // Both use hash lookup (GET /files/{hash}), not upload
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const url1 = mockFetch.mock.calls[0]?.[0] as string;
    const url2 = mockFetch.mock.calls[1]?.[0] as string;
    expect(url1).toContain("/files/");
    expect(url2).toContain("/files/");
    expect(url1).toBe(url2);
  });
});
