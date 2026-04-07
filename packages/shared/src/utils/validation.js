import { z } from "zod";
/**
 * RFC 5322 email address validation.
 *
 * This covers the vast majority of real-world addresses. It intentionally
 * does not support the full RFC 5322 grammar (quoted local parts, comments,
 * etc.) because those are virtually never used in practice and are rejected
 * by most MTAs.
 */
/** Maximum lengths per RFC 5321. */
const MAX_LOCAL_PART_LENGTH = 64;
const MAX_DOMAIN_LENGTH = 255;
const MAX_EMAIL_LENGTH = 254; // RFC 5321 path limit minus <>
/** Pattern for the local part (before @). */
const LOCAL_PART_REGEX = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
/** Pattern for a single DNS label. */
const DNS_LABEL_REGEX = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)$/;
/** Validates whether a string is a well-formed email address. */
export function isValidEmail(email) {
    if (email.length > MAX_EMAIL_LENGTH)
        return false;
    const atIndex = email.lastIndexOf("@");
    if (atIndex < 1)
        return false;
    const localPart = email.slice(0, atIndex);
    const domain = email.slice(atIndex + 1);
    if (localPart.length > MAX_LOCAL_PART_LENGTH)
        return false;
    if (domain.length > MAX_DOMAIN_LENGTH)
        return false;
    if (!LOCAL_PART_REGEX.test(localPart))
        return false;
    return isValidDomain(domain);
}
/** Validates whether a string is a well-formed domain name. */
export function isValidDomain(domain) {
    if (domain.length === 0 || domain.length > MAX_DOMAIN_LENGTH)
        return false;
    const labels = domain.split(".");
    if (labels.length < 2)
        return false;
    for (const label of labels) {
        if (!DNS_LABEL_REGEX.test(label))
            return false;
    }
    // TLD must not be all-numeric
    const tld = labels[labels.length - 1];
    if (tld !== undefined && /^\d+$/.test(tld))
        return false;
    return true;
}
/** Validates a hostname (domain or IP literal). */
export function isValidHostname(hostname) {
    // IP literal in brackets
    if (hostname.startsWith("[") && hostname.endsWith("]")) {
        const ip = hostname.slice(1, -1);
        return isValidIpv4(ip) || isValidIpv6(ip);
    }
    return isValidDomain(hostname);
}
function isValidIpv4(ip) {
    const parts = ip.split(".");
    if (parts.length !== 4)
        return false;
    return parts.every((part) => {
        const num = Number(part);
        return /^\d{1,3}$/.test(part) && num >= 0 && num <= 255;
    });
}
function isValidIpv6(ip) {
    // Remove IPv6: prefix if present (for SMTP IP literals)
    const addr = ip.startsWith("IPv6:") ? ip.slice(5) : ip;
    const groups = addr.split(":");
    if (groups.length < 2 || groups.length > 8)
        return false;
    // Basic structural check -- full validation is complex
    return /^[0-9a-fA-F:]+$/.test(addr);
}
// ---------------------------------------------------------------------------
// Zod schemas for use in API validation
// ---------------------------------------------------------------------------
/** Zod schema for a valid email address string. */
export const emailSchema = z
    .string()
    .min(3)
    .max(MAX_EMAIL_LENGTH)
    .refine(isValidEmail, { message: "Invalid email address" });
/** Zod schema for an email address object with optional name. */
export const emailAddressSchema = z.object({
    name: z.string().max(256).optional(),
    address: emailSchema,
});
/** Zod schema for a valid domain name. */
export const domainSchema = z
    .string()
    .min(3)
    .max(MAX_DOMAIN_LENGTH)
    .refine(isValidDomain, { message: "Invalid domain name" });
/** Zod schema for a non-empty trimmed string. */
export const nonEmptyString = z.string().trim().min(1);
/** Zod schema for a UUID v4. */
export const uuidSchema = z.string().uuid();
/** Zod schema for a tag string. */
export const tagSchema = z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_.-]+$/, {
    message: "Tags may only contain alphanumeric characters, underscores, hyphens, and dots",
});
/** Zod schema for metadata key-value pairs. */
export const metadataSchema = z
    .record(z.string().max(64), z.string().max(512))
    .refine((obj) => Object.keys(obj).length <= 20, {
    message: "Maximum 20 metadata entries allowed",
});
/** Zod schema for API key format (em_live_... or em_test_...). */
export const apiKeyFormatSchema = z
    .string()
    .regex(/^em_(live|test)_[a-zA-Z0-9]{32,}$/, {
    message: "Invalid API key format",
});
/** Zod schema for pagination parameters. */
export const paginationSchema = z.object({
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(20),
});
//# sourceMappingURL=validation.js.map