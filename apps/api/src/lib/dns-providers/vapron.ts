/**
 * Vapron DNS auto-configuration.
 *
 * Unlike the third-party providers (Cloudflare/GoDaddy/Porkbun), Vapron is
 * our own platform: authentication uses the server-side VAPRON_API_KEY, so
 * the user supplies NO credentials. The Vapron side tenant-scopes every
 * zone/record procedure to that key's account, so this can only ever write
 * into zones the platform account owns.
 *
 * Prerequisite: the domain's zone must already exist on Vapron DNS (and the
 * registrar's nameservers should point at ns1/ns2.vapron.ai for the records
 * to actually serve). We deliberately do NOT auto-create zones here — a zone
 * nobody delegated to would silently "succeed" while doing nothing.
 *
 * Error strings returned in AutoConfigResult are locally authored (never
 * interpolated from the remote API) so the route can safely forward them.
 */

import { isVapronConfigured, vapron, VapronError, type VapronDnsRecord } from "../vapron.js";
import type { AutoConfigRecord, AutoConfigRecordResult, AutoConfigResult } from "./types.js";

/** Normalize an FQDN for comparison: lowercase, no trailing dot. */
function normalizeName(name: string): string {
  const lower = name.trim().toLowerCase();
  return lower.endsWith(".") ? lower.slice(0, -1) : lower;
}

/** Try progressively shorter suffixes of the record name to find the zone. */
function findZone(
  zones: { id: string; name: string }[],
  recordName: string,
): { id: string; name: string } | null {
  const byName = new Map(zones.map((z) => [normalizeName(z.name), z]));
  const parts = normalizeName(recordName).split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    const zone = byName.get(candidate);
    if (zone) return zone;
  }
  return null;
}

async function upsertRecord(
  zoneId: string,
  existing: VapronDnsRecord[],
  record: AutoConfigRecord,
): Promise<AutoConfigRecordResult> {
  const name = normalizeName(record.name);
  const hit = existing.find(
    (r) => normalizeName(r.name) === name && r.type.toUpperCase() === record.type.toUpperCase(),
  );

  try {
    if (hit) {
      if (hit.content === record.value) {
        return { type: record.type, name: record.name, status: "existed" };
      }
      await vapron.dns.updateRecord({
        recordId: hit.id,
        content: record.value,
        ...(record.priority !== undefined && record.priority !== null
          ? { priority: record.priority }
          : {}),
      });
      return { type: record.type, name: record.name, status: "updated" };
    }

    await vapron.dns.createRecord({
      zoneId,
      name,
      type: record.type.toUpperCase(),
      content: record.value,
      ttl: 3600,
      ...(record.priority !== undefined && record.priority !== null
        ? { priority: record.priority }
        : {}),
    });
    return { type: record.type, name: record.name, status: "created" };
  } catch (err) {
    // Log the raw provider error server-side; return a safe, local message.
    console.error(`[dns-autoconfig:vapron] ${record.type} ${record.name} failed:`, err);
    const reason =
      err instanceof VapronError && err.code === "not_configured"
        ? "Vapron platform key is not configured on the server"
        : "Vapron DNS rejected the record — see server logs";
    return { type: record.type, name: record.name, status: "failed", error: reason };
  }
}

export async function configureVapron(records: AutoConfigRecord[]): Promise<AutoConfigResult> {
  if (!records.length) {
    return { success: false, records: [], error: "No DNS records to configure" };
  }
  if (!isVapronConfigured()) {
    return {
      success: false,
      records: [],
      error:
        "Vapron platform connection is not configured on this server (VAPRON_API_KEY missing).",
    };
  }

  const firstRecord = records[0];
  if (!firstRecord) {
    return { success: false, records: [], error: "No DNS records to configure" };
  }

  let zone: { id: string; name: string } | null;
  try {
    const zones = await vapron.dns.listZones();
    zone = findZone(zones, firstRecord.name);
  } catch (err) {
    // This is the KNOWN-BROKEN transport, not a transient outage, so the
    // message says so rather than inviting a pointless retry.
    //
    // When Craig supplied working Vapron docs, email/AI/storage were rewritten
    // onto the real REST API at vapron.ai/api/platform. The DNS methods were
    // deliberately left on the original transport — api.vapron.ai/api/trpc
    // with a tRPC envelope — which was guessed against unpublished docs and has
    // never been confirmed to exist. Guessing is what broke it the first time,
    // so it was not guessed at again. See CLAUDE.md issue #83.
    console.error(
      "[dns-autoconfig:vapron] zone lookup failed. The DNS methods still use the " +
        "unverified tRPC transport (see lib/vapron.ts) — this is expected to fail " +
        "until the real Vapron DNS API shape is known. Underlying error:",
      err,
    );
    return {
      success: false,
      records: [],
      error:
        "Automatic DNS setup for Vapron isn't working yet — the integration was " +
        "built against an unpublished API and has never been verified. This is a " +
        "known gap, not a temporary outage, so retrying will not help. " +
        "Your DNS records are ready and correct: copy them from the list on this " +
        "page and add them in Vapron's DNS panel by hand. Everything else about " +
        "the domain — verification, DKIM, sending — works normally once they are in.",
    };
  }

  if (!zone) {
    return {
      success: false,
      records: [],
      error:
        "This domain has no zone on Vapron DNS yet. Create the zone in Vapron (or use Connect Domain there) and point the registrar's nameservers at ns1.vapron.ai / ns2.vapron.ai, then retry.",
    };
  }

  let existing: VapronDnsRecord[];
  try {
    const zoneDetail = await vapron.dns.getZone(zone.id);
    existing = zoneDetail.records;
  } catch (err) {
    console.error("[dns-autoconfig:vapron] record listing failed:", err);
    return {
      success: false,
      records: [],
      error: "Could not read the zone's existing records from Vapron DNS — see server logs.",
    };
  }

  // Sequential on purpose: each upsert bumps the zone serial on the Vapron
  // side; hammering it concurrently gains nothing and risks write conflicts.
  const results: AutoConfigRecordResult[] = [];
  for (const record of records) {
    results.push(await upsertRecord(zone.id, existing, record));
  }

  return {
    success: results.every((r) => r.status !== "failed"),
    records: results,
  };
}
