/**
 * @emailed/security — VirusTotal Attachment Scanner
 *
 * Integrates with VirusTotal API v3 for async attachment virus scanning.
 * Uses SHA-256 hash lookups first (cache hit), then uploads unknown files.
 *
 * Free tier: 4 lookups/minute, 500/day — sufficient for MVP.
 *
 * Environment: VIRUSTOTAL_API_KEY
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScanResult {
  clean: boolean;
  detections: number;
  totalEngines: number;
  threats: string[];
  scannedAt: Date;
  hash: string;
  status: VirusScanStatus;
}

export type VirusScanStatus = "pending" | "clean" | "infected" | "skipped" | "error";

export interface VirusScanResult {
  detections: number;
  totalEngines: number;
  threats: string[];
  scannedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VIRUSTOTAL_API_BASE = "https://www.virustotal.com/api/v3";
const MAX_FILE_SIZE = 32 * 1024 * 1024; // 32MB
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_DURATION_MS = 60_000;

// ---------------------------------------------------------------------------
// SHA-256 helper
// ---------------------------------------------------------------------------

async function sha256(buffer: Buffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// VirusTotal API helpers
// ---------------------------------------------------------------------------

function getApiKey(): string | undefined {
  return process.env["VIRUSTOTAL_API_KEY"];
}

interface VtAnalysisStats {
  malicious: number;
  undetected: number;
  harmless: number;
  suspicious: number;
  "type-unsupported": number;
  timeout: number;
}

interface VtFileResponse {
  data?: {
    attributes?: {
      last_analysis_stats?: VtAnalysisStats;
      last_analysis_results?: Record<
        string,
        { category: string; result: string | null }
      >;
    };
  };
}

interface VtUploadResponse {
  data?: {
    id?: string;
  };
}

interface VtAnalysisResponse {
  data?: {
    attributes?: {
      status?: string;
      stats?: VtAnalysisStats;
      results?: Record<
        string,
        { category: string; result: string | null }
      >;
    };
  };
}

function extractThreats(
  results: Record<string, { category: string; result: string | null }> | undefined,
): string[] {
  if (!results) return [];
  const threats: string[] = [];
  for (const [engine, info] of Object.entries(results)) {
    if (info.category === "malicious" && info.result) {
      threats.push(`${engine}: ${info.result}`);
    }
  }
  return threats;
}

function buildResultFromStats(
  stats: VtAnalysisStats,
  results: Record<string, { category: string; result: string | null }> | undefined,
  hash: string,
): ScanResult {
  const detections = stats.malicious + stats.suspicious;
  const totalEngines =
    stats.malicious +
    stats.undetected +
    stats.harmless +
    stats.suspicious +
    stats["type-unsupported"] +
    stats.timeout;

  const threats = extractThreats(results);

  return {
    clean: detections === 0,
    detections,
    totalEngines,
    threats,
    scannedAt: new Date(),
    hash,
    status: detections === 0 ? "clean" : "infected",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan an attachment buffer for malware using VirusTotal.
 *
 * 1. Compute SHA-256 hash
 * 2. Check if VirusTotal already knows this file (GET /files/{hash})
 * 3. If unknown, upload and poll for analysis
 * 4. Return scan result
 *
 * Degrades gracefully: returns a "skipped" result if API key is missing,
 * file is too large, or VirusTotal is unreachable.
 */
export async function scanAttachment(
  buffer: Buffer,
  filename: string,
): Promise<ScanResult> {
  const apiKey = getApiKey();
  const hash = await sha256(buffer);

  // No API key — degrade gracefully
  if (!apiKey) {
    console.warn(`[virus-scanner] VIRUSTOTAL_API_KEY not set. Skipping scan for "${filename}".`);
    return {
      clean: true,
      detections: 0,
      totalEngines: 0,
      threats: [],
      scannedAt: new Date(),
      hash,
      status: "skipped",
    };
  }

  // File too large for VirusTotal
  if (buffer.length > MAX_FILE_SIZE) {
    console.warn(
      `[virus-scanner] File "${filename}" (${(buffer.length / 1024 / 1024).toFixed(1)}MB) exceeds 32MB limit. Skipping scan.`,
    );
    return {
      clean: true,
      detections: 0,
      totalEngines: 0,
      threats: [],
      scannedAt: new Date(),
      hash,
      status: "skipped",
    };
  }

  try {
    // Step 1: Check if VirusTotal already knows this file by hash
    const lookupResult = await lookupByHash(apiKey, hash);
    if (lookupResult) {
      return lookupResult;
    }

    // Step 2: Upload the file and poll for results
    return await uploadAndPoll(apiKey, buffer, filename, hash);
  } catch (error) {
    console.warn(
      `[virus-scanner] VirusTotal API error for "${filename}":`,
      error instanceof Error ? error.message : error,
    );
    return {
      clean: true,
      detections: 0,
      totalEngines: 0,
      threats: [],
      scannedAt: new Date(),
      hash,
      status: "error",
    };
  }
}

/**
 * Check if a scan result indicates the file is safe.
 */
export function isSafe(result: ScanResult): boolean {
  return result.detections === 0;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function lookupByHash(
  apiKey: string,
  hash: string,
): Promise<ScanResult | null> {
  const response = await fetch(`${VIRUSTOTAL_API_BASE}/files/${hash}`, {
    headers: { "x-apikey": apiKey },
  });

  if (response.status === 404) {
    // File unknown to VirusTotal
    return null;
  }

  if (!response.ok) {
    throw new Error(`VirusTotal lookup failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as VtFileResponse;
  const stats = data.data?.attributes?.last_analysis_stats;

  if (!stats) {
    return null;
  }

  return buildResultFromStats(
    stats,
    data.data?.attributes?.last_analysis_results,
    hash,
  );
}

async function uploadAndPoll(
  apiKey: string,
  buffer: Buffer,
  filename: string,
  hash: string,
): Promise<ScanResult> {
  // Upload
  const formData = new FormData();
  formData.append("file", new Blob([buffer]), filename);

  const uploadResponse = await fetch(`${VIRUSTOTAL_API_BASE}/files`, {
    method: "POST",
    headers: { "x-apikey": apiKey },
    body: formData,
  });

  if (!uploadResponse.ok) {
    throw new Error(
      `VirusTotal upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`,
    );
  }

  const uploadData = (await uploadResponse.json()) as VtUploadResponse;
  const analysisId = uploadData.data?.id;

  if (!analysisId) {
    throw new Error("VirusTotal upload returned no analysis ID");
  }

  // Poll for results
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
    await sleep(POLL_INTERVAL_MS);

    const analysisResponse = await fetch(
      `${VIRUSTOTAL_API_BASE}/analyses/${analysisId}`,
      { headers: { "x-apikey": apiKey } },
    );

    if (!analysisResponse.ok) {
      continue;
    }

    const analysisData = (await analysisResponse.json()) as VtAnalysisResponse;
    const status = analysisData.data?.attributes?.status;

    if (status === "completed") {
      const stats = analysisData.data?.attributes?.stats;
      if (stats) {
        return buildResultFromStats(
          stats,
          analysisData.data?.attributes?.results,
          hash,
        );
      }
    }
  }

  // Polling timed out — treat as pending/allow
  console.warn(
    `[virus-scanner] Analysis timed out for "${filename}". Allowing send.`,
  );
  return {
    clean: true,
    detections: 0,
    totalEngines: 0,
    threats: [],
    scannedAt: new Date(),
    hash,
    status: "pending",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
