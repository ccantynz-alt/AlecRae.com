/**
 * Porkbun DNS auto-configuration.
 *
 * API credentials are used in memory only — never persisted.
 * Required: API Key + Secret API Key from porkbun.com → Account → API Access
 */

import type { AutoConfigRecord, AutoConfigResult, AutoConfigRecordResult } from "./types.js";

const PORKBUN_API = "https://porkbun.com/api/json/v3";

/** Porkbun record names are the subdomain only (no apex).
 *  _dmarc.mail.vapron.ai (apex: vapron.ai) → _dmarc.mail
 *  vapron.ai (apex: vapron.ai) → "" (root)
 */
function relativeName(fullName: string, apexDomain: string): string {
  if (fullName === apexDomain) return "";
  const suffix = `.${apexDomain}`;
  if (fullName.endsWith(suffix)) return fullName.slice(0, -suffix.length);
  return fullName;
}

interface PbRecord {
  id: string;
  type: string;
  name: string;
  content: string;
}

interface PbResponse {
  status: string;
  message?: string;
  records?: PbRecord[];
}

async function pbFetch(
  apiKey: string,
  secretApiKey: string,
  path: string,
  extra: Record<string, unknown> = {},
): Promise<PbResponse> {
  const res = await fetch(`${PORKBUN_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: apiKey, secretapikey: secretApiKey, ...extra }),
  });
  if (!res.headers.get("content-type")?.includes("application/json")) {
    return { status: "ERROR", message: `Unexpected response from Porkbun (HTTP ${res.status})` };
  }
  return res.json() as Promise<PbResponse>;
}

export async function configurePorkbun(
  apiKey: string,
  secretApiKey: string,
  apexDomain: string,
  records: AutoConfigRecord[],
): Promise<AutoConfigResult> {
  // Retrieve existing records once
  const existing = await pbFetch(apiKey, secretApiKey, `/dns/retrieve/${encodeURIComponent(apexDomain)}`);
  if (existing.status !== "SUCCESS") {
    return {
      success: false,
      records: [],
      error: existing.message ?? "Could not retrieve existing DNS records from Porkbun",
    };
  }
  const existingRecords: PbRecord[] = existing.records ?? [];

  const results = await Promise.all(
    records.map(async (rec): Promise<AutoConfigRecordResult> => {
      const relName = relativeName(rec.name, apexDomain);
      // Porkbun stores names as relative labels (no trailing dot, no apex)
      const found = existingRecords.find(
        (e) => e.type === rec.type && (e.name === relName || e.name === rec.name),
      );

      if (found) {
        if (found.content === rec.value) {
          return { type: rec.type, name: rec.name, status: "existed" };
        }
        const editRes = await pbFetch(apiKey, secretApiKey, `/dns/edit/${encodeURIComponent(apexDomain)}/${found.id}`, {
          type: rec.type,
          name: relName,
          content: rec.value,
          ttl: "600",
          ...(rec.priority !== undefined && rec.priority !== null ? { prio: String(rec.priority) } : {}),
        });
        if (editRes.status !== "SUCCESS") {
          return { type: rec.type, name: rec.name, status: "failed", error: editRes.message ?? "Update failed" };
        }
        return { type: rec.type, name: rec.name, status: "updated" };
      }

      const createRes = await pbFetch(apiKey, secretApiKey, `/dns/create/${encodeURIComponent(apexDomain)}`, {
        type: rec.type,
        name: relName,
        content: rec.value,
        ttl: "600",
        ...(rec.priority !== undefined && rec.priority !== null ? { prio: String(rec.priority) } : {}),
      });
      if (createRes.status !== "SUCCESS") {
        return { type: rec.type, name: rec.name, status: "failed", error: createRes.message ?? "Create failed" };
      }
      return { type: rec.type, name: rec.name, status: "created" };
    }),
  );

  return { success: results.every((r) => r.status !== "failed"), records: results };
}
