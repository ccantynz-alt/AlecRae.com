/**
 * GoDaddy DNS auto-configuration.
 *
 * API credentials are used in memory only — never persisted.
 * Required: API Key + API Secret from https://developer.godaddy.com/keys
 */

import type { AutoConfigRecord, AutoConfigResult, AutoConfigRecordResult } from "./types.js";

const GODADDY_API = "https://api.godaddy.com/v1";

/** GoDaddy record names are relative to the apex domain.
 *  _dmarc.mail.vapron.ai (apex: vapron.ai) → _dmarc.mail
 *  vapron.ai (apex: vapron.ai) → @
 */
function relativeName(fullName: string, apexDomain: string): string {
  if (fullName === apexDomain) return "@";
  const suffix = `.${apexDomain}`;
  if (fullName.endsWith(suffix)) return fullName.slice(0, -suffix.length);
  return fullName;
}

interface GdRecord {
  data: string;
  name: string;
  ttl: number;
  priority?: number;
  type: string;
}

async function gdFetch(
  apiKey: string,
  apiSecret: string,
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const res = await fetch(`${GODADDY_API}${path}`, {
    ...options,
    headers: {
      Authorization: `sso-key ${apiKey}:${apiSecret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });
  if (res.status === 204 || res.headers.get("content-length") === "0") return { success: true };
  if (!res.headers.get("content-type")?.includes("application/json")) {
    return { code: "HTTP_ERROR", message: `Unexpected response from GoDaddy (HTTP ${res.status})` };
  }
  return res.json();
}

export async function configureGodaddy(
  apiKey: string,
  apiSecret: string,
  apexDomain: string,
  records: AutoConfigRecord[],
): Promise<AutoConfigResult> {
  const results = await Promise.all(
    records.map(async (rec): Promise<AutoConfigRecordResult> => {
      const relName = relativeName(rec.name, apexDomain);
      const encodedApex = encodeURIComponent(apexDomain);
      const encodedRelName = encodeURIComponent(relName);

      let body: GdRecord[];

      if (rec.type === "TXT") {
        // GET existing TXT records at this name before overwriting — GoDaddy PUT
        // replaces the entire record set at {type}/{name}, so we must merge our
        // record with any pre-existing unrelated TXT entries (e.g. Google site
        // verification) to avoid silently deleting them.
        const existing = await gdFetch(apiKey, apiSecret, `/domains/${encodedApex}/records/TXT/${encodedRelName}`);
        const existingRecords = Array.isArray(existing) ? (existing as GdRecord[]) : [];

        const isOurs = (data: string) =>
          data.startsWith("v=spf1") || data.startsWith("v=DKIM1");

        const kept = existingRecords.filter((r) => !isOurs(r.data));
        body = [
          ...kept.map((r) => ({
            type: "TXT" as const,
            name: r.name,
            data: r.data,
            ttl: r.ttl,
          })),
          {
            type: "TXT" as const,
            name: relName,
            data: rec.value,
            ttl: 600,
            ...(rec.priority != null ? { priority: rec.priority } : {}),
          },
        ];
      } else {
        body = [
          {
            type: rec.type,
            name: relName,
            data: rec.value,
            ttl: 600,
            ...(rec.priority != null ? { priority: rec.priority } : {}),
          },
        ];
      }

      const res = await gdFetch(
        apiKey,
        apiSecret,
        `/domains/${encodedApex}/records/${rec.type}/${encodedRelName}`,
        { method: "PUT", body: JSON.stringify(body) },
      );

      const resObj = res as Record<string, unknown>;
      if (resObj && resObj.code && resObj.code !== "SUCCESS") {
        return {
          type: rec.type,
          name: rec.name,
          status: "failed",
          error: String(resObj.message ?? "Unknown GoDaddy error"),
        };
      }
      return { type: rec.type, name: rec.name, status: "created" };
    }),
  );

  return { success: results.every((r) => r.status !== "failed"), records: results };
}
