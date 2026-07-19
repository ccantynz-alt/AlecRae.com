/**
 * API client for the Security Intelligence route family
 * (/v1/security-intelligence/*) — threat detection, security policies,
 * audit log, dashboard stats, sender reputation, and phishing reports.
 *
 * Mirrors the typed fetch wrapper in lib/api-features.ts (owned elsewhere,
 * featureFetch is not exported) including the silent 401 → refreshSession
 * → retry-once pattern from lib/auth-token.ts.
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface SecurityApiError {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

async function securityFetch<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const token = getAccessToken();

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // Silent access-token renewal on expiry — mirrors lib/api-features.ts.
  if (res.status === 401 && !retried && getRefreshToken()) {
    const fresh = await refreshSession();
    if (fresh) {
      return securityFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as SecurityApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type ThreatType =
  | "phishing"
  | "malware"
  | "spam"
  | "impersonation"
  | "business_email_compromise"
  | "credential_harvesting";

export type ThreatSeverity = "critical" | "high" | "medium" | "low";

export type ThreatUserAction = "reported" | "dismissed" | "quarantined";

export type ThreatActionInput = "report" | "dismiss" | "quarantine";

export interface ThreatSignalsData {
  urlMismatch?: boolean;
  senderSpoofed?: boolean;
  urgentLanguage?: boolean;
  attachmentRisk?: boolean;
  newSender?: boolean;
  domainAge?: number;
  replyToMismatch?: boolean;
}

export interface ThreatDetectionData {
  id: string;
  accountId: string;
  emailId: string;
  threatType: ThreatType;
  severity: ThreatSeverity;
  confidence: number;
  signals: ThreatSignalsData | null;
  aiExplanation: string | null;
  userAction: ThreatUserAction | null;
  createdAt: string;
}

export interface BatchScanResultData {
  emailId: string;
  status: "already_scanned" | "unavailable";
  threatDetectionId?: string;
}

export interface BatchScanResponse {
  data: BatchScanResultData[];
  total: number;
  alreadyScanned: number;
  unavailable: number;
}

export interface ThreatListQuery {
  limit?: number;
  cursor?: string;
  severity?: ThreatSeverity;
  type?: ThreatType;
}

export interface CursorPage<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
}

export type SecurityPolicyType =
  | "block_sender"
  | "block_domain"
  | "require_tls"
  | "quarantine_attachments"
  | "flag_external";

export interface SecurityPolicyData {
  id: string;
  accountId: string;
  name: string;
  type: SecurityPolicyType;
  value: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreatePolicyInput {
  name: string;
  type: SecurityPolicyType;
  value: string;
}

export type SecurityAuditEventType =
  | "threat_detected"
  | "policy_created"
  | "policy_deleted"
  | "sender_blocked"
  | "email_quarantined"
  | "settings_changed";

export interface AuditLogEntryData {
  id: string;
  accountId: string;
  eventType: SecurityAuditEventType;
  details: Record<string, unknown> | null;
  userId?: string | null;
  createdAt: string;
}

export interface AuditLogQuery {
  limit?: number;
  cursor?: string;
  eventType?: SecurityAuditEventType;
}

export interface SecurityDashboardData {
  totalThreats: number;
  threatsByType: { type: ThreatType; count: number }[];
  threatsBySeverity: { severity: ThreatSeverity; count: number }[];
  blockedSenders: number;
  activePolicies: number;
}

export interface SenderReputationData {
  email: string;
  domain: string;
  /** null until real reputation scoring ships — see analysisAvailable. */
  reputationScore: number | null;
  isBlocked: boolean;
  threatHistory: number;
  /** null until SPF/DKIM/DMARC authentication-result parsing ships. */
  checks: {
    spf: string;
    dkim: string;
    dmarc: string;
    domainAge: string;
    knownProvider: boolean;
  } | null;
  analysisAvailable: boolean;
  summary: string;
}

export interface ThreatActionResult {
  id: string;
  userAction: ThreatUserAction;
  action: ThreatActionInput;
}

/**
 * POST /report-phishing returns the updated marker when a detection already
 * existed for the email, or the freshly created detection otherwise.
 */
export type ReportPhishingResult =
  | { id: string; emailId: string; status: "updated_to_reported" }
  | ThreatDetectionData;

// ─── Client ──────────────────────────────────────────────────────────────────

export const securityIntelligenceApi = {
  /** POST /v1/security-intelligence/scan */
  scan(emailId: string): Promise<{ data: ThreatDetectionData }> {
    return securityFetch<{ data: ThreatDetectionData }>(
      "/v1/security-intelligence/scan",
      { method: "POST", body: JSON.stringify({ emailId }) },
    );
  },

  /** POST /v1/security-intelligence/scan/batch */
  scanBatch(emailIds: string[]): Promise<BatchScanResponse> {
    return securityFetch<BatchScanResponse>(
      "/v1/security-intelligence/scan/batch",
      { method: "POST", body: JSON.stringify({ emailIds }) },
    );
  },

  /** GET /v1/security-intelligence/threats */
  listThreats(query: ThreatListQuery = {}): Promise<CursorPage<ThreatDetectionData>> {
    const params = new URLSearchParams();
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.severity) params.set("severity", query.severity);
    if (query.type) params.set("type", query.type);
    const qs = params.toString();
    return securityFetch<CursorPage<ThreatDetectionData>>(
      `/v1/security-intelligence/threats${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /v1/security-intelligence/threats/:emailId */
  getThreatForEmail(emailId: string): Promise<{ data: ThreatDetectionData }> {
    return securityFetch<{ data: ThreatDetectionData }>(
      `/v1/security-intelligence/threats/${encodeURIComponent(emailId)}`,
    );
  },

  /** POST /v1/security-intelligence/threats/:id/action */
  threatAction(
    id: string,
    action: ThreatActionInput,
  ): Promise<{ data: ThreatActionResult }> {
    return securityFetch<{ data: ThreatActionResult }>(
      `/v1/security-intelligence/threats/${encodeURIComponent(id)}/action`,
      { method: "POST", body: JSON.stringify({ action }) },
    );
  },

  /** GET /v1/security-intelligence/policies */
  listPolicies(): Promise<{ data: SecurityPolicyData[] }> {
    return securityFetch<{ data: SecurityPolicyData[] }>(
      "/v1/security-intelligence/policies",
    );
  },

  /** POST /v1/security-intelligence/policies */
  createPolicy(input: CreatePolicyInput): Promise<{ data: SecurityPolicyData }> {
    return securityFetch<{ data: SecurityPolicyData }>(
      "/v1/security-intelligence/policies",
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  /** DELETE /v1/security-intelligence/policies/:id */
  deletePolicy(id: string): Promise<{ data: { id: string; deleted: boolean } }> {
    return securityFetch<{ data: { id: string; deleted: boolean } }>(
      `/v1/security-intelligence/policies/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  /** GET /v1/security-intelligence/audit-log */
  auditLog(query: AuditLogQuery = {}): Promise<CursorPage<AuditLogEntryData>> {
    const params = new URLSearchParams();
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.eventType) params.set("eventType", query.eventType);
    const qs = params.toString();
    return securityFetch<CursorPage<AuditLogEntryData>>(
      `/v1/security-intelligence/audit-log${qs ? `?${qs}` : ""}`,
    );
  },

  /** GET /v1/security-intelligence/dashboard */
  dashboard(): Promise<{ data: SecurityDashboardData }> {
    return securityFetch<{ data: SecurityDashboardData }>(
      "/v1/security-intelligence/dashboard",
    );
  },

  /** GET /v1/security-intelligence/sender-reputation/:email */
  senderReputation(email: string): Promise<{ data: SenderReputationData }> {
    return securityFetch<{ data: SenderReputationData }>(
      `/v1/security-intelligence/sender-reputation/${encodeURIComponent(email)}`,
    );
  },

  /** POST /v1/security-intelligence/report-phishing */
  reportPhishing(
    emailId: string,
    reason?: string,
  ): Promise<{ data: ReportPhishingResult }> {
    return securityFetch<{ data: ReportPhishingResult }>(
      "/v1/security-intelligence/report-phishing",
      {
        method: "POST",
        body: JSON.stringify(reason ? { emailId, reason } : { emailId }),
      },
    );
  },
};
