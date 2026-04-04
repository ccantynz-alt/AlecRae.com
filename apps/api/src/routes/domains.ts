/**
 * Domains Route — Domain Management & DNS Verification
 *
 * POST /v1/domains           — Register a new sending domain
 * GET  /v1/domains           — List all domains for the account
 * GET  /v1/domains/:id       — Get domain details + DNS records
 * POST /v1/domains/:id/verify — Trigger DNS verification check
 * DELETE /v1/domains/:id     — Remove a domain
 */

import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { AddDomainSchema } from "../types.js";
import type { AddDomainInput } from "../types.js";
import {
  getDatabase,
  domains as domainsTable,
  dnsRecords as dnsRecordsTable,
} from "@emailed/db";

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateDkimSelector(): string {
  return `em${Date.now().toString(36)}`;
}

/**
 * Generate a 2048-bit RSA key pair for DKIM signing.
 * Returns PEM-encoded public and private keys.
 */
async function generateDkimKeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );

  const [publicKeyRaw, privateKeyRaw] = await Promise.all([
    crypto.subtle.exportKey("spki", keyPair.publicKey),
    crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
  ]);

  const publicKeyB64 = btoa(
    String.fromCharCode(...new Uint8Array(publicKeyRaw)),
  );
  const privateKeyB64 = btoa(
    String.fromCharCode(...new Uint8Array(privateKeyRaw)),
  );

  // Wrap in PEM format
  const publicKey = `-----BEGIN PUBLIC KEY-----\n${publicKeyB64.match(/.{1,64}/g)!.join("\n")}\n-----END PUBLIC KEY-----`;
  const privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKeyB64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;

  return { publicKey, privateKey };
}

/**
 * Generate DNS records that the customer must configure.
 */
function buildDnsRecords(
  domainId: string,
  domain: string,
  dkimSelector: string,
  verificationToken: string,
): Array<{
  id: string;
  domainId: string;
  type: "TXT" | "CNAME" | "MX";
  name: string;
  value: string;
  ttl: number;
  priority: number | null;
  verified: boolean;
}> {
  return [
    {
      id: generateId(),
      domainId,
      type: "TXT" as const,
      name: domain,
      value: "v=spf1 include:spf.emailed.dev ~all",
      ttl: 3600,
      priority: null,
      verified: false,
    },
    {
      id: generateId(),
      domainId,
      type: "CNAME" as const,
      name: `${dkimSelector}._domainkey.${domain}`,
      value: `${dkimSelector}.dkim.emailed.dev`,
      ttl: 3600,
      priority: null,
      verified: false,
    },
    {
      id: generateId(),
      domainId,
      type: "TXT" as const,
      name: `_dmarc.${domain}`,
      value: "v=DMARC1; p=none; rua=mailto:dmarc@emailed.dev; pct=100",
      ttl: 3600,
      priority: null,
      verified: false,
    },
    {
      id: generateId(),
      domainId,
      type: "MX" as const,
      name: domain,
      value: "inbound.emailed.dev",
      ttl: 3600,
      priority: 10,
      verified: false,
    },
    {
      id: generateId(),
      domainId,
      type: "MX" as const,
      name: domain,
      value: "inbound2.emailed.dev",
      ttl: 3600,
      priority: 20,
      verified: false,
    },
    {
      id: generateId(),
      domainId,
      type: "TXT" as const,
      name: `_emailed.${domain}`,
      value: `emailed-domain-verification=${verificationToken}`,
      ttl: 3600,
      priority: null,
      verified: false,
    },
  ];
}

// ─── Route handler ──────────────────────────────────────────────────────────

const domains = new Hono();

// POST /v1/domains — Register a new sending domain
domains.post(
  "/",
  requireScope("domains:manage"),
  validateBody(AddDomainSchema),
  async (c) => {
    const input = getValidatedBody<AddDomainInput>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Check if domain is already registered (globally unique)
    const [existing] = await db
      .select({ id: domainsTable.id })
      .from(domainsTable)
      .where(eq(domainsTable.domain, input.domain))
      .limit(1);

    if (existing) {
      return c.json(
        {
          error: {
            type: "conflict",
            message: `Domain "${input.domain}" is already registered`,
            code: "domain_exists",
          },
        },
        409,
      );
    }

    // Generate DKIM keys and selector
    const dkimSelector = generateDkimSelector();
    const { publicKey, privateKey } = await generateDkimKeyPair();
    const verificationToken = generateId();

    const id = generateId();
    const now = new Date();

    // Insert the domain record
    await db.insert(domainsTable).values({
      id,
      accountId: auth.accountId,
      domain: input.domain,
      verificationStatus: "pending",
      dkimSelector,
      dkimPublicKey: publicKey,
      dkimPrivateKey: privateKey,
      spfRecord: "v=spf1 include:spf.emailed.dev ~all",
      dmarcPolicy: "none",
      dmarcRecord: "v=DMARC1; p=none; rua=mailto:dmarc@emailed.dev; pct=100",
      isActive: false,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });

    // Insert the DNS records the customer needs to configure
    const records = buildDnsRecords(id, input.domain, dkimSelector, verificationToken);
    if (records.length > 0) {
      await db.insert(dnsRecordsTable).values(records);
    }

    // Fetch back the full domain with DNS records for the response
    const dnsRows = await db
      .select()
      .from(dnsRecordsTable)
      .where(eq(dnsRecordsTable.domainId, id));

    return c.json(
      {
        data: {
          id,
          domain: input.domain,
          status: "pending",
          dkimSelector,
          spfVerified: false,
          dkimVerified: false,
          dmarcVerified: false,
          returnPathVerified: false,
          isActive: false,
          createdAt: now.toISOString(),
          dnsRecords: dnsRows.map((r) => ({
            type: r.type,
            name: r.name,
            value: r.value,
            ttl: r.ttl,
            priority: r.priority,
            verified: r.verified,
          })),
        },
        message:
          "Domain added. Configure the DNS records below in your DNS provider, then call POST /v1/domains/:id/verify.",
      },
      201,
    );
  },
);

// GET /v1/domains/:id — Get domain details with DNS records
domains.get(
  "/:id",
  requireScope("domains:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [domainRecord] = await db
      .select()
      .from(domainsTable)
      .where(
        and(
          eq(domainsTable.id, id),
          eq(domainsTable.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!domainRecord) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Domain ${id} not found`,
            code: "domain_not_found",
          },
        },
        404,
      );
    }

    const dnsRows = await db
      .select()
      .from(dnsRecordsTable)
      .where(eq(dnsRecordsTable.domainId, id));

    return c.json({
      data: {
        id: domainRecord.id,
        domain: domainRecord.domain,
        status: domainRecord.verificationStatus,
        dkimSelector: domainRecord.dkimSelector,
        spfVerified: domainRecord.spfVerified,
        dkimVerified: domainRecord.dkimVerified,
        dmarcVerified: domainRecord.dmarcVerified,
        returnPathVerified: domainRecord.returnPathVerified,
        isActive: domainRecord.isActive,
        isDefault: domainRecord.isDefault,
        createdAt: domainRecord.createdAt.toISOString(),
        updatedAt: domainRecord.updatedAt.toISOString(),
        verifiedAt: domainRecord.verifiedAt?.toISOString() ?? null,
        dnsRecords: dnsRows.map((r) => ({
          type: r.type,
          name: r.name,
          value: r.value,
          ttl: r.ttl,
          priority: r.priority,
          verified: r.verified,
          lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
        })),
      },
    });
  },
);

// GET /v1/domains — List all domains for the account
domains.get(
  "/",
  requireScope("domains:manage"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const domainRows = await db
      .select()
      .from(domainsTable)
      .where(eq(domainsTable.accountId, auth.accountId))
      .orderBy(desc(domainsTable.createdAt));

    const data = domainRows.map((d) => ({
      id: d.id,
      domain: d.domain,
      status: d.verificationStatus,
      spfVerified: d.spfVerified,
      dkimVerified: d.dkimVerified,
      dmarcVerified: d.dmarcVerified,
      returnPathVerified: d.returnPathVerified,
      isActive: d.isActive,
      isDefault: d.isDefault,
      createdAt: d.createdAt.toISOString(),
      verifiedAt: d.verifiedAt?.toISOString() ?? null,
    }));

    return c.json({ data });
  },
);

// POST /v1/domains/:id/verify — Trigger DNS verification check
domains.post(
  "/:id/verify",
  requireScope("domains:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [domainRecord] = await db
      .select()
      .from(domainsTable)
      .where(
        and(
          eq(domainsTable.id, id),
          eq(domainsTable.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!domainRecord) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Domain ${id} not found`,
            code: "domain_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();

    // Update verification status and increment attempt count
    await db
      .update(domainsTable)
      .set({
        verificationStatus: "verifying",
        verificationAttempts: domainRecord.verificationAttempts + 1,
        lastVerificationAttempt: now,
        updatedAt: now,
      })
      .where(eq(domainsTable.id, id));

    // In production, this would enqueue an async DNS verification job
    // that resolves TXT/CNAME/MX records and updates the domain record.
    // For now, we perform a simulated check inline.

    // Attempt DNS lookups for each required record
    let spfVerified = false;
    let dkimVerified = false;
    let dmarcVerified = false;
    let allVerified = false;

    try {
      // Try real DNS resolution if the runtime supports it
      const { resolve } = await import("node:dns/promises");

      // SPF check
      try {
        const txtRecords = await resolve(domainRecord.domain, "TXT");
        const flat = txtRecords.map((r) =>
          Array.isArray(r) ? r.join("") : r,
        );
        spfVerified = flat.some(
          (r) => typeof r === "string" && r.includes("include:spf.emailed.dev"),
        );
      } catch {
        // DNS lookup failed — record not found
      }

      // DKIM check
      if (domainRecord.dkimSelector) {
        try {
          const dkimHost = `${domainRecord.dkimSelector}._domainkey.${domainRecord.domain}`;
          const cnameRecords = await resolve(dkimHost, "CNAME");
          dkimVerified = cnameRecords.some(
            (r) => typeof r === "string" && r.includes("dkim.emailed.dev"),
          );
        } catch {
          // DNS lookup failed
        }
      }

      // DMARC check
      try {
        const dmarcRecords = await resolve(
          `_dmarc.${domainRecord.domain}`,
          "TXT",
        );
        const flat = dmarcRecords.map((r) =>
          Array.isArray(r) ? r.join("") : r,
        );
        dmarcVerified = flat.some(
          (r) => typeof r === "string" && r.includes("v=DMARC1"),
        );
      } catch {
        // DNS lookup failed
      }

      allVerified = spfVerified && dkimVerified && dmarcVerified;
    } catch {
      // DNS module not available — fall back to marking as "verifying"
      // and let a background job handle it.
    }

    // Persist the verification results
    const finalStatus = allVerified ? "verified" : "pending";

    await db
      .update(domainsTable)
      .set({
        verificationStatus: finalStatus,
        spfVerified,
        dkimVerified,
        dmarcVerified,
        isActive: allVerified,
        verifiedAt: allVerified ? now : domainRecord.verifiedAt,
        updatedAt: now,
      })
      .where(eq(domainsTable.id, id));

    // Update individual DNS record verification status
    if (spfVerified) {
      await db
        .update(dnsRecordsTable)
        .set({ verified: true, lastCheckedAt: now })
        .where(
          and(
            eq(dnsRecordsTable.domainId, id),
            eq(dnsRecordsTable.name, domainRecord.domain),
            eq(dnsRecordsTable.type, "TXT"),
          ),
        );
    }

    // Fetch updated state
    const [updated] = await db
      .select()
      .from(domainsTable)
      .where(eq(domainsTable.id, id))
      .limit(1);

    const dnsRows = await db
      .select()
      .from(dnsRecordsTable)
      .where(eq(dnsRecordsTable.domainId, id));

    return c.json({
      data: {
        id: updated!.id,
        domain: updated!.domain,
        status: updated!.verificationStatus,
        spfVerified: updated!.spfVerified,
        dkimVerified: updated!.dkimVerified,
        dmarcVerified: updated!.dmarcVerified,
        returnPathVerified: updated!.returnPathVerified,
        isActive: updated!.isActive,
        verifiedAt: updated!.verifiedAt?.toISOString() ?? null,
        verificationAttempts: updated!.verificationAttempts,
        dnsRecords: dnsRows.map((r) => ({
          type: r.type,
          name: r.name,
          value: r.value,
          ttl: r.ttl,
          priority: r.priority,
          verified: r.verified,
          lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
        })),
      },
      message: allVerified
        ? "All DNS records verified. Domain is now active for sending."
        : "Verification initiated. Some DNS records have not propagated yet. DNS propagation may take up to 48 hours.",
    });
  },
);

// DELETE /v1/domains/:id — Remove a domain
domains.delete(
  "/:id",
  requireScope("domains:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [domainRecord] = await db
      .select({ id: domainsTable.id })
      .from(domainsTable)
      .where(
        and(
          eq(domainsTable.id, id),
          eq(domainsTable.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!domainRecord) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Domain ${id} not found`,
            code: "domain_not_found",
          },
        },
        404,
      );
    }

    // DNS records cascade-delete via the FK constraint
    await db.delete(domainsTable).where(eq(domainsTable.id, id));

    return c.json({ deleted: true, id });
  },
);

export { domains };
