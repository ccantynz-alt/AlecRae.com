/**
 * DNS Service Configuration — single source of truth for the AlecRae-owned
 * hostnames that get embedded in customer-facing DNS records (MX, SPF,
 * DMARC, return-path, NS).
 *
 * All values are env-driven with production `.com` defaults that match the
 * canonical records in docs/infra/business-email-domain-onboarding.md and
 * docs/infra/dns-zone-alecrae.md. The old `.dev` placeholder hostnames must
 * never reach a customer domain (CLAUDE.md known issue #26).
 *
 * Environment variables (all optional — defaults are production-correct):
 *   DNS_MX_HOSTS         Comma list of "host:priority" (priority optional;
 *                        defaults to 10, 20, 30 ... by position).
 *                        Example: "mx1.alecrae.com:10,mx2.alecrae.com:20"
 *   DNS_MX_PRIMARY /     Legacy two-var form (used by .env.example). Ignored
 *   DNS_MX_SECONDARY     when DNS_MX_HOSTS is set.
 *   DNS_SPF_INCLUDE      SPF include mechanism, with or without the
 *                        "include:" prefix. Default "include:_spf.alecrae.com".
 *   DNS_DMARC_RUA        DMARC aggregate report address, with or without
 *                        "mailto:". Default "mailto:dmarc@alecrae.com".
 *   DNS_RETURN_PATH_HOST Return-path / bounce CNAME target. Falls back to
 *                        DNS_BOUNCE_DOMAIN. Default "bounce.alecrae.com".
 *   DNS_NS_HOSTS         Comma list of authoritative nameservers.
 *                        Default "ns1.alecrae.com,ns2.alecrae.com".
 */

export interface MxHost {
  readonly host: string;
  readonly priority: number;
}

export interface DnsServiceConfig {
  /** MX hosts in priority order (lowest priority value first). */
  readonly mxHosts: readonly MxHost[];
  /** SPF include mechanism, e.g. "include:_spf.alecrae.com". */
  readonly spfInclude: string;
  /** Full SPF TXT record value, e.g. "v=spf1 include:_spf.alecrae.com ~all". */
  readonly spfValue: string;
  /** DMARC rua target, e.g. "mailto:dmarc@alecrae.com". */
  readonly dmarcRua: string;
  /** Full DMARC TXT record value. */
  readonly dmarcValue: string;
  /** Return-path / bounce CNAME target, e.g. "bounce.alecrae.com". */
  readonly returnPathHost: string;
  /** Authoritative nameserver hostnames, e.g. ["ns1.alecrae.com", "ns2.alecrae.com"]. */
  readonly nsHosts: readonly string[];
  /**
   * The DMARC External Destination Verification record (RFC 7489 §7.1).
   *
   * We publish `_dmarc.customer.com` with `rua=mailto:dmarc@alecrae.com` — a
   * *different* organizational domain from the customer's. RFC 7489 requires
   * the receiving domain to opt in before a reporter will send reports
   * across an organizational boundary, and Google, Microsoft and Yahoo all
   * enforce it. Without this record, a conforming reporter MUST NOT send the
   * aggregate reports at all: every customer domain publishes DMARC and
   * receives nothing, silently.
   *
   * That matters beyond tidiness. Aggregate reports are the primary signal
   * telling us who is spoofing a customer's domain and whether our own mail
   * is passing SPF/DKIM alignment in the wild — the feedback loop that turns
   * a deliverability problem into something we notice before receivers start
   * rejecting mail.
   *
   * A single wildcard covers every customer domain at once, which is the
   * standard approach for a sender operating on behalf of many domains.
   * `null` when the rua is not a mailto: address we can derive a host from.
   */
  readonly dmarcReportAuthorization: DmarcReportAuthorization | null;
}

export interface DmarcReportAuthorization {
  /** Record name, e.g. "*._report._dmarc.alecrae.com". */
  readonly name: string;
  /** Record type — always TXT. */
  readonly type: "TXT";
  /** Record value — the literal string "v=DMARC1". */
  readonly value: string;
  /** Domain the record must be published on: ours, NOT the customer's. */
  readonly publishOn: string;
}

/**
 * Derive the external-authorization record from a `rua` target.
 *
 * Exported so the verification path and the onboarding docs read the same
 * value rather than each hardcoding it.
 */
export function deriveDmarcReportAuthorization(
  dmarcRua: string,
): DmarcReportAuthorization | null {
  const address = dmarcRua.startsWith("mailto:") ? dmarcRua.slice(7) : dmarcRua;
  const host = address.split("@")[1]?.trim().toLowerCase();
  if (!host) return null;

  return {
    // The wildcard form: one record authorizes reports for every domain we
    // send on behalf of, rather than one record per customer onboarded.
    name: `*._report._dmarc.${host}`,
    type: "TXT",
    value: "v=DMARC1",
    publishOn: host,
  };
}

// Production defaults — keep in sync with docs/infra/business-email-domain-onboarding.md
const DEFAULT_MX_HOSTS: readonly MxHost[] = [
  { host: "mx1.alecrae.com", priority: 10 },
  { host: "mx2.alecrae.com", priority: 20 },
];
const DEFAULT_SPF_INCLUDE = "include:_spf.alecrae.com";
const DEFAULT_DMARC_RUA = "mailto:dmarc@alecrae.com";
const DEFAULT_RETURN_PATH_HOST = "bounce.alecrae.com";
const DEFAULT_NS_HOSTS: readonly string[] = ["ns1.alecrae.com", "ns2.alecrae.com"];

function parseCommaList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Parse "host:priority" entries. Priority is optional — entries without one
 * get 10, 20, 30 ... by position. Returns null if nothing valid was parsed.
 */
function parseMxHosts(raw: string): readonly MxHost[] | null {
  const entries = parseCommaList(raw);
  const hosts: MxHost[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const colonIdx = entry.lastIndexOf(":");
    if (colonIdx > 0) {
      const host = entry.slice(0, colonIdx).trim();
      const priority = Number.parseInt(entry.slice(colonIdx + 1), 10);
      if (host.length > 0 && Number.isFinite(priority)) {
        hosts.push({ host, priority });
        continue;
      }
    }
    hosts.push({ host: entry, priority: (i + 1) * 10 });
  }

  return hosts.length > 0 ? hosts : null;
}

function resolveMxHosts(env: NodeJS.ProcessEnv): readonly MxHost[] {
  const list = env["DNS_MX_HOSTS"];
  if (list) {
    const parsed = parseMxHosts(list);
    if (parsed) return parsed;
  }

  // Legacy two-var form from .env.example
  const primary = env["DNS_MX_PRIMARY"]?.trim();
  const secondary = env["DNS_MX_SECONDARY"]?.trim();
  if (primary) {
    const hosts: MxHost[] = [{ host: primary, priority: 10 }];
    if (secondary) hosts.push({ host: secondary, priority: 20 });
    return hosts;
  }

  return DEFAULT_MX_HOSTS;
}

function resolveSpfInclude(env: NodeJS.ProcessEnv): string {
  const raw = env["DNS_SPF_INCLUDE"]?.trim();
  if (!raw) return DEFAULT_SPF_INCLUDE;
  return raw.startsWith("include:") ? raw : `include:${raw}`;
}

function resolveDmarcRua(env: NodeJS.ProcessEnv): string {
  const raw = env["DNS_DMARC_RUA"]?.trim();
  if (!raw) return DEFAULT_DMARC_RUA;
  return raw.startsWith("mailto:") ? raw : `mailto:${raw}`;
}

function resolveReturnPathHost(env: NodeJS.ProcessEnv): string {
  return (
    env["DNS_RETURN_PATH_HOST"]?.trim() ||
    env["DNS_BOUNCE_DOMAIN"]?.trim() ||
    DEFAULT_RETURN_PATH_HOST
  );
}

function resolveNsHosts(env: NodeJS.ProcessEnv): readonly string[] {
  const raw = env["DNS_NS_HOSTS"];
  if (raw) {
    const hosts = parseCommaList(raw);
    if (hosts.length > 0) return hosts;
  }
  return DEFAULT_NS_HOSTS;
}

/**
 * Resolve the DNS service configuration from the environment.
 * Reads `process.env` (or an injected env for tests) on every call so
 * configuration changes are picked up without module-reload tricks.
 */
export function getDnsConfig(env: NodeJS.ProcessEnv = process.env): DnsServiceConfig {
  const spfInclude = resolveSpfInclude(env);
  const dmarcRua = resolveDmarcRua(env);

  return {
    mxHosts: resolveMxHosts(env),
    spfInclude,
    spfValue: `v=spf1 ${spfInclude} ~all`,
    dmarcRua,
    dmarcValue: `v=DMARC1; p=quarantine; rua=${dmarcRua}; pct=100`,
    returnPathHost: resolveReturnPathHost(env),
    nsHosts: resolveNsHosts(env),
    dmarcReportAuthorization: deriveDmarcReportAuthorization(dmarcRua),
  };
}
