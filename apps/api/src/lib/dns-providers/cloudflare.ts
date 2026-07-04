/**
 * Cloudflare DNS auto-configuration.
 *
 * API tokens are used in memory only — never persisted.
 * Required token permission: Zone → DNS → Edit (scoped to the relevant zone).
 */

import type { AutoConfigRecord, AutoConfigResult, AutoConfigRecordResult } from "./types.js";

const CF_API = "https://api.cloudflare.com/client/v4";

interface CfResponse<T> {
  success: boolean;
  result: T;
  errors: { code: number; message: string }[];
}

interface CfZone {
  id: string;
  name: string;
}

interface CfRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
}

async function cfFetch<T>(
  token: string,
  path: string,
  options: RequestInit = {},
): Promise<CfResponse<T>> {
  const res = await fetch(`${CF_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.headers.get("content-type")?.includes("application/json")) {
    return {
      success: false,
      result: [] as unknown as T,
      errors: [{ code: res.status, message: `Unexpected response from Cloudflare (HTTP ${res.status})` }],
    };
  }
  return res.json() as Promise<CfResponse<T>>;
}

/** Try progressively shorter suffixes until we find the Cloudflare zone. */
async function findZoneId(token: string, domain: string): Promise<string | null> {
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    const data = await cfFetch<CfZone[]>(
      token,
      `/zones?name=${encodeURIComponent(candidate)}&status=active`,
    );
    const zone = data.result?.[0];
    if (data.success && zone) {
      return zone.id;
    }
  }
  return null;
}

async function upsertRecord(
  token: string,
  zoneId: string,
  record: AutoConfigRecord,
): Promise<AutoConfigRecordResult> {
  const existing = await cfFetch<CfRecord[]>(
    token,
    `/zones/${zoneId}/dns_records?type=${record.type}&name=${encodeURIComponent(record.name)}`,
  );

  if (!existing.success) {
    return {
      type: record.type,
      name: record.name,
      status: "failed",
      error: existing.errors[0]?.message ?? "Failed to look up existing records",
    };
  }

  const payload: Record<string, unknown> = {
    type: record.type,
    name: record.name,
    content: record.value,
    ttl: 1, // auto
    proxied: false,
  };
  if (record.priority !== undefined && record.priority !== null) payload.priority = record.priority;

  const hit = existing.result?.[0];
  if (hit) {
    if (hit.content === record.value && !hit.proxied) {
      return { type: record.type, name: record.name, status: "existed" };
    }
    const updateRes = await cfFetch<CfRecord>(
      token,
      `/zones/${zoneId}/dns_records/${hit.id}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
    if (!updateRes.success) {
      return {
        type: record.type,
        name: record.name,
        status: "failed",
        error: updateRes.errors[0]?.message ?? "Update failed",
      };
    }
    return { type: record.type, name: record.name, status: "updated" };
  }

  const createRes = await cfFetch<CfRecord>(token, `/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!createRes.success) {
    return {
      type: record.type,
      name: record.name,
      status: "failed",
      error: createRes.errors[0]?.message ?? "Create failed",
    };
  }
  return { type: record.type, name: record.name, status: "created" };
}

export async function configureCloudflare(
  apiToken: string,
  records: AutoConfigRecord[],
): Promise<AutoConfigResult> {
  if (!records.length) {
    return { success: false, records: [], error: "No DNS records to configure" };
  }

  // Derive zone from the first record (all records share the same zone)
  const firstRecord = records[0];
  if (!firstRecord) {
    return { success: false, records: [], error: "No DNS records to configure" };
  }
  const zoneId = await findZoneId(apiToken, firstRecord.name);
  if (!zoneId) {
    return {
      success: false,
      records: [],
      error:
        "Domain not found in your Cloudflare account. Make sure the domain is added to Cloudflare and the token has Zone DNS:Edit permission.",
    };
  }

  const results = await Promise.all(records.map((r) => upsertRecord(apiToken, zoneId, r)));
  return {
    success: results.every((r) => r.status !== "failed"),
    records: results,
  };
}
