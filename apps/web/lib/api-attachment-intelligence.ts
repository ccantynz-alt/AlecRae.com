/**
 * API client for the Attachment Intelligence feature domain
 * (apps/api/src/routes/attachment-intelligence.ts).
 *
 * The router is mounted at /v1/attachments/intelligence in server.ts — NOT
 * /v1/attachment-intelligence as the route file's doc-comment header implies.
 * All paths below use the real, verified mount prefix.
 *
 * Endpoints (METHOD /v1/attachments/intelligence/...):
 *   POST /analyze                — analyze an attachment
 *   GET  /analysis               — list analyzed attachments (cursor pagination)
 *   GET  /analysis/:id           — get a specific analysis result
 *   POST /scan                   — trigger a virus scan for one attachment
 *   POST /batch-scan             — batch scan attachments (max 25)
 *   GET  /threats                — list detected threats (non-safe attachments)
 *   GET  /organize               — AI file organization suggestions
 *   POST /organize/:id/action    — accept/dismiss an organization suggestion
 *   GET  /stats                  — attachment statistics
 *   GET  /pii-report             — PII detection report
 *   POST /extract-text           — extract text from an attachment (OCR stub)
 *   GET  /duplicates             — find duplicate attachments
 *
 * Mirrors the private featureFetch wrapper in lib/api-features.ts (which is not
 * exported) so this domain has its own typed entry point with silent 401 →
 * refresh → retry handling, following lib/api-delegation.ts.
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();
const PREFIX = "/v1/attachments/intelligence";

interface AttachmentApiError {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

async function attachmentFetch<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const token = getAccessToken();

  const res = await fetch(`${API_BASE}${PREFIX}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // Silent access-token renewal on expiry — mirrors lib/api-delegation.ts.
  if (res.status === 401 && !retried && getRefreshToken()) {
    const fresh = await refreshSession();
    if (fresh) {
      return attachmentFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as AttachmentApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Domain types ──────────────────────────────────────────────────────────────

export type ThreatLevel = "safe" | "suspicious" | "dangerous";

export type VirusScanStatus = "pending" | "clean" | "infected" | "error";

export type FileImportance = "critical" | "important" | "normal" | "low";

/** A single analyzed attachment (row from attachment_analysis). */
export interface AttachmentAnalysis {
  id: string;
  accountId: string;
  emailId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  mimeType: string;
  isSafe: boolean;
  threatLevel: ThreatLevel;
  aiSummary: string | null;
  extractedText: string | null;
  containsPII: boolean;
  piiTypes: string[] | null;
  virusScanStatus: VirusScanStatus;
  virusScanResult: string | null;
  createdAt: string;
}

export interface AttachmentListResult {
  data: AttachmentAnalysis[];
  cursor: string | null;
  hasMore: boolean;
}

export interface AttachmentStats {
  totalFiles: number;
  storageUsed: number;
  threatsBlocked: number;
  infectedFiles: number;
  filesWithPII: number;
  typesBreakdown: { type: string; count: number }[];
}

/** One file in the PII report (a projection of attachment_analysis). */
export interface PiiReportFile {
  id: string;
  emailId: string;
  fileName: string;
  fileType: string;
  piiTypes: string[] | null;
  createdAt: string;
}

export interface PiiReport {
  totalFilesWithPII: number;
  piiTypeCounts: Record<string, number>;
  files: PiiReportFile[];
}

/** An AI file-organization suggestion (row from smart_file_organization). */
export interface OrganizationSuggestion {
  id: string;
  accountId: string;
  fileName: string;
  fileType: string;
  suggestedFolder: string;
  suggestedTags: string[] | null;
  relatedEmails: string[] | null;
  importance: FileImportance;
  expiresAt: string | null;
  isActioned: boolean;
  createdAt: string;
}

export interface OrganizationListResult {
  data: OrganizationSuggestion[];
  cursor: string | null;
  hasMore: boolean;
}

export interface ExtractTextResult {
  attachmentId: string;
  fileName: string;
  extractedText: string;
  alreadyExtracted: boolean;
}

export interface ScanResult {
  attachmentId: string;
  status: "scanned" | "not_found";
  virusScanStatus?: string;
  virusScanResult?: string;
}

export interface BatchScanResult {
  data: ScanResult[];
  total: number;
  scanned: number;
  notFound: number;
}

export type OrganizeAction = "accepted" | "dismissed";

// ─── Attachment Intelligence API ─────────────────────────────────────────────

export const attachmentIntelligenceApi = {
  /** GET /analysis — list analyzed attachments, cursor-paginated. */
  listAnalysis(options?: {
    threatLevel?: ThreatLevel;
    fileType?: string;
    emailId?: string;
    limit?: number;
    cursor?: string;
  }): Promise<AttachmentListResult> {
    const params = new URLSearchParams();
    if (options?.threatLevel) params.set("threatLevel", options.threatLevel);
    if (options?.fileType) params.set("fileType", options.fileType);
    if (options?.emailId) params.set("emailId", options.emailId);
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const qs = params.toString();
    return attachmentFetch<AttachmentListResult>(
      `/analysis${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /analysis/:id — get one analysis result with full detail. */
  getAnalysis(id: string): Promise<{ data: AttachmentAnalysis }> {
    return attachmentFetch<{ data: AttachmentAnalysis }>(
      `/analysis/${encodeURIComponent(id)}`,
    );
  },

  /** GET /threats — list non-safe attachments, cursor-paginated. */
  listThreats(options?: {
    severity?: ThreatLevel;
    limit?: number;
    cursor?: string;
  }): Promise<AttachmentListResult> {
    const params = new URLSearchParams();
    if (options?.severity) params.set("severity", options.severity);
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const qs = params.toString();
    return attachmentFetch<AttachmentListResult>(
      `/threats${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /stats — attachment statistics for the account. */
  stats(): Promise<{ data: AttachmentStats }> {
    return attachmentFetch<{ data: AttachmentStats }>("/stats");
  },

  /** GET /pii-report — PII detection report. */
  piiReport(): Promise<{ data: PiiReport }> {
    return attachmentFetch<{ data: PiiReport }>("/pii-report");
  },

  /** GET /organize — AI file-organization suggestions, cursor-paginated. */
  listOrganization(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<OrganizationListResult> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const qs = params.toString();
    return attachmentFetch<OrganizationListResult>(
      `/organize${qs ? `?${qs}` : ""}`,
    );
  },

  /** POST /organize/:id/action — accept or dismiss a suggestion. */
  actionOrganization(
    id: string,
    action: OrganizeAction,
  ): Promise<{
    data: { id: string; action: OrganizeAction; isActioned: boolean };
  }> {
    return attachmentFetch<{
      data: { id: string; action: OrganizeAction; isActioned: boolean };
    }>(`/organize/${encodeURIComponent(id)}/action`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
  },

  /** POST /scan — trigger a virus scan for one attachment. */
  scan(attachmentId: string): Promise<{ data: AttachmentAnalysis }> {
    return attachmentFetch<{ data: AttachmentAnalysis }>("/scan", {
      method: "POST",
      body: JSON.stringify({ attachmentId }),
    });
  },

  /** POST /extract-text — extract text from an attachment (OCR stub). */
  extractText(attachmentId: string): Promise<{ data: ExtractTextResult }> {
    return attachmentFetch<{ data: ExtractTextResult }>("/extract-text", {
      method: "POST",
      body: JSON.stringify({ attachmentId }),
    });
  },
};
