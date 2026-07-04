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

async function gdFetch(
  apiKey: string,
  apiSecret: string,
  path: string,
  options: RequestInit = {},
) {
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
      const body = [
        {
          data: rec.value,
          ttl: 600,
          ...(rec.priority !== undefined && rec.priority !== null ? { priority: rec.priority } : {}),
        },
      ];

      const res = await gdFetch(
        apiKey,
        apiSecret,
        `/domains/${encodeURIComponent(apexDomain)}/records/${rec.type}/${encodeURIComponent(relName)}`,
        { method: "PUT", body: JSON.stringify(body) },
      );

      if (res && res.code && res.code !== "SUCCESS") {
        return { type: rec.type, name: rec.name, status: "failed", error: res.message };
      }
      return { type: rec.type, name: rec.name, status: "created" };
    }),
  );

  return { success: results.every((r) => r.status !== "failed"), records: results };
}
