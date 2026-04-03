import { Hono } from "hono";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { AddDomainSchema } from "../types.js";
import type { DomainRecord, DnsRecord, AddDomainInput } from "../types.js";

const domains = new Hono();

// In-memory store for development.
const domainStore = new Map<string, DomainRecord>();

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateDkimSelector(): string {
  return `em${Date.now().toString(36)}`;
}

/**
 * Auto-configure DNS records for a domain.
 * Returns the required DNS records for SPF, DKIM, DMARC, and MX.
 */
function generateDnsRecords(domain: string): DnsRecord[] {
  const dkimSelector = generateDkimSelector();

  return [
    {
      type: "TXT",
      host: domain,
      value: "v=spf1 include:spf.emailed.dev ~all",
    },
    {
      type: "CNAME",
      host: `${dkimSelector}._domainkey.${domain}`,
      value: `${dkimSelector}.dkim.emailed.dev`,
    },
    {
      type: "TXT",
      host: `_dmarc.${domain}`,
      value: "v=DMARC1; p=none; rua=mailto:dmarc@emailed.dev; pct=100",
    },
    {
      type: "MX",
      host: domain,
      value: "inbound.emailed.dev",
      priority: 10,
    },
    {
      type: "MX",
      host: domain,
      value: "inbound2.emailed.dev",
      priority: 20,
    },
    {
      type: "TXT",
      host: `_emailed.${domain}`,
      value: `emailed-domain-verification=${generateId()}`,
    },
  ];
}

// POST /v1/domains - Add a domain
domains.post(
  "/",
  requireScope("domains:manage"),
  validateBody(AddDomainSchema),
  async (c) => {
    const input = getValidatedBody<AddDomainInput>(c);
    const auth = c.get("auth");

    // Check for duplicate domain
    for (const existing of domainStore.values()) {
      if (existing.domain === input.domain) {
        return c.json(
          {
            error: {
              type: "conflict",
              message: `Domain ${input.domain} is already registered`,
              code: "domain_exists",
            },
          },
          409,
        );
      }
    }

    const id = generateId();
    const now = new Date().toISOString();
    const dnsRecords = generateDnsRecords(input.domain);

    const record: DomainRecord = {
      id,
      domain: input.domain,
      status: "pending",
      dnsRecords,
      spfVerified: false,
      dkimVerified: false,
      dmarcVerified: false,
      mxVerified: false,
      createdAt: now,
    };

    domainStore.set(id, record);

    return c.json(
      {
        data: record,
        message: "Domain added. Configure the DNS records below, then verify.",
      },
      201,
    );
  },
);

// GET /v1/domains/:id - Get domain verification status
domains.get(
  "/:id",
  requireScope("domains:manage"),
  async (c) => {
    const id = c.req.param("id");
    const record = domainStore.get(id);

    if (!record) {
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

    return c.json({ data: record });
  },
);

// POST /v1/domains/:id/verify - Trigger DNS verification
domains.post(
  "/:id/verify",
  requireScope("domains:manage"),
  async (c) => {
    const id = c.req.param("id");
    const record = domainStore.get(id);

    if (!record) {
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

    // In production: perform actual DNS lookups to verify records.
    // This would query DNS for SPF, DKIM, DMARC, and MX records.
    // For now, return current state and note verification is async.
    record.status = "pending";
    record.spfVerified = false;
    record.dkimVerified = false;
    record.dmarcVerified = false;
    record.mxVerified = false;

    return c.json({
      data: record,
      message: "Verification initiated. DNS propagation may take up to 48 hours.",
    });
  },
);

// GET /v1/domains - List all domains
domains.get(
  "/",
  requireScope("domains:manage"),
  async (c) => {
    const records = Array.from(domainStore.values()).sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt),
    );

    return c.json({ data: records });
  },
);

// DELETE /v1/domains/:id - Remove a domain
domains.delete(
  "/:id",
  requireScope("domains:manage"),
  async (c) => {
    const id = c.req.param("id");
    const record = domainStore.get(id);

    if (!record) {
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

    domainStore.delete(id);

    return c.json({ deleted: true, id });
  },
);

export { domains };
