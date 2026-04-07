/**
 * Meilisearch Integration — Full-Text Email Search
 *
 * Wraps the official meilisearch client with typed helpers for
 * indexing, searching, and removing email documents. All searches
 * are scoped to `accountId` for tenant isolation.
 */
export interface EmailSearchDocument {
    id: string;
    accountId: string;
    mailboxId: string;
    subject: string;
    textBody: string | null;
    fromAddress: string;
    fromName: string | null;
    toAddresses: string;
    snippet: string;
    hasAttachments: boolean;
    status: string;
    createdAt: number;
}
export interface EmailSearchHit {
    id: string;
    subject: string;
    fromAddress: string;
    fromName: string | null;
    snippet: string;
    createdAt: number;
}
export interface EmailSearchResult {
    hits: EmailSearchHit[];
    totalHits: number;
    processingTimeMs: number;
    query: string;
}
/**
 * Create the emails index (if it doesn't exist) and configure searchable,
 * filterable, and sortable attributes. Safe to call on every startup —
 * Meilisearch upserts settings idempotently.
 */
export declare function initSearchIndex(): Promise<void>;
/**
 * Add or update an email document in the search index.
 * Accepts the fields needed for search and converts toAddresses
 * to a flat string for full-text searchability.
 */
export declare function indexEmail(email: {
    id: string;
    accountId: string;
    mailboxId: string;
    subject: string;
    textBody?: string | null;
    fromAddress: string;
    fromName?: string | null;
    toAddresses: string | Array<{
        address: string;
        name?: string;
    }>;
    snippet: string;
    hasAttachments: boolean;
    status: string;
    createdAt: Date | string | number;
}): Promise<void>;
/**
 * Search emails scoped to a specific account. Returns matching summaries
 * suitable for displaying in a search results list.
 */
export declare function searchEmails(accountId: string, query: string, options?: {
    mailboxId?: string;
    limit?: number;
    offset?: number;
    filters?: string;
}): Promise<EmailSearchResult>;
/**
 * Remove an email document from the search index by ID.
 */
export declare function removeEmail(emailId: string): Promise<void>;
//# sourceMappingURL=meilisearch.d.ts.map