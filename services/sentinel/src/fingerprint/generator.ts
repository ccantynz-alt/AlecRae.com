/**
 * Fingerprint Generator — Creates unique signatures for validation items.
 *
 * The fingerprint determines cache hit/miss. Too specific = low hit rate (slow).
 * Too broad = false matches (dangerous). The balance is key.
 *
 * For emails, we fingerprint on:
 * - Sender domain (not full address — legitimate senders use many addresses)
 * - IP /24 subnet (not exact IP — senders rotate within ranges)
 * - Content structure hash (template pattern, not exact content)
 * - Authentication method used
 *
 * This means: "marketing email from example.com via 192.168.1.x using DKIM"
 * matches the cache regardless of specific recipient or content variation.
 */

import { createHash } from 'node:crypto';
import type { ValidationItem, ValidationType } from '../types.js';

export interface FingerprintComponents {
  type: ValidationType;
  senderDomain: string;
  ipSubnet: string;
  contentStructure: string;
  authMethod: string;
}

export class FingerprintGenerator {
  /**
   * Generate a fingerprint for a validation item.
   * The fingerprint is a hex string that uniquely identifies the "class"
   * of this item (not the specific item — the pattern it belongs to).
   */
  generate(item: ValidationItem): string {
    const components = this.extractComponents(item);
    return this.hash(components);
  }

  /**
   * Generate a partial fingerprint for broader matching.
   * Used when invalidating patterns (e.g., "invalidate everything from this domain").
   */
  generatePartial(
    fields: Partial<FingerprintComponents>
  ): string {
    const normalized = [
      fields.type ?? '*',
      fields.senderDomain ?? '*',
      fields.ipSubnet ?? '*',
      fields.contentStructure ?? '*',
      fields.authMethod ?? '*',
    ].join('|');

    return createHash('sha256').update(normalized).digest('hex').substring(0, 16);
  }

  private extractComponents(item: ValidationItem): FingerprintComponents {
    const payload = item.payload as Record<string, unknown>;

    return {
      type: item.type,
      senderDomain: this.extractDomain(payload),
      ipSubnet: this.extractSubnet(item.metadata.sourceIp),
      contentStructure: this.extractContentStructure(payload),
      authMethod: this.extractAuthMethod(payload),
    };
  }

  private hash(components: FingerprintComponents): string {
    const input = [
      components.type,
      components.senderDomain,
      components.ipSubnet,
      components.contentStructure,
      components.authMethod,
    ].join('|');

    return createHash('sha256').update(input).digest('hex').substring(0, 16);
  }

  /** Extract sender domain from email payload */
  private extractDomain(payload: Record<string, unknown>): string {
    const from = (payload['from'] as string) ?? '';
    const atIndex = from.lastIndexOf('@');
    if (atIndex === -1) return 'unknown';
    return from.substring(atIndex + 1).toLowerCase();
  }

  /** Convert IP to /24 subnet for fingerprinting */
  private extractSubnet(ip: string): string {
    // IPv4: take first 3 octets
    if (ip.includes('.')) {
      const parts = ip.split('.');
      if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
      }
    }

    // IPv6: take first 48 bits (/48 prefix)
    if (ip.includes(':')) {
      const expanded = this.expandIPv6(ip);
      const parts = expanded.split(':');
      return `${parts[0]}:${parts[1]}:${parts[2]}::/48`;
    }

    return ip;
  }

  /**
   * Extract a structural hash of the content.
   * This captures the "shape" of the email (template pattern) without
   * being sensitive to specific content.
   *
   * Examples:
   * - "text block, image, text block, link, link" -> consistent hash
   * - Different promotional emails from the same sender -> same structure
   */
  private extractContentStructure(payload: Record<string, unknown>): string {
    const body = (payload['body'] as string) ?? '';
    const subject = (payload['subject'] as string) ?? '';
    const hasAttachments = Boolean(payload['attachments']);

    // Build structure signature
    const signals: string[] = [];

    // Subject pattern: length bucket + has numbers + has special chars
    signals.push(`subj:${this.lengthBucket(subject.length)}`);
    signals.push(`subj_num:${/\d/.test(subject) ? 'y' : 'n'}`);

    // Body pattern: length bucket + link count bucket + image indicators
    signals.push(`body:${this.lengthBucket(body.length)}`);

    const linkCount = (body.match(/https?:\/\//g) ?? []).length;
    signals.push(`links:${this.countBucket(linkCount)}`);

    signals.push(`attach:${hasAttachments ? 'y' : 'n'}`);

    // Detect content type patterns
    const hasUnsubscribe = /unsubscribe/i.test(body);
    signals.push(`unsub:${hasUnsubscribe ? 'y' : 'n'}`);

    return createHash('md5')
      .update(signals.join(','))
      .digest('hex')
      .substring(0, 8);
  }

  private extractAuthMethod(payload: Record<string, unknown>): string {
    const headers = payload['headers'] as Record<string, string> | undefined;
    if (!headers) return 'none';

    const methods: string[] = [];
    if (headers['dkim-signature']) methods.push('dkim');
    if (headers['received-spf']) methods.push('spf');
    if (headers['authentication-results']) methods.push('arc');

    return methods.length > 0 ? methods.sort().join('+') : 'none';
  }

  private lengthBucket(len: number): string {
    if (len === 0) return '0';
    if (len < 50) return 'xs';
    if (len < 200) return 'sm';
    if (len < 1000) return 'md';
    if (len < 5000) return 'lg';
    return 'xl';
  }

  private countBucket(count: number): string {
    if (count === 0) return '0';
    if (count <= 2) return 'few';
    if (count <= 5) return 'some';
    if (count <= 15) return 'many';
    return 'lots';
  }

  private expandIPv6(ip: string): string {
    let expanded = ip;
    if (expanded.includes('::')) {
      const parts = expanded.split('::');
      const left = parts[0] ? parts[0].split(':') : [];
      const right = parts[1] ? parts[1].split(':') : [];
      const missing = 8 - left.length - right.length;
      const middle = Array.from({ length: missing }, () => '0000');
      expanded = [...left, ...middle, ...right].join(':');
    }
    return expanded
      .split(':')
      .map((part) => part.padStart(4, '0'))
      .join(':');
  }
}
