export interface AutoConfigRecord {
  type: string;
  name: string;
  value: string;
  priority?: number | null;
}

export interface AutoConfigRecordResult {
  type: string;
  name: string;
  status: "created" | "updated" | "existed" | "failed";
  error?: string;
}

export interface AutoConfigResult {
  success: boolean;
  records: AutoConfigRecordResult[];
  error?: string;
}

/** Strip a domain down to its apex (last two labels).
 *  mail.vapron.ai → vapron.ai
 *  This is a best-effort heuristic that works for .com/.ai/.io/most ccTLDs.
 *  Callers can override by passing an explicit apexDomain param. */
export function inferApexDomain(domain: string): string {
  const parts = domain.split(".");
  return parts.length <= 2 ? domain : parts.slice(-2).join(".");
}
