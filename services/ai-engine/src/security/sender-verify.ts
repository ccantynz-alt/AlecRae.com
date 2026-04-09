/**
 * @emailed/ai-engine — Real-Time Sender Verification (B5)
 *
 * Verifies a sender's legitimacy using SPF/DKIM/DMARC headers, domain age via
 * WHOIS, MX presence via DNS, a known-services registry, and a heuristic
 * reputation score. Returns UI-ready indicators for badge rendering.
 *
 * No external dependencies beyond the Node built-ins (`dns/promises`, `net`),
 * which are available in Bun. Network failures degrade gracefully — every
 * lookup is wrapped, has a short timeout, and never throws upward.
 */

import { promises as dns } from "node:dns";
import net from "node:net";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SenderVerificationIndicator {
  readonly type: "positive" | "negative" | "neutral";
  readonly message: string;
}

export type SenderTrustLevel = "high" | "medium" | "low" | "suspicious";

export interface TyposquatMatch {
  readonly brand: string;
  readonly legitimateDomain: string;
  readonly distance: number;
  readonly technique: "levenshtein" | "substring" | "homograph";
}

export interface DnsAuthRecords {
  readonly spfRecord: string | null;
  readonly dmarcRecord: string | null;
  readonly hasDkimSelector: boolean;
}

export interface SenderVerification {
  readonly email: string;
  readonly domain: string;
  readonly spfPass: boolean;
  readonly dkimPass: boolean;
  readonly dmarcPass: boolean;
  readonly domainAge: number | null;
  readonly reputationScore: number;
  readonly isKnownService: boolean;
  readonly knownServiceName: string | null;
  readonly hasMxRecords: boolean;
  readonly isFreeEmailProvider: boolean;
  readonly hasRecentNews: boolean;
  readonly recentNewsHeadlines: readonly string[];
  readonly trustLevel: SenderTrustLevel;
  readonly indicators: readonly SenderVerificationIndicator[];
  readonly typosquatMatch: TyposquatMatch | null;
  readonly dnsAuth: DnsAuthRecords;
}

// ─── Known services registry ─────────────────────────────────────────────────

interface KnownService {
  readonly name: string;
  readonly domains: readonly string[];
}

const KNOWN_SERVICES: readonly KnownService[] = [
  { name: "GitHub", domains: ["github.com", "noreply.github.com"] },
  { name: "Stripe", domains: ["stripe.com"] },
  { name: "Google", domains: ["google.com", "accounts.google.com", "gmail.com"] },
  { name: "Microsoft", domains: ["microsoft.com", "outlook.com", "office365.com", "office.com", "live.com"] },
  { name: "Apple", domains: ["apple.com", "icloud.com", "me.com"] },
  { name: "Amazon", domains: ["amazon.com", "amazon.co.uk", "aws.amazon.com"] },
  { name: "PayPal", domains: ["paypal.com", "paypal.me"] },
  { name: "Slack", domains: ["slack.com"] },
  { name: "Notion", domains: ["notion.so", "notion.com"] },
  { name: "Linear", domains: ["linear.app"] },
  { name: "Figma", domains: ["figma.com"] },
  { name: "Vercel", domains: ["vercel.com"] },
  { name: "Cloudflare", domains: ["cloudflare.com"] },
  { name: "Anthropic", domains: ["anthropic.com"] },
  { name: "OpenAI", domains: ["openai.com"] },
  { name: "Dropbox", domains: ["dropbox.com", "dropboxmail.com"] },
  { name: "LinkedIn", domains: ["linkedin.com"] },
  { name: "Atlassian", domains: ["atlassian.com", "atlassian.net"] },
  { name: "Zoom", domains: ["zoom.us"] },
  { name: "DocuSign", domains: ["docusign.com", "docusign.net"] },
];

const FREE_EMAIL_PROVIDERS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "ymail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "tutanota.com",
  "fastmail.com",
  "gmx.com",
  "gmx.net",
  "zoho.com",
  "yandex.com",
  "mail.com",
]);

// ─── Brand registry for typosquatting detection ─────────────────────────────

const BRAND_DOMAINS: ReadonlyMap<string, readonly string[]> = new Map([
  ["paypal", ["paypal.com"]],
  ["apple", ["apple.com", "icloud.com"]],
  ["google", ["google.com", "gmail.com"]],
  ["microsoft", ["microsoft.com", "outlook.com", "office.com", "live.com"]],
  ["amazon", ["amazon.com", "aws.amazon.com"]],
  ["netflix", ["netflix.com"]],
  ["facebook", ["facebook.com", "meta.com"]],
  ["instagram", ["instagram.com"]],
  ["chase", ["chase.com"]],
  ["wellsfargo", ["wellsfargo.com"]],
  ["bankofamerica", ["bankofamerica.com"]],
  ["dropbox", ["dropbox.com"]],
  ["github", ["github.com"]],
  ["stripe", ["stripe.com"]],
  ["linkedin", ["linkedin.com"]],
  ["docusign", ["docusign.com"]],
  ["slack", ["slack.com"]],
  ["zoom", ["zoom.us"]],
  ["twitter", ["twitter.com", "x.com"]],
  ["coinbase", ["coinbase.com"]],
  ["binance", ["binance.com"]],
]);

// ─── Levenshtein distance ───────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n] ?? 0;
}

function containsNonAscii(s: string): boolean {
  return /[^\x00-\x7f]/.test(s);
}

// ─── Typosquatting detection ────────────────────────────────────────────────

function detectTyposquat(domain: string): TyposquatMatch | null {
  const base = (domain.split(".")[0] ?? "").toLowerCase();
  if (base.length < 3) return null;

  // Check for homograph/punycode attack first
  if (domain.startsWith("xn--") || domain.includes(".xn--") || containsNonAscii(domain)) {
    // Try to find which brand it mimics
    for (const [brand, brandDomains] of BRAND_DOMAINS) {
      if (brandDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) return null;
      if (levenshtein(base, brand) <= 3) {
        return {
          brand,
          legitimateDomain: brandDomains[0] ?? brand,
          distance: levenshtein(base, brand),
          technique: "homograph",
        };
      }
    }
    return {
      brand: "unknown",
      legitimateDomain: domain,
      distance: 0,
      technique: "homograph",
    };
  }

  for (const [brand, brandDomains] of BRAND_DOMAINS) {
    // Skip if this IS the legitimate domain
    if (brandDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) return null;

    const distance = levenshtein(base, brand);
    if (distance > 0 && distance <= 2) {
      return {
        brand,
        legitimateDomain: brandDomains[0] ?? brand,
        distance,
        technique: "levenshtein",
      };
    }
    // Substring inclusion: e.g. "paypal-secure.com"
    if (base.includes(brand) && base !== brand) {
      return {
        brand,
        legitimateDomain: brandDomains[0] ?? brand,
        distance: 0,
        technique: "substring",
      };
    }
  }
  return null;
}

// ─── DNS-based auth record lookup ───────────────────────────────────────────

async function lookupDnsAuthRecords(domain: string): Promise<DnsAuthRecords> {
  const [spfResult, dmarcResult, dkimResult] = await Promise.all([
    withTimeout(dns.resolveTxt(domain), 2_000).catch((): string[][] => []),
    withTimeout(dns.resolveTxt(`_dmarc.${domain}`), 2_000).catch((): string[][] => []),
    // Check common DKIM selectors
    withTimeout(dns.resolveTxt(`default._domainkey.${domain}`), 2_000)
      .then((): boolean => true)
      .catch((): Promise<boolean> =>
        withTimeout(dns.resolveTxt(`google._domainkey.${domain}`), 2_000)
          .then((): boolean => true)
          .catch((): Promise<boolean> =>
            withTimeout(dns.resolveTxt(`selector1._domainkey.${domain}`), 2_000)
              .then((): boolean => true)
              .catch((): boolean => false),
          ),
      ),
  ]);

  const spfRecord = spfResult
    .map((r) => r.join(""))
    .find((r) => r.startsWith("v=spf1")) ?? null;

  const dmarcRecord = dmarcResult
    .map((r) => r.join(""))
    .find((r) => r.startsWith("v=DMARC1")) ?? null;

  return {
    spfRecord,
    dmarcRecord,
    hasDkimSelector: dkimResult,
  };
}

// ─── Header parsing — SPF / DKIM / DMARC ─────────────────────────────────────

interface AuthResults {
  readonly spfPass: boolean;
  readonly dkimPass: boolean;
  readonly dmarcPass: boolean;
}

function lowercaseHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

function parseAuthenticationResults(
  headers: Record<string, string>,
): AuthResults {
  const lower = lowercaseHeaders(headers);
  const ar = lower["authentication-results"] ?? "";

  const spfMatch = /\bspf=(\w+)/i.exec(ar);
  const dkimMatch = /\bdkim=(\w+)/i.exec(ar);
  const dmarcMatch = /\bdmarc=(\w+)/i.exec(ar);

  // Fall back to Received-SPF header if Authentication-Results missing.
  const receivedSpf = lower["received-spf"] ?? "";
  const receivedSpfPass = /^pass\b/i.test(receivedSpf.trim());

  return {
    spfPass:
      (spfMatch !== null && spfMatch[1]?.toLowerCase() === "pass") ||
      receivedSpfPass,
    dkimPass: dkimMatch !== null && dkimMatch[1]?.toLowerCase() === "pass",
    dmarcPass: dmarcMatch !== null && dmarcMatch[1]?.toLowerCase() === "pass",
  };
}

// ─── Email/domain helpers ────────────────────────────────────────────────────

function extractDomain(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0) return email.toLowerCase().trim();
  return email.slice(at + 1).toLowerCase().trim();
}

function findKnownService(domain: string): KnownService | null {
  for (const svc of KNOWN_SERVICES) {
    for (const d of svc.domains) {
      if (domain === d || domain.endsWith(`.${d}`)) {
        return svc;
      }
    }
  }
  return null;
}

// ─── DNS lookups ─────────────────────────────────────────────────────────────

async function hasMxRecords(domain: string): Promise<boolean> {
  try {
    const records = await withTimeout(dns.resolveMx(domain), 2_000);
    return Array.isArray(records) && records.length > 0;
  } catch {
    return false;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => {
      clearTimeout(timer);
      resolve(v);
    }).catch((e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

// ─── WHOIS lookup over TCP port 43 ───────────────────────────────────────────
//
// Implements a minimal RFC 3912 client. The IANA WHOIS server is queried first
// to find the authoritative registry, then the registry is queried for the
// domain record. The "Creation Date" line is parsed across the most common
// registry formats. Returns null on any failure (the call must never throw).

async function whoisQuery(server: string, query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: server, port: 43 });
    let data = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("whois timeout"));
    }, 4_000);
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(`${query}\r\n`);
    });
    socket.on("data", (chunk: string) => {
      data += chunk;
    });
    socket.on("end", () => {
      clearTimeout(timer);
      resolve(data);
    });
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

const CREATION_DATE_PATTERNS: readonly RegExp[] = [
  /Creation Date:\s*([0-9T:\-+. Z]+)/i,
  /Created On:\s*([0-9T:\-+. Z/]+)/i,
  /created:\s*([0-9T:\-+. Z]+)/i,
  /Domain Registration Date:\s*([0-9T:\-+. Z]+)/i,
  /Registered on:\s*([0-9T:\-+. Z]+)/i,
];

function parseCreationDate(text: string): Date | null {
  for (const re of CREATION_DATE_PATTERNS) {
    const m = re.exec(text);
    if (m && m[1]) {
      const d = new Date(m[1].trim());
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
}

function parseReferralServer(text: string): string | null {
  const m =
    /(?:Registrar WHOIS Server|whois):\s*([a-z0-9.\-]+)/i.exec(text) ?? null;
  return m && m[1] ? m[1].trim() : null;
}

async function lookupDomainAgeDays(domain: string): Promise<number | null> {
  try {
    const initial = await withTimeout(
      whoisQuery("whois.iana.org", domain),
      4_500,
    );
    let creation = parseCreationDate(initial);
    const referral = parseReferralServer(initial);
    if (!creation && referral) {
      const referralData = await withTimeout(
        whoisQuery(referral, domain),
        4_500,
      );
      creation = parseCreationDate(referralData);
    }
    if (!creation) return null;
    const ageMs = Date.now() - creation.getTime();
    return Math.max(0, Math.floor(ageMs / (1000 * 60 * 60 * 24)));
  } catch {
    return null;
  }
}

// ─── Recent news lookup ──────────────────────────────────────────────────────
//
// Pluggable news fetcher. The default implementation returns an empty result
// (no network), keeping verification offline-safe. Production callers can
// inject a fetcher via `verifySender(..., { newsFetcher })`.

export interface NewsHeadline {
  readonly title: string;
}

export type NewsFetcher = (
  domain: string,
) => Promise<readonly NewsHeadline[]>;

const defaultNewsFetcher: NewsFetcher = async () => [];

// ─── Reputation scoring ──────────────────────────────────────────────────────

interface ScoreInputs {
  readonly auth: AuthResults;
  readonly knownService: KnownService | null;
  readonly hasMx: boolean;
  readonly domainAgeDays: number | null;
  readonly isFreeProvider: boolean;
  readonly typosquat: TyposquatMatch | null;
  readonly dnsAuth: DnsAuthRecords;
}

function computeReputation(inputs: ScoreInputs): number {
  let score = 50;

  if (inputs.knownService) score += 35;
  if (inputs.auth.spfPass) score += 5;
  if (inputs.auth.dkimPass) score += 5;
  if (inputs.auth.dmarcPass) score += 5;
  if (inputs.hasMx) score += 5;

  if (!inputs.auth.spfPass) score -= 10;
  if (!inputs.auth.dkimPass) score -= 5;
  if (!inputs.auth.dmarcPass) score -= 5;
  if (!inputs.hasMx) score -= 25;

  if (inputs.domainAgeDays !== null) {
    if (inputs.domainAgeDays < 7) score -= 35;
    else if (inputs.domainAgeDays < 30) score -= 20;
    else if (inputs.domainAgeDays < 180) score -= 5;
    else if (inputs.domainAgeDays > 365 * 5) score += 10;
  }

  if (inputs.isFreeProvider && !inputs.knownService) score -= 5;

  // Typosquatting is a strong negative signal
  if (inputs.typosquat) {
    if (inputs.typosquat.technique === "homograph") score -= 40;
    else if (inputs.typosquat.technique === "levenshtein" && inputs.typosquat.distance <= 1) score -= 35;
    else if (inputs.typosquat.technique === "levenshtein") score -= 25;
    else if (inputs.typosquat.technique === "substring") score -= 20;
  }

  // DNS auth records: bonus for having SPF/DMARC published even if header check wasn't done
  if (inputs.dnsAuth.spfRecord && !inputs.auth.spfPass) score += 2;
  if (inputs.dnsAuth.dmarcRecord && !inputs.auth.dmarcPass) score += 2;
  if (inputs.dnsAuth.hasDkimSelector && !inputs.auth.dkimPass) score += 2;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function deriveTrustLevel(
  reputation: number,
  knownService: KnownService | null,
  auth: AuthResults,
): SenderTrustLevel {
  if (knownService && auth.spfPass && auth.dkimPass) return "high";
  if (reputation >= 80) return "high";
  if (reputation >= 60) return "medium";
  if (reputation >= 35) return "low";
  return "suspicious";
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface VerifySenderOptions {
  /** Optional injected news fetcher (defaults to no-op). */
  readonly newsFetcher?: NewsFetcher;
  /** Skip WHOIS lookup (e.g. inside firewalled environments). */
  readonly skipWhois?: boolean;
  /** Skip DNS MX lookup. */
  readonly skipDns?: boolean;
}

export async function verifySender(
  email: string,
  headers: Record<string, string>,
  options: VerifySenderOptions = {},
): Promise<SenderVerification> {
  const normalisedEmail = email.trim().toLowerCase();
  const domain = extractDomain(normalisedEmail);

  const auth = parseAuthenticationResults(headers);
  const knownService = findKnownService(domain);
  const isFreeProvider = FREE_EMAIL_PROVIDERS.has(domain);

  const typosquat = knownService ? null : detectTyposquat(domain);

  const [hasMx, domainAgeDays, news, dnsAuth] = await Promise.all([
    options.skipDns ? Promise.resolve(true) : hasMxRecords(domain),
    options.skipWhois ? Promise.resolve(null) : lookupDomainAgeDays(domain),
    (options.newsFetcher ?? defaultNewsFetcher)(domain).catch(
      (): readonly NewsHeadline[] => [],
    ),
    options.skipDns
      ? Promise.resolve({ spfRecord: null, dmarcRecord: null, hasDkimSelector: false } satisfies DnsAuthRecords)
      : lookupDnsAuthRecords(domain),
  ]);

  const reputationScore = computeReputation({
    auth,
    knownService,
    hasMx,
    domainAgeDays,
    isFreeProvider,
    typosquat,
    dnsAuth,
  });

  const trustLevel = deriveTrustLevel(reputationScore, knownService, auth);

  const indicators: SenderVerificationIndicator[] = [];

  if (knownService) {
    indicators.push({
      type: "positive",
      message: `Verified service: ${knownService.name}`,
    });
  }
  if (auth.spfPass) {
    indicators.push({ type: "positive", message: "SPF passed" });
  } else {
    indicators.push({ type: "negative", message: "SPF did not pass" });
  }
  if (auth.dkimPass) {
    indicators.push({ type: "positive", message: "DKIM signature valid" });
  } else {
    indicators.push({ type: "negative", message: "DKIM did not pass" });
  }
  if (auth.dmarcPass) {
    indicators.push({ type: "positive", message: "DMARC aligned" });
  } else {
    indicators.push({ type: "negative", message: "DMARC did not pass" });
  }
  if (hasMx) {
    indicators.push({
      type: "positive",
      message: "Domain has valid MX records",
    });
  } else {
    indicators.push({
      type: "negative",
      message: "Domain has no MX records — cannot receive mail",
    });
  }
  if (domainAgeDays !== null) {
    if (domainAgeDays < 30) {
      indicators.push({
        type: "negative",
        message: `Domain registered ${domainAgeDays} day${domainAgeDays === 1 ? "" : "s"} ago`,
      });
    } else if (domainAgeDays < 365) {
      indicators.push({
        type: "neutral",
        message: `Domain is ${Math.round(domainAgeDays / 30)} months old`,
      });
    } else {
      indicators.push({
        type: "positive",
        message: `Domain is ${Math.floor(domainAgeDays / 365)} year${domainAgeDays >= 730 ? "s" : ""} old`,
      });
    }
  } else {
    indicators.push({
      type: "neutral",
      message: "Domain age unknown",
    });
  }
  if (isFreeProvider) {
    indicators.push({
      type: "neutral",
      message: "Free email provider",
    });
  }
  if (news.length > 0) {
    indicators.push({
      type: "neutral",
      message: `${news.length} recent news mention${news.length === 1 ? "" : "s"}`,
    });
  }

  // Typosquatting indicators
  if (typosquat) {
    const techniqueLabel =
      typosquat.technique === "homograph"
        ? "uses internationalized characters mimicking"
        : typosquat.technique === "levenshtein"
          ? `is ${typosquat.distance} character${typosquat.distance === 1 ? "" : "s"} away from`
          : "contains the name of";
    indicators.push({
      type: "negative",
      message: `Possible typosquatting: "${domain}" ${techniqueLabel} ${typosquat.brand} (${typosquat.legitimateDomain})`,
    });
  }

  // DNS auth record indicators
  if (dnsAuth.spfRecord) {
    indicators.push({
      type: "positive",
      message: "Domain publishes an SPF record",
    });
  }
  if (dnsAuth.dmarcRecord) {
    indicators.push({
      type: "positive",
      message: "Domain publishes a DMARC policy",
    });
  }
  if (dnsAuth.hasDkimSelector) {
    indicators.push({
      type: "positive",
      message: "Domain has DKIM DNS records",
    });
  }

  return {
    email: normalisedEmail,
    domain,
    spfPass: auth.spfPass,
    dkimPass: auth.dkimPass,
    dmarcPass: auth.dmarcPass,
    domainAge: domainAgeDays,
    reputationScore,
    isKnownService: knownService !== null,
    knownServiceName: knownService?.name ?? null,
    hasMxRecords: hasMx,
    isFreeEmailProvider: isFreeProvider,
    hasRecentNews: news.length > 0,
    recentNewsHeadlines: news.map((n) => n.title),
    trustLevel,
    indicators,
    typosquatMatch: typosquat,
    dnsAuth,
  };
}

export const __internal = {
  parseAuthenticationResults,
  extractDomain,
  findKnownService,
  computeReputation,
  deriveTrustLevel,
  parseCreationDate,
  levenshtein,
  detectTyposquat,
  lookupDnsAuthRecords,
};
