import { eq } from "drizzle-orm";
import type { RoutingRule, ResolvedRecipient } from "../types.js";

/**
 * Mailbox router: resolves recipients, handles aliases,
 * forwarding rules, and catch-all configurations.
 *
 * When DATABASE_URL is set, domain lookups are performed against
 * the PostgreSQL domains table. Otherwise falls back to in-memory maps.
 */

interface DomainConfig {
  domain: string;
  accountId: string;
  catchAllMailbox?: string;
  enabled: boolean;
}

interface Alias {
  address: string;
  targets: string[];
  enabled: boolean;
}

interface MailboxInfo {
  id: string;
  address: string;
  accountId: string;
  enabled: boolean;
  forwardTo?: string[];
  autoReply?: {
    enabled: boolean;
    subject: string;
    body: string;
  };
}

export class MailboxRouter {
  private domains = new Map<string, DomainConfig>();
  private aliases = new Map<string, Alias>();
  private mailboxes = new Map<string, MailboxInfo>();
  private rules: RoutingRule[] = [];

  /**
   * Look up a domain config, checking the database first (if available),
   * then falling back to the in-memory map.
   */
  private async lookupDomain(domain: string): Promise<DomainConfig | null> {
    // Check in-memory first (fast path)
    const cached = this.domains.get(domain);
    if (cached) return cached;

    // Try database lookup
    if (process.env["DATABASE_URL"]) {
      try {
        const { getDatabase, domains: domainsTable } = await import("@alecrae/db");
        const db = getDatabase();
        const [row] = await db
          .select({
            domain: domainsTable.domain,
            accountId: domainsTable.accountId,
            isActive: domainsTable.isActive,
            verificationStatus: domainsTable.verificationStatus,
          })
          .from(domainsTable)
          .where(eq(domainsTable.domain, domain))
          .limit(1);

        if (row && row.isActive && row.verificationStatus === "verified") {
          const config: DomainConfig = {
            domain: row.domain,
            accountId: row.accountId,
            enabled: true,
          };
          // Cache for subsequent lookups in this session
          this.domains.set(domain, config);
          return config;
        }
      } catch (e) {
        console.warn(`[MailboxRouter] DB domain lookup failed for ${domain}:`, e);
      }
    }

    return null;
  }

  /**
   * Register a domain for receiving mail.
   */
  addDomain(config: DomainConfig): void {
    this.domains.set(config.domain, config);
  }

  /**
   * Register an email alias.
   */
  addAlias(alias: Alias): void {
    this.aliases.set(alias.address.toLowerCase(), alias);
  }

  /**
   * Register a mailbox.
   */
  addMailbox(mailbox: MailboxInfo): void {
    this.mailboxes.set(mailbox.address.toLowerCase(), mailbox);
  }

  /**
   * Add a routing rule.
   */
  addRule(rule: RoutingRule): void {
    this.rules.push(rule);
    // Keep rules sorted by priority (lower number = higher priority)
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Resolve a list of recipient addresses to their final destinations.
   * Handles aliases (with loop detection), forwarding, catch-all, and routing rules.
   */
  async resolve(recipients: string[]): Promise<Map<string, ResolvedRecipient | null>> {
    const results = new Map<string, ResolvedRecipient | null>();

    for (const recipient of recipients) {
      const normalized = recipient.toLowerCase().trim();
      const resolved = await this.resolveOne(normalized, new Set());
      results.set(recipient, resolved);
    }

    return results;
  }

  private async resolveOne(
    address: string,
    visited: Set<string>,
  ): Promise<ResolvedRecipient | null> {
    // Loop detection for alias chains
    if (visited.has(address)) {
      console.warn(`[MailboxRouter] Alias loop detected for ${address}`);
      return null;
    }
    visited.add(address);

    const domain = address.split("@")[1];
    if (!domain) return null;

    // Check if we handle this domain (DB-backed with in-memory fallback)
    const domainConfig = await this.lookupDomain(domain);
    if (!domainConfig || !domainConfig.enabled) {
      return null; // Domain not managed by us
    }

    // 1. Check explicit routing rules first
    const rule = this.matchRule(address);
    if (rule) {
      return this.applyRule(rule, address, domainConfig);
    }

    // 2. Check aliases (recursively resolve targets)
    const alias = this.aliases.get(address);
    if (alias && alias.enabled) {
      // Resolve the first target (for single-delivery; multi-delivery needs expansion)
      for (const target of alias.targets) {
        const resolved = await this.resolveOne(target.toLowerCase(), visited);
        if (resolved) {
          return {
            ...resolved,
            originalAddress: address,
          };
        }
      }
      return null;
    }

    // 3. Check direct mailbox
    const mailbox = this.mailboxes.get(address);
    if (mailbox && mailbox.enabled) {
      return {
        originalAddress: address,
        resolvedAddress: address,
        mailboxId: mailbox.id,
        accountId: mailbox.accountId,
        rule: {
          id: `direct:${mailbox.id}`,
          pattern: address,
          type: "exact",
          action: "deliver",
          destination: mailbox.id,
          priority: 0,
        },
      };
    }

    // 4. Check sub-addressing (plus addressing): user+tag@domain -> user@domain
    const plusIdx = address.indexOf("+");
    if (plusIdx > 0) {
      const baseAddress = address.slice(0, plusIdx) + "@" + domain;
      const baseMailbox = this.mailboxes.get(baseAddress);
      if (baseMailbox && baseMailbox.enabled) {
        return {
          originalAddress: address,
          resolvedAddress: baseAddress,
          mailboxId: baseMailbox.id,
          accountId: baseMailbox.accountId,
          rule: {
            id: `subaddr:${baseMailbox.id}`,
            pattern: `${address.slice(0, plusIdx)}+*@${domain}`,
            type: "prefix",
            action: "deliver",
            destination: baseMailbox.id,
            priority: 1,
          },
        };
      }
    }

    // 5. Catch-all for domain
    if (domainConfig.catchAllMailbox) {
      const catchAllAddress = `${domainConfig.catchAllMailbox}@${domain}`;
      const catchAllMailbox = this.mailboxes.get(catchAllAddress);
      if (catchAllMailbox && catchAllMailbox.enabled) {
        return {
          originalAddress: address,
          resolvedAddress: catchAllAddress,
          mailboxId: catchAllMailbox.id,
          accountId: catchAllMailbox.accountId,
          rule: {
            id: `catchall:${domain}`,
            pattern: `*@${domain}`,
            type: "catch-all",
            action: "deliver",
            destination: catchAllMailbox.id,
            priority: 999,
          },
        };
      }
    }

    // 6. Default: deliver to account inbox if domain is verified
    //    This ensures inbound mail to any address on a managed domain
    //    is stored, even without explicit mailbox/alias configuration.
    return {
      originalAddress: address,
      resolvedAddress: address,
      mailboxId: "inbox",
      accountId: domainConfig.accountId,
      rule: {
        id: `default:${domain}`,
        pattern: `*@${domain}`,
        type: "catch-all",
        action: "deliver",
        destination: "inbox",
        priority: 1000,
      },
    };
  }

  private matchRule(address: string): RoutingRule | undefined {
    for (const rule of this.rules) {
      switch (rule.type) {
        case "exact":
          if (address === rule.pattern.toLowerCase()) return rule;
          break;
        case "prefix":
          if (address.startsWith(rule.pattern.replace("*", "").toLowerCase())) return rule;
          break;
        case "regex": {
          try {
            const regex = new RegExp(rule.pattern, "i");
            if (regex.test(address)) return rule;
          } catch {
            // Invalid regex, skip
          }
          break;
        }
        case "catch-all": {
          const domain = rule.pattern.replace("*@", "");
          if (address.endsWith(`@${domain}`)) return rule;
          break;
        }
      }
    }
    return undefined;
  }

  private applyRule(
    rule: RoutingRule,
    address: string,
    domainConfig: DomainConfig,
  ): ResolvedRecipient | null {
    switch (rule.action) {
      case "deliver": {
        const mailbox = this.mailboxes.get(rule.destination.toLowerCase());
        return mailbox
          ? {
              originalAddress: address,
              resolvedAddress: rule.destination,
              mailboxId: mailbox.id,
              accountId: mailbox.accountId,
              rule,
            }
          : null;
      }
      case "forward":
        return {
          originalAddress: address,
          resolvedAddress: rule.destination,
          mailboxId: `forward:${rule.destination}`,
          accountId: domainConfig.accountId,
          rule,
        };
      case "reject":
      case "drop":
        return null;
      default:
        return null;
    }
  }

  /**
   * Expand aliases: given a recipient, return all final delivery targets.
   * Used when an alias maps to multiple targets.
   */
  async expandRecipients(recipients: string[]): Promise<ResolvedRecipient[]> {
    const expanded: ResolvedRecipient[] = [];
    const seen = new Set<string>();

    const queue = [...recipients];
    while (queue.length > 0) {
      const addr = queue.pop();
      if (addr === undefined) break;
      if (seen.has(addr)) continue;
      seen.add(addr);

      const alias = this.aliases.get(addr.toLowerCase());
      if (alias && alias.enabled) {
        queue.push(...alias.targets);
        continue;
      }

      const resolved = await this.resolveOne(addr.toLowerCase(), new Set());
      if (resolved) {
        expanded.push(resolved);
      }
    }

    return expanded;
  }
}
