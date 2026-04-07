import { z } from "zod";
/** Validates whether a string is a well-formed email address. */
export declare function isValidEmail(email: string): boolean;
/** Validates whether a string is a well-formed domain name. */
export declare function isValidDomain(domain: string): boolean;
/** Validates a hostname (domain or IP literal). */
export declare function isValidHostname(hostname: string): boolean;
/** Zod schema for a valid email address string. */
export declare const emailSchema: z.ZodEffects<z.ZodString, string, string>;
/** Zod schema for an email address object with optional name. */
export declare const emailAddressSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    address: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    address: string;
    name?: string | undefined;
}, {
    address: string;
    name?: string | undefined;
}>;
/** Zod schema for a valid domain name. */
export declare const domainSchema: z.ZodEffects<z.ZodString, string, string>;
/** Zod schema for a non-empty trimmed string. */
export declare const nonEmptyString: z.ZodString;
/** Zod schema for a UUID v4. */
export declare const uuidSchema: z.ZodString;
/** Zod schema for a tag string. */
export declare const tagSchema: z.ZodString;
/** Zod schema for metadata key-value pairs. */
export declare const metadataSchema: z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodString>, Record<string, string>, Record<string, string>>;
/** Zod schema for API key format (em_live_... or em_test_...). */
export declare const apiKeyFormatSchema: z.ZodString;
/** Zod schema for pagination parameters. */
export declare const paginationSchema: z.ZodObject<{
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    cursor?: string | undefined;
}, {
    cursor?: string | undefined;
    limit?: number | undefined;
}>;
//# sourceMappingURL=validation.d.ts.map