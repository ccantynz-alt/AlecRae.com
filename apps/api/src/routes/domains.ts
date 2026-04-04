/**
 * Domains Route — Domain Management, DNS Auto-Configuration & Verification
 *
 * POST   /v1/domains              — Register a new sending domain (auto-generates DNS records)
 * GET    /v1/domains              — List all domains for the account
 * GET    /v1/domains/:id          — Get domain details + DNS records
 * POST   /v1/domains/:id/verify   — Trigger DNS verification check
 * GET    /v1/domains/:id/dns      — Get required DNS records for the domain
 * GET    /v1/domains/:id/health   — Get domain health report
 * POST   /v1/domains/:id/rotate-dkim — Rotate DKIM keys (24h dual signing overlap)
 * DELETE /v1/domains/:id          — Remove a domain
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
import {
  generateDomainConfig,
  verifyDomainConfig,
  checkDomainHealth,
  rotateDkimKey,
} from "@emailed/dns";
import { warmup } from "./warmup.js";

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

    // Generate all DNS records via auto-config
    const config = await generateDomainConfig(input.domain, auth.accountId);

    return c.json(
      {
        data: {
          id: config.domainId,
          domain: config.domain,
          status: "pending",
          dkimSelector: config.dkimSelector,
          spfVerified: false,
          dkimVerified: false,
          dmarcVerified: false,
          returnPathVerified: false,
          isActive: false,
          createdAt: new Date().toISOString(),
          dnsRecords: config.records.map((r) => ({
            type: r.type,
            name: r.name,
            value: r.value,
            ttl: r.ttl,
            priority: r.priority,
            verified: r.verified,
            purpose: r.purpose,
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

    // Verify ownership
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

    // Run verification via auto-config service
    const status = await verifyDomainConfig(id);

    // Fetch updated domain for response
    const [updated] = await db
      .select()
      .from(domainsTable)
      .where(eq(domainsTable.id, id))
      .limit(1);

    const dnsRows = await db
      .select()
      .from(dnsRecordsTable)
      .where(eq(dnsRecordsTable.domainId, id));

    const allVerified = status.overall === "verified";

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
        verification: {
          overall: status.overall,
          spf: status.spf,
          dkim: status.dkim,
          dmarc: status.dmarc,
          mx: status.mx,
          returnPath: status.returnPath,
        },
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
        : "Verification completed. Some DNS records have not been configured yet. See the verification details for specifics.",
    });
  },
);

// GET /v1/domains/:id/dns — Get required DNS records for the domain
domains.get(
  "/:id/dns",
  requireScope("domains:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify ownership
    const [domainRecord] = await db
      .select({ id: domainsTable.id, domain: domainsTable.domain })
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
        domain: domainRecord.domain,
        records: dnsRows.map((r) => ({
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

// GET /v1/domains/:id/health — Get domain health report
domains.get(
  "/:id/health",
  requireScope("domains:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify ownership
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

    const health = await checkDomainHealth(id);

    return c.json({
      data: {
        domain: health.domain,
        score: health.score,
        dkimKeyAge: health.dkimKeyAge,
        dkimRotationNeeded: health.dkimRotationNeeded,
        spfLookupCount: health.spfLookupCount,
        spfTooManyLookups: health.spfTooManyLookups,
        recommendations: health.recommendations,
        verification: {
          overall: health.verification.overall,
          spf: health.verification.spf,
          dkim: health.verification.dkim,
          dmarc: health.verification.dmarc,
          mx: health.verification.mx,
          returnPath: health.verification.returnPath,
        },
      },
    });
  },
);

// POST /v1/domains/:id/rotate-dkim — Rotate DKIM keys
domains.post(
  "/:id/rotate-dkim",
  requireScope("domains:manage"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify ownership
    const [domainRecord] = await db
      .select({
        id: domainsTable.id,
        domain: domainsTable.domain,
        dkimSelector: domainsTable.dkimSelector,
      })
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

    const result = await rotateDkimKey(id);

    return c.json({
      data: {
        domain: domainRecord.domain,
        oldSelector: result.oldSelector,
        newSelector: result.newSelector,
        dnsRecord: {
          type: result.dnsRecord.type,
          name: result.dnsRecord.name,
          value: result.dnsRecord.value,
          ttl: result.dnsRecord.ttl,
        },
      },
      message:
        "DKIM key rotated. Add the new DNS record below. The old key will remain active for 24 hours (dual signing). After 24h, you can remove the old DKIM DNS record.",
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

// Mount warm-up sub-routes: /v1/domains/:id/warmup/*
domains.route("/:id/warmup", warmup);

export { domains };
