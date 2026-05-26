/**
 * Built-in check definitions for the Sentinel inspection pipeline.
 *
 * These are the actual security/quality checks that run during inspection.
 * Each check is independent and can run in parallel with all others.
 */

import type { CheckDefinition, CheckResult, ConfidenceTier, ValidationItem } from '../types.js';

/**
 * Create all default checks for the email validation pipeline.
 */
export function createDefaultChecks(): CheckDefinition[] {
  return [
    createAuthenticationCheck(),
    createContentSafetyCheck(),
    createLinkAnalysisCheck(),
    createAttachmentRiskCheck(),
    createRateLimitCheck(),
    createDomainAgeCheck(),
    createNetworkOriginCheck(),
    createHeaderIntegrityCheck(),
  ];
}

// ─── Authentication Check ───
// Verifies SPF, DKIM, DMARC results
function createAuthenticationCheck(): CheckDefinition {
  return {
    name: 'authentication',
    minTier: 'PROBABLE' as ConfidenceTier,
    priority: 100,
    timeoutMs: 30,
    deferrable: false,
    execute: async (item: ValidationItem): Promise<CheckResult> => {
      const start = performance.now();
      const payload = item.payload as Record<string, unknown>;
      const headers = (payload['headers'] as Record<string, string>) ?? {};

      let score = 50;
      const details: string[] = [];

      // SPF
      const spf = headers['received-spf'] ?? '';
      if (spf.toLowerCase().includes('pass')) {
        score += 15;
        details.push('SPF: pass');
      } else if (spf.toLowerCase().includes('fail')) {
        score -= 25;
        details.push('SPF: fail');
      } else if (spf.toLowerCase().includes('softfail')) {
        score -= 10;
        details.push('SPF: softfail');
      }

      // DKIM
      const authResults = headers['authentication-results'] ?? '';
      if (authResults.includes('dkim=pass')) {
        score += 20;
        details.push('DKIM: pass');
      } else if (authResults.includes('dkim=fail')) {
        score -= 30;
        details.push('DKIM: fail');
      }

      // DMARC
      if (authResults.includes('dmarc=pass')) {
        score += 15;
        details.push('DMARC: pass');
      } else if (authResults.includes('dmarc=fail')) {
        score -= 30;
        details.push('DMARC: fail');
      }

      const timeUs = (performance.now() - start) * 1000;
      return {
        check: 'authentication',
        passed: score >= 50,
        score: Math.max(0, Math.min(100, score)),
        details: details.join('; '),
        timeUs: Math.round(timeUs),
        async: false,
      };
    },
  };
}

// ─── Content Safety Check ───
// Scans for malicious content patterns, encoded payloads, suspicious formatting
function createContentSafetyCheck(): CheckDefinition {
  return {
    name: 'content_safety',
    minTier: 'UNCERTAIN' as ConfidenceTier,
    priority: 90,
    timeoutMs: 40,
    deferrable: false,
    execute: async (item: ValidationItem): Promise<CheckResult> => {
      const start = performance.now();
      const payload = item.payload as Record<string, unknown>;
      const body = ((payload['body'] as string) ?? '').toLowerCase();
      const subject = ((payload['subject'] as string) ?? '').toLowerCase();
      const combined = `${subject} ${body}`;

      let score = 80;
      const details: string[] = [];

      // Obfuscation patterns (common in spam/phishing)
      const obfuscation = [
        /\u200b|\u200c|\u200d|\ufeff/, // Zero-width characters
        /&#\d{2,4};/,                  // HTML entities in body
        /=\?.*\?[BQ]\?/i,             // Excessive encoded words
      ];
      for (const pattern of obfuscation) {
        if (pattern.test(combined)) {
          score -= 15;
          details.push(`Obfuscation detected: ${pattern.source}`);
        }
      }

      // Social engineering patterns
      const socialEngineering = [
        { pattern: /password.*expir/i, weight: 20, label: 'Password expiry scam' },
        { pattern: /verify.*account.*within/i, weight: 25, label: 'Account verification urgency' },
        { pattern: /unusual.*sign.*in/i, weight: 15, label: 'Fake security alert' },
        { pattern: /wire.*transfer/i, weight: 20, label: 'Wire transfer request' },
        { pattern: /gift.*card/i, weight: 15, label: 'Gift card scam pattern' },
        { pattern: /invoice.*attached/i, weight: 10, label: 'Invoice attachment lure' },
      ];
      for (const se of socialEngineering) {
        if (se.pattern.test(combined)) {
          score -= se.weight;
          details.push(se.label);
        }
      }

      const timeUs = (performance.now() - start) * 1000;
      return {
        check: 'content_safety',
        passed: score >= 40,
        score: Math.max(0, Math.min(100, score)),
        details: details.length > 0 ? details.join('; ') : 'Content appears safe',
        timeUs: Math.round(timeUs),
        async: false,
      };
    },
  };
}

// ─── Link Analysis ───
// Analyzes URLs in the email for suspicious patterns
function createLinkAnalysisCheck(): CheckDefinition {
  return {
    name: 'link_analysis',
    minTier: 'UNCERTAIN' as ConfidenceTier,
    priority: 85,
    timeoutMs: 35,
    deferrable: true, // Full URL scanning can run async
    execute: async (item: ValidationItem): Promise<CheckResult> => {
      const start = performance.now();
      const payload = item.payload as Record<string, unknown>;
      const body = (payload['body'] as string) ?? '';

      const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
      const urls = body.match(urlPattern) ?? [];

      let score = 90;
      const details: string[] = [];

      for (const url of urls) {
        try {
          const parsed = new URL(url);

          // URL shortener detection
          const shorteners = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd'];
          if (shorteners.some((s) => parsed.hostname.endsWith(s))) {
            score -= 10;
            details.push(`URL shortener: ${parsed.hostname}`);
          }

          // IP address in URL (suspicious)
          if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(parsed.hostname)) {
            score -= 25;
            details.push(`IP address URL: ${parsed.hostname}`);
          }

          // Excessive subdomains (often used in phishing)
          const subdomainCount = parsed.hostname.split('.').length;
          if (subdomainCount > 4) {
            score -= 15;
            details.push(`Excessive subdomains: ${parsed.hostname}`);
          }

          // Homograph attack detection (mixed scripts in domain)
          // eslint-disable-next-line no-control-regex
          if (/[^\x00-\x7F]/.test(parsed.hostname)) {
            score -= 30;
            details.push(`Non-ASCII domain (possible homograph): ${parsed.hostname}`);
          }

          // Suspicious paths
          if (parsed.pathname.includes('login') || parsed.pathname.includes('signin')) {
            score -= 10;
            details.push('Login page link detected');
          }
        } catch {
          // Malformed URL itself is suspicious
          score -= 5;
          details.push(`Malformed URL found`);
        }
      }

      // Too many links
      if (urls.length > 20) {
        score -= 15;
        details.push(`Excessive link count: ${urls.length}`);
      }

      const timeUs = (performance.now() - start) * 1000;
      return {
        check: 'link_analysis',
        passed: score >= 40,
        score: Math.max(0, Math.min(100, score)),
        details: details.length > 0 ? details.join('; ') : `${urls.length} links analyzed, all clean`,
        timeUs: Math.round(timeUs),
        async: false,
      };
    },
  };
}

// ─── Attachment Risk ───
// Evaluates attachment risk without opening them
function createAttachmentRiskCheck(): CheckDefinition {
  return {
    name: 'attachment_risk',
    minTier: 'PROBABLE' as ConfidenceTier,
    priority: 95,
    timeoutMs: 20,
    deferrable: false,
    execute: async (item: ValidationItem): Promise<CheckResult> => {
      const start = performance.now();
      const payload = item.payload as Record<string, unknown>;
      const attachments = (payload['attachments'] as Record<string, unknown>[]) ?? [];

      if (attachments.length === 0) {
        return {
          check: 'attachment_risk',
          passed: true,
          score: 95,
          details: 'No attachments',
          timeUs: Math.round((performance.now() - start) * 1000),
          async: false,
        };
      }

      let score = 80;
      const details: string[] = [];

      const dangerousExtensions = [
        '.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.vbs', '.vbe',
        '.js', '.jse', '.wsf', '.wsh', '.ps1', '.msi', '.dll', '.hta',
      ];

      const suspiciousExtensions = [
        '.zip', '.rar', '.7z', '.iso', '.img', '.docm', '.xlsm', '.pptm',
      ];

      for (const attachment of attachments) {
        const filename = ((attachment['filename'] as string) ?? '').toLowerCase();
        const size = (attachment['size'] as number) ?? 0;
        const mimeType = (attachment['mimeType'] as string) ?? '';

        // Dangerous file extensions
        if (dangerousExtensions.some((ext) => filename.endsWith(ext))) {
          score -= 40;
          details.push(`Dangerous attachment: ${filename}`);
        }

        // Suspicious extensions
        if (suspiciousExtensions.some((ext) => filename.endsWith(ext))) {
          score -= 15;
          details.push(`Suspicious attachment: ${filename}`);
        }

        // Double extension trick (e.g., report.pdf.exe)
        const parts = filename.split('.');
        if (parts.length > 2) {
          const lastExt = `.${parts[parts.length - 1]}`;
          if (dangerousExtensions.includes(lastExt)) {
            score -= 35;
            details.push(`Double extension attack: ${filename}`);
          }
        }

        // MIME type mismatch (claiming to be PDF but filename is .exe)
        if (mimeType === 'application/pdf' && !filename.endsWith('.pdf')) {
          score -= 25;
          details.push('MIME type/extension mismatch');
        }

        // Unusually large attachments
        if (size > 25 * 1024 * 1024) {
          score -= 10;
          details.push(`Large attachment: ${Math.round(size / 1024 / 1024)}MB`);
        }
      }

      const timeUs = (performance.now() - start) * 1000;
      return {
        check: 'attachment_risk',
        passed: score >= 30,
        score: Math.max(0, Math.min(100, score)),
        details: details.length > 0 ? details.join('; ') : `${attachments.length} attachments checked, all safe`,
        timeUs: Math.round(timeUs),
        async: false,
      };
    },
  };
}

// ─── Rate Limit Check ───
function createRateLimitCheck(): CheckDefinition {
  return {
    name: 'rate_limit',
    minTier: 'PROBABLE' as ConfidenceTier,
    priority: 100,
    timeoutMs: 5,
    deferrable: false,
    execute: async (item: ValidationItem): Promise<CheckResult> => {
      const start = performance.now();
      const count = item.metadata.previousItemCount;

      let score = 90;
      let details = 'Within rate limits';

      if (count > 5000) {
        score = 5;
        details = `Extreme volume: ${count} items recently`;
      } else if (count > 1000) {
        score = 30;
        details = `High volume: ${count} items recently`;
      } else if (count > 100) {
        score = 60;
        details = `Elevated volume: ${count} items recently`;
      }

      return {
        check: 'rate_limit',
        passed: score >= 30,
        score,
        details,
        timeUs: Math.round((performance.now() - start) * 1000),
        async: false,
      };
    },
  };
}

// ─── Domain Age Check ───
function createDomainAgeCheck(): CheckDefinition {
  return {
    name: 'domain_age',
    minTier: 'UNCERTAIN' as ConfidenceTier,
    priority: 60,
    timeoutMs: 30,
    deferrable: true, // Can verify async if needed
    execute: async (item: ValidationItem): Promise<CheckResult> => {
      const start = performance.now();
      const payload = item.payload as Record<string, unknown>;
      const domainAgeDays = (payload['domainAgeDays'] as number) ?? -1;

      let score = 70;
      let details = 'Domain age unknown';

      if (domainAgeDays >= 0) {
        if (domainAgeDays < 7) {
          score = 15;
          details = `Very new domain: ${domainAgeDays} days old`;
        } else if (domainAgeDays < 30) {
          score = 40;
          details = `New domain: ${domainAgeDays} days old`;
        } else if (domainAgeDays < 365) {
          score = 70;
          details = `Young domain: ${domainAgeDays} days old`;
        } else {
          score = 90;
          details = `Established domain: ${Math.round(domainAgeDays / 365)} years old`;
        }
      }

      return {
        check: 'domain_age',
        passed: score >= 30,
        score,
        details,
        timeUs: Math.round((performance.now() - start) * 1000),
        async: false,
      };
    },
  };
}

// ─── Network Origin Check ───
function createNetworkOriginCheck(): CheckDefinition {
  return {
    name: 'network_origin',
    minTier: 'UNCERTAIN' as ConfidenceTier,
    priority: 70,
    timeoutMs: 25,
    deferrable: true,
    execute: async (item: ValidationItem): Promise<CheckResult> => {
      const start = performance.now();
      const ip = item.metadata.sourceIp;
      const payload = item.payload as Record<string, unknown>;
      const asnInfo = payload['asnInfo'] as Record<string, string> | undefined;

      let score = 70;
      const details: string[] = [];

      // Known hosting/cloud providers (legitimate for sending services)
      const trustedASNs = ['GOOGLE', 'AMAZON', 'MICROSOFT', 'CLOUDFLARE'];
      const suspiciousASNs = ['HOSTING', 'VPS', 'DEDICATED'];

      if (asnInfo) {
        const org = (asnInfo['org'] ?? '').toUpperCase();
        if (trustedASNs.some((asn) => org.includes(asn))) {
          score = 80;
          details.push(`Trusted network: ${asnInfo['org']}`);
        } else if (suspiciousASNs.some((asn) => org.includes(asn))) {
          score = 50;
          details.push(`Hosting provider: ${asnInfo['org']}`);
        }
      }

      // Residential IP sending email is unusual for bulk
      if (item.metadata.previousItemCount > 50 && !asnInfo) {
        score -= 10;
        details.push('High volume from unidentified network');
      }

      return {
        check: 'network_origin',
        passed: score >= 40,
        score: Math.max(0, Math.min(100, score)),
        details: details.join('; ') || `Source IP: ${ip}`,
        timeUs: Math.round((performance.now() - start) * 1000),
        async: false,
      };
    },
  };
}

// ─── Header Integrity Check ───
function createHeaderIntegrityCheck(): CheckDefinition {
  return {
    name: 'header_integrity',
    minTier: 'PROBABLE' as ConfidenceTier,
    priority: 80,
    timeoutMs: 15,
    deferrable: false,
    execute: async (item: ValidationItem): Promise<CheckResult> => {
      const start = performance.now();
      const payload = item.payload as Record<string, unknown>;
      const headers = (payload['headers'] as Record<string, string>) ?? {};

      let score = 85;
      const details: string[] = [];

      // Required headers per RFC 5322
      if (!headers['from']) {
        score -= 30;
        details.push('Missing From header');
      }
      if (!headers['date']) {
        score -= 15;
        details.push('Missing Date header');
      }
      if (!headers['message-id']) {
        score -= 15;
        details.push('Missing Message-ID header');
      }

      // Received chain sanity (should have at least one Received header)
      const received = headers['received'] ?? '';
      if (!received) {
        score -= 10;
        details.push('No Received headers (may be direct injection)');
      }

      // X-Mailer patterns (known spam tools)
      const mailer = (headers['x-mailer'] ?? '').toLowerCase();
      const spamMailers = ['phpmailer/5', 'turbo-mailer', 'atomic mail'];
      if (spamMailers.some((s) => mailer.includes(s))) {
        score -= 25;
        details.push(`Suspicious mailer: ${headers['x-mailer']}`);
      }

      return {
        check: 'header_integrity',
        passed: score >= 40,
        score: Math.max(0, Math.min(100, score)),
        details: details.length > 0 ? details.join('; ') : 'Headers are well-formed',
        timeUs: Math.round((performance.now() - start) * 1000),
        async: false,
      };
    },
  };
}
