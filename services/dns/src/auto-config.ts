/**
 * Domain Auto-Configuration Service
 *
 * Automatically generates and manages SPF, DKIM, DMARC, MX, and Return-Path
 * DNS records for customer domains. Handles verification via real DNS lookups
 * and health monitoring including DKIM key rotation.
 */

import * as crypto from "node:crypto";
import { promisify } from "node:util";
import * as dns from "node:dns/promises";
import { eq } from "drizzle-orm";
import {
  getDatabase,
  domains as domainsTable,
  dnsRecords as dnsRecordsTable,
} from "@emailed/db";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DKIM_KEY_SIZE = 2048;
const DKIM_SELECTOR_PREFIX = "emailed";
const DKIM_ROTATION_DAYS = 90;
const SPF_MAX_LOOKUPS = 10;

const MX_SERVERS = [
  { host: "mx1.emailed.dev", priority: 10 },
  { host: "mx2.emailed.dev", priority: 20 },
] as const;
const [MX_PRIMARY, MX_SECONDARY] = MX_SERVERS;

const SPF_VALUE = "v=spf1 include:spf.emailed.dev ~all";
const DMARC_VALUE =
  "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@emailed.dev; pct=100";
const RETURN_PATH_CNAME = "bounce.emailed.dev";

const generateKeyPairAsync = promisify(crypto.generateKeyPair);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DnsRecordEntry {
  id: string;
  domainId: string;
  type: "TXT" | "CNAME" | "MX";
  name: string;
  value: string;
  ttl: number;
  priority: number | null;
  verified: boolean;
  purpose: "spf" | "dkim" | "dmarc" | "mx" | "return-path";
}

export interface DomainConfigResult {
  domainId: string;
  domain: string;
  dkimSelector: string;
  dkimPrivateKey: string;
  dkimPublicKey: string;
  records: DnsRecordEntry[];
}

export interface VerificationStatus {
  domainId: string;
  domain: string;
  overall: "verified" | "partial" | "failed";
  spf: RecordVerification;
  dkim: RecordVerification;
  dmarc: RecordVerification;
  mx: RecordVerification;
  returnPath: RecordVerification;
}

export interface RecordVerification {
  verified: boolean;
  expected: string;
  found: string | null;
  error: string | null;
}

export interface HealthReport {
  domainId: string;
  domain: string;
  score: number; // 0-100
  verification: VerificationStatus;
  dkimKeyAge: number | null; // days since key was created
  dkimRotationNeeded: boolean;
  spfLookupCount: number | null;
  spfTooManyLookups: boolean;
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  const bytes = crypto.randomBytes(16);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateDkimSelector(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${DKIM_SELECTOR_PREFIX}${year}${month}`;
}

/**
 * Strip PEM headers/footers and whitespace to get raw base64 for DNS records.
 */
function pemToBase64(pem: string): string {
  return pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
}

/**
 * Generate a 2048-bit RSA key pair for DKIM signing.
 * Returns PEM-encoded keys.
 */
async function generateDkimKeys(): Promise<{
  publicKey: string;
  privateKey: string;
  publicKeyBase64: string;
}> {
  const { publicKey, privateKey } = await generateKeyPairAsync("rsa", {
    modulusLength: DKIM_KEY_SIZE,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const publicKeyBase64 = pemToBase64(publicKey);

  return { publicKey, privateKey, publicKeyBase64 };
}

/**
 * Safely resolve DNS records, returning null on failure.
 */
async function safeResolve(
  hostname: string,
  rrtype: "TXT" | "MX" | "CNAME",
): Promise<string[] | null> {
  try {
    if (rrtype === "TXT") {
      const records = await dns.resolveTxt(hostname);
      // resolveTxt returns string[][] — join each sub-array
      return records.map((chunks) => chunks.join(""));
    }
    if (rrtype === "MX") {
      const records = await dns.resolveMx(hostname);
      return records.map((r) => `${r.priority} ${r.exchange}`);
    }
    if (rrtype === "CNAME") {
      const records = await dns.resolveCname(hostname);
      return records;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Count approximate DNS lookups in an SPF record by counting include/redirect/a/mx mechanisms.
 */
function countSpfLookups(spfRecord: string): number {
  const mechanisms = spfRecord.split(/\s+/);
  let count = 0;
  for (const m of mechanisms) {
    if (
      m.startsWith("include:") ||
      m.startsWith("redirect=") ||
      m.startsWith("a:") ||
      m.startsWith("a/") ||
      m === "a" ||
      m.startsWith("mx:") ||
      m.startsWith("mx/") ||
      m === "mx" ||
      m.startsWith("ptr") ||
      m.startsWith("exists:")
    ) {
      count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// generateDomainConfig
// ---------------------------------------------------------------------------

/**
 * Generate all DNS records required for a sending domain.
 *
 * - Generates DKIM RSA 2048-bit key pair
 * - Stores the private key in the DB (encrypted at rest by the DB layer)
 * - Creates MX, SPF, DKIM, DMARC, and Return-Path records
 * - Stores all records in the `dns_records` table
 * - Returns the full list so the customer can configure their DNS
 */
export async function generateDomainConfig(
  domain: string,
  accountId: string,
): Promise<DomainConfigResult> {
  const db = getDatabase();
  const domainId = generateId();
  const now = new Date();

  // Generate DKIM key pair
  const dkimSelector = generateDkimSelector();
  const { publicKey, privateKey, publicKeyBase64 } = await generateDkimKeys();

  // Build the DNS record entries the customer needs to add
  const dkimDnsValue = `v=DKIM1; k=rsa; p=${publicKeyBase64}`;

  const records: DnsRecordEntry[] = [
    // MX records
    {
      id: generateId(),
      domainId,
      type: "MX",
      name: domain,
      value: MX_PRIMARY.host,
      ttl: 3600,
      priority: MX_PRIMARY.priority,
      verified: false,
      purpose: "mx",
    },
    {
      id: generateId(),
      domainId,
      type: "MX",
      name: domain,
      value: MX_SECONDARY.host,
      ttl: 3600,
      priority: MX_SECONDARY.priority,
      verified: false,
      purpose: "mx",
    },
    // SPF
    {
      id: generateId(),
      domainId,
      type: "TXT",
      name: domain,
      value: SPF_VALUE,
      ttl: 3600,
      priority: null,
      verified: false,
      purpose: "spf",
    },
    // DKIM
    {
      id: generateId(),
      domainId,
      type: "TXT",
      name: `${dkimSelector}._domainkey.${domain}`,
      value: dkimDnsValue,
      ttl: 3600,
      priority: null,
      verified: false,
      purpose: "dkim",
    },
    // DMARC
    {
      id: generateId(),
      domainId,
      type: "TXT",
      name: `_dmarc.${domain}`,
      value: DMARC_VALUE,
      ttl: 3600,
      priority: null,
      verified: false,
      purpose: "dmarc",
    },
    // Return-Path (bounce handling)
    {
      id: generateId(),
      domainId,
      type: "CNAME",
      name: `bounce.${domain}`,
      value: RETURN_PATH_CNAME,
      ttl: 3600,
      priority: null,
      verified: false,
      purpose: "return-path",
    },
  ];

  // Insert domain record
  await db.insert(domainsTable).values({
    id: domainId,
    accountId,
    domain,
    verificationStatus: "pending",
    dkimSelector,
    dkimPublicKey: publicKey,
    dkimPrivateKey: privateKey,
    spfRecord: SPF_VALUE,
    dmarcPolicy: "quarantine",
    dmarcRecord: DMARC_VALUE,
    returnPathDomain: `bounce.${domain}`,
    isActive: false,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  });

  // Insert DNS records
  const dbRecords = records.map((r) => ({
    id: r.id,
    domainId: r.domainId,
    type: r.type as "TXT" | "CNAME" | "MX" | "A" | "AAAA",
    name: r.name,
    value: r.value,
    ttl: r.ttl,
    priority: r.priority,
    verified: r.verified,
  }));

  if (dbRecords.length > 0) {
    await db.insert(dnsRecordsTable).values(dbRecords);
  }

  return {
    domainId,
    domain,
    dkimSelector,
    dkimPrivateKey: privateKey,
    dkimPublicKey: publicKey,
    records,
  };
}

// ---------------------------------------------------------------------------
// verifyDomainConfig
// ---------------------------------------------------------------------------

/**
 * Verify all DNS records for a domain via actual DNS lookups.
 *
 * Checks SPF, DKIM, DMARC, MX, and Return-Path records.
 * Updates the domain and dns_records tables with verification results.
 */
export async function verifyDomainConfig(
  domainId: string,
): Promise<VerificationStatus> {
  const db = getDatabase();

  // Fetch domain record
  const [domainRecord] = await db
    .select()
    .from(domainsTable)
    .where(eq(domainsTable.id, domainId))
    .limit(1);

  if (!domainRecord) {
    throw new Error(`Domain not found: ${domainId}`);
  }

  const domain = domainRecord.domain;
  const now = new Date();

  // Update status to verifying
  await db
    .update(domainsTable)
    .set({
      verificationStatus: "verifying",
      verificationAttempts: domainRecord.verificationAttempts + 1,
      lastVerificationAttempt: now,
      updatedAt: now,
    })
    .where(eq(domainsTable.id, domainId));

  // --- SPF Verification ---
  const spfResult = await verifySPF(domain);

  // --- DKIM Verification ---
  const dkimResult = await verifyDKIM(
    domain,
    domainRecord.dkimSelector,
    domainRecord.dkimPublicKey,
  );

  // --- DMARC Verification ---
  const dmarcResult = await verifyDMARC(domain);

  // --- MX Verification ---
  const mxResult = await verifyMX(domain);

  // --- Return-Path Verification ---
  const returnPathResult = await verifyReturnPath(domain);

  // Determine overall status
  const allCore =
    spfResult.verified && dkimResult.verified && dmarcResult.verified;
  const allVerified = allCore && mxResult.verified && returnPathResult.verified;
  const anyVerified =
    spfResult.verified ||
    dkimResult.verified ||
    dmarcResult.verified ||
    mxResult.verified ||
    returnPathResult.verified;

  const overall: "verified" | "partial" | "failed" = allVerified
    ? "verified"
    : anyVerified
      ? "partial"
      : "failed";

  const dbStatus = allVerified ? "verified" : "pending";

  // Persist results
  await db
    .update(domainsTable)
    .set({
      verificationStatus: dbStatus,
      spfVerified: spfResult.verified,
      dkimVerified: dkimResult.verified,
      dmarcVerified: dmarcResult.verified,
      returnPathVerified: returnPathResult.verified,
      isActive: allVerified,
      verifiedAt: allVerified ? now : domainRecord.verifiedAt,
      updatedAt: now,
    })
    .where(eq(domainsTable.id, domainId));

  // Update individual DNS record verified flags
  const dnsRows = await db
    .select()
    .from(dnsRecordsTable)
    .where(eq(dnsRecordsTable.domainId, domainId));

  for (const row of dnsRows) {
    let verified = false;
    if (row.value.startsWith("v=spf1")) {
      verified = spfResult.verified;
    } else if (row.value.startsWith("v=DKIM1")) {
      verified = dkimResult.verified;
    } else if (row.value.startsWith("v=DMARC1")) {
      verified = dmarcResult.verified;
    } else if (row.type === "MX") {
      verified = mxResult.verified;
    } else if (row.type === "CNAME" && row.name.startsWith("bounce.")) {
      verified = returnPathResult.verified;
    }

    await db
      .update(dnsRecordsTable)
      .set({ verified, lastCheckedAt: now })
      .where(eq(dnsRecordsTable.id, row.id));
  }

  return {
    domainId,
    domain,
    overall,
    spf: spfResult,
    dkim: dkimResult,
    dmarc: dmarcResult,
    mx: mxResult,
    returnPath: returnPathResult,
  };
}

// ---------------------------------------------------------------------------
// DNS verification helpers
// ---------------------------------------------------------------------------

async function verifySPF(domain: string): Promise<RecordVerification> {
  const expected = "include:spf.emailed.dev";
  const txtRecords = await safeResolve(domain, "TXT");

  if (!txtRecords) {
    return { verified: false, expected, found: null, error: "DNS lookup failed" };
  }

  const spfRecords = txtRecords.filter((r) => r.startsWith("v=spf1"));
  if (spfRecords.length === 0) {
    return { verified: false, expected, found: null, error: "No SPF record found" };
  }

  const hasOurInclude = spfRecords.some((r) => r.includes("include:spf.emailed.dev"));
  return {
    verified: hasOurInclude,
    expected,
    found: spfRecords[0] ?? null,
    error: hasOurInclude ? null : "SPF record does not include spf.emailed.dev",
  };
}

async function verifyDKIM(
  domain: string,
  selector: string | null,
  storedPublicKey: string | null,
): Promise<RecordVerification> {
  if (!selector) {
    return { verified: false, expected: "DKIM record", found: null, error: "No DKIM selector configured" };
  }

  const dkimHost = `${selector}._domainkey.${domain}`;
  const expectedKeyBase64 = storedPublicKey ? pemToBase64(storedPublicKey) : null;
  const txtRecords = await safeResolve(dkimHost, "TXT");

  if (!txtRecords) {
    return {
      verified: false,
      expected: `v=DKIM1 record at ${dkimHost}`,
      found: null,
      error: "DNS lookup failed for DKIM record",
    };
  }

  const dkimRecords = txtRecords.filter((r) => r.startsWith("v=DKIM1"));
  if (dkimRecords.length === 0) {
    return {
      verified: false,
      expected: `v=DKIM1 record at ${dkimHost}`,
      found: null,
      error: "No DKIM record found",
    };
  }

  // If we have the stored public key, verify the published key matches
  if (expectedKeyBase64) {
    const publishedRecord = dkimRecords[0];
    if (!publishedRecord) {
      return {
        verified: false,
        expected: `v=DKIM1 with matching public key`,
        found: null,
        error: "No DKIM record found",
      };
    }
    const pMatch = publishedRecord.match(/p=([A-Za-z0-9+/=]+)/);
    const publishedKey = pMatch ? pMatch[1] : null;

    if (publishedKey && publishedKey === expectedKeyBase64) {
      return {
        verified: true,
        expected: `v=DKIM1 with matching public key`,
        found: publishedRecord,
        error: null,
      };
    }

    return {
      verified: false,
      expected: `v=DKIM1 with matching public key`,
      found: publishedRecord,
      error: "DKIM public key does not match the generated key",
    };
  }

  // No stored key to compare — just verify the record exists
  return {
    verified: true,
    expected: `v=DKIM1 record at ${dkimHost}`,
    found: dkimRecords[0] ?? null,
    error: null,
  };
}

async function verifyDMARC(domain: string): Promise<RecordVerification> {
  const dmarcHost = `_dmarc.${domain}`;
  const txtRecords = await safeResolve(dmarcHost, "TXT");

  if (!txtRecords) {
    return {
      verified: false,
      expected: "v=DMARC1 record",
      found: null,
      error: "DNS lookup failed for DMARC record",
    };
  }

  const dmarcRecords = txtRecords.filter((r) => r.startsWith("v=DMARC1"));
  if (dmarcRecords.length === 0) {
    return {
      verified: false,
      expected: "v=DMARC1 record",
      found: null,
      error: "No DMARC record found",
    };
  }

  const record = dmarcRecords[0];
  if (!record) {
    return {
      verified: false,
      expected: "v=DMARC1 record",
      found: null,
      error: "No DMARC record found",
    };
  }
  // Verify it has a valid policy
  const policyMatch = record.match(/;\s*p=(none|quarantine|reject)/);
  if (!policyMatch) {
    return {
      verified: false,
      expected: "v=DMARC1 with valid policy",
      found: record,
      error: "DMARC record missing valid policy (p=none|quarantine|reject)",
    };
  }

  return {
    verified: true,
    expected: "v=DMARC1 with valid policy",
    found: record,
    error: null,
  };
}

async function verifyMX(domain: string): Promise<RecordVerification> {
  const expectedHosts = MX_SERVERS.map((s) => s.host.toLowerCase());
  const mxRecords = await safeResolve(domain, "MX");

  if (!mxRecords) {
    return {
      verified: false,
      expected: expectedHosts.join(", "),
      found: null,
      error: "DNS lookup failed for MX records",
    };
  }

  if (mxRecords.length === 0) {
    return {
      verified: false,
      expected: expectedHosts.join(", "),
      found: null,
      error: "No MX records found",
    };
  }

  // Check that at least one of our MX servers is listed
  const foundExchanges = mxRecords.map((r) => {
    // MX resolve returns "priority exchange" from our safeResolve
    const parts = r.split(" ");
    return (parts[1] ?? "").toLowerCase().replace(/\.$/, "");
  });

  const hasOurMx = expectedHosts.some((host) => foundExchanges.includes(host));

  return {
    verified: hasOurMx,
    expected: expectedHosts.join(", "),
    found: mxRecords.join("; "),
    error: hasOurMx ? null : "None of the expected MX servers found in DNS",
  };
}

async function verifyReturnPath(domain: string): Promise<RecordVerification> {
  const bounceHost = `bounce.${domain}`;
  const cnameRecords = await safeResolve(bounceHost, "CNAME");

  if (!cnameRecords) {
    return {
      verified: false,
      expected: `CNAME to ${RETURN_PATH_CNAME}`,
      found: null,
      error: "DNS lookup failed for Return-Path CNAME",
    };
  }

  if (cnameRecords.length === 0) {
    return {
      verified: false,
      expected: `CNAME to ${RETURN_PATH_CNAME}`,
      found: null,
      error: "No CNAME record found for bounce subdomain",
    };
  }

  const normalized = cnameRecords.map((r) =>
    r.toLowerCase().replace(/\.$/, ""),
  );
  const hasOurCname = normalized.includes(RETURN_PATH_CNAME);

  return {
    verified: hasOurCname,
    expected: `CNAME to ${RETURN_PATH_CNAME}`,
    found: cnameRecords.join(", "),
    error: hasOurCname ? null : `CNAME does not point to ${RETURN_PATH_CNAME}`,
  };
}

// ---------------------------------------------------------------------------
// checkDomainHealth
// ---------------------------------------------------------------------------

/**
 * Run a comprehensive health check on a domain's email configuration.
 *
 * - Runs all verification checks
 * - Checks DKIM key age and rotation need
 * - Checks SPF record for too many DNS lookups
 * - Returns a health score (0-100) and actionable recommendations
 */
export async function checkDomainHealth(
  domainId: string,
): Promise<HealthReport> {
  const db = getDatabase();

  // Fetch domain record
  const [domainRecord] = await db
    .select()
    .from(domainsTable)
    .where(eq(domainsTable.id, domainId))
    .limit(1);

  if (!domainRecord) {
    throw new Error(`Domain not found: ${domainId}`);
  }

  // Run full verification
  const verification = await verifyDomainConfig(domainId);

  // Check DKIM key age
  let dkimKeyAge: number | null = null;
  let dkimRotationNeeded = false;

  if (domainRecord.createdAt) {
    const ageMs = Date.now() - domainRecord.createdAt.getTime();
    dkimKeyAge = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    dkimRotationNeeded = dkimKeyAge > DKIM_ROTATION_DAYS;
  }

  // Check SPF lookup count
  let spfLookupCount: number | null = null;
  let spfTooManyLookups = false;

  if (verification.spf.found) {
    spfLookupCount = countSpfLookups(verification.spf.found);
    spfTooManyLookups = spfLookupCount > SPF_MAX_LOOKUPS;
  }

  // Calculate health score
  let score = 0;
  const recommendations: string[] = [];

  // Verification score (up to 70 points)
  if (verification.spf.verified) score += 15;
  else recommendations.push("Configure SPF record: add TXT record with 'v=spf1 include:spf.emailed.dev ~all'");

  if (verification.dkim.verified) score += 20;
  else recommendations.push(`Configure DKIM record: add TXT record at ${domainRecord.dkimSelector}._domainkey.${domainRecord.domain}`);

  if (verification.dmarc.verified) score += 15;
  else recommendations.push("Configure DMARC record: add TXT record at _dmarc with 'v=DMARC1; p=quarantine; ...'");

  if (verification.mx.verified) score += 10;
  else recommendations.push("Configure MX records: point to mx1.emailed.dev (priority 10) and mx2.emailed.dev (priority 20)");

  if (verification.returnPath.verified) score += 10;
  else recommendations.push("Configure Return-Path: add CNAME record 'bounce' pointing to bounce.emailed.dev");

  // Key rotation score (up to 15 points)
  if (dkimKeyAge !== null) {
    if (!dkimRotationNeeded) {
      score += 15;
    } else {
      recommendations.push(
        `DKIM key is ${dkimKeyAge} days old (>${DKIM_ROTATION_DAYS} days). Rotate the key via POST /v1/domains/:id/rotate-dkim`,
      );
    }
  }

  // SPF hygiene (up to 15 points)
  if (spfLookupCount !== null) {
    if (!spfTooManyLookups) {
      score += 15;
    } else {
      recommendations.push(
        `SPF record has ${spfLookupCount} DNS lookups (max ${SPF_MAX_LOOKUPS}). Reduce the number of include/redirect mechanisms.`,
      );
    }
  } else {
    // No SPF found, already penalized in verification
  }

  return {
    domainId,
    domain: domainRecord.domain,
    score,
    verification,
    dkimKeyAge,
    dkimRotationNeeded,
    spfLookupCount,
    spfTooManyLookups,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// rotateDkimKey
// ---------------------------------------------------------------------------

/**
 * Rotate the DKIM key for a domain.
 *
 * Generates a new key pair, updates the DNS record in the database,
 * and stores the old selector so dual signing can be maintained for 24h.
 *
 * Returns the new key info and the old selector for the overlap period.
 */
export async function rotateDkimKey(
  domainId: string,
): Promise<{
  newSelector: string;
  oldSelector: string | null;
  dnsRecord: DnsRecordEntry;
}> {
  const db = getDatabase();

  const [domainRecord] = await db
    .select()
    .from(domainsTable)
    .where(eq(domainsTable.id, domainId))
    .limit(1);

  if (!domainRecord) {
    throw new Error(`Domain not found: ${domainId}`);
  }

  const oldSelector = domainRecord.dkimSelector;
  const newSelector = generateDkimSelector() + "-" + Date.now().toString(36);
  const { publicKey, privateKey, publicKeyBase64 } = await generateDkimKeys();
  const dkimDnsValue = `v=DKIM1; k=rsa; p=${publicKeyBase64}`;
  const now = new Date();

  // Update domain with new DKIM key
  await db
    .update(domainsTable)
    .set({
      dkimSelector: newSelector,
      dkimPublicKey: publicKey,
      dkimPrivateKey: privateKey,
      dkimVerified: false,
      updatedAt: now,
    })
    .where(eq(domainsTable.id, domainId));

  // Add new DKIM DNS record (keep old one for overlap period)
  const newRecordId = generateId();
  const dnsRecord: DnsRecordEntry = {
    id: newRecordId,
    domainId,
    type: "TXT",
    name: `${newSelector}._domainkey.${domainRecord.domain}`,
    value: dkimDnsValue,
    ttl: 3600,
    priority: null,
    verified: false,
    purpose: "dkim",
  };

  await db.insert(dnsRecordsTable).values({
    id: newRecordId,
    domainId,
    type: "TXT",
    name: dnsRecord.name,
    value: dnsRecord.value,
    ttl: dnsRecord.ttl,
    priority: null,
    verified: false,
  });

  return {
    newSelector,
    oldSelector,
    dnsRecord,
  };
}
