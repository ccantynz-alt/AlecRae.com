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

// Known two-part TLDs where the registrable apex is the last 3 labels.
const MULTI_PART_TLDS = new Set([
  // UK
  "co.uk", "org.uk", "me.uk", "net.uk", "ltd.uk", "plc.uk",
  // NZ
  "co.nz", "org.nz", "net.nz", "school.nz", "govt.nz",
  // AU
  "com.au", "net.au", "org.au", "edu.au", "gov.au",
  // South Africa
  "co.za", "org.za", "net.za",
  // Other common two-part TLDs
  "co.jp", "co.in", "com.br", "com.mx", "com.sg",
  "co.id", "com.ar", "com.co", "co.ke", "com.ng", "co.il",
  "co.kr", "co.th", "co.tz", "com.gh",
]);

/** Strip a domain down to its apex (registrable portion).
 *  mail.example.co.nz → example.co.nz
 *  mail.vapron.ai → vapron.ai */
export function inferApexDomain(domain: string): string {
  const parts = domain.split(".");
  if (parts.length <= 2) return domain;
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART_TLDS.has(lastTwo)) {
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}
