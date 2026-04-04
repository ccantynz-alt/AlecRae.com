/**
 * Meilisearch Integration — Full-Text Email Search
 *
 * Wraps the official meilisearch client with typed helpers for
 * indexing, searching, and removing email documents. All searches
 * are scoped to `accountId` for tenant isolation.
 */

import { MeiliSearch, type Index, type SearchResponse } from "meilisearch";

// ─── Configuration ────────────────────────────────────────────────────────

const MEILISEARCH_URL =
  process.env["MEILISEARCH_URL"] ?? process.env["MEILI_URL"] ?? "http://localhost:7700";
const MEILISEARCH_API_KEY =
  process.env["MEILISEARCH_API_KEY"] ?? process.env["MEILI_MASTER_KEY"] ?? "";

const INDEX_NAME = "emails";

// ─── Client singleton ─────────────────────────────────────────────────────

let _client: MeiliSearch | null = null;

function getClient(): MeiliSearch {
  if (!_client) {
    _client = new MeiliSearch({
      host: MEILISEARCH_URL,
      apiKey: MEILISEARCH_API_KEY,
    });
  }
  return _client;
}

function getIndex(): Index {
  return getClient().index(INDEX_NAME);
}

// ─── Document type ────────────────────────────────────────────────────────

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
  createdAt: number; // Unix timestamp for sortable attribute
}

// ─── Search result type ───────────────────────────────────────────────────

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

// ─── Init ─────────────────────────────────────────────────────────────────

/**
 * Create the emails index (if it doesn't exist) and configure searchable,
 * filterable, and sortable attributes. Safe to call on every startup —
 * Meilisearch upserts settings idempotently.
 */
export async function initSearchIndex(): Promise<void> {
  const client = getClient();

  try {
    // Create the index (no-op if it already exists)
    await client.createIndex(INDEX_NAME, { primaryKey: "id" });
  } catch {
    // Index already exists — that's fine
  }

  const index = getIndex();

  // Update settings — Meilisearch handles this idempotently
  await index.updateSettings({
    searchableAttributes: [
      "subject",
      "textBody",
      "fromAddress",
      "fromName",
      "toAddresses",
      "snippet",
    ],
    filterableAttributes: [
      "accountId",
      "mailboxId",
      "status",
      "hasAttachments",
      "createdAt",
    ],
    sortableAttributes: ["createdAt", "subject"],
  });

  console.log("[search] Meilisearch index initialized:", INDEX_NAME);
}

// ─── Indexing ─────────────────────────────────────────────────────────────

/**
 * Add or update an email document in the search index.
 * Accepts the fields needed for search and converts toAddresses
 * to a flat string for full-text searchability.
 */
export async function indexEmail(email: {
  id: string;
  accountId: string;
  mailboxId: string;
  subject: string;
  textBody?: string | null;
  fromAddress: string;
  fromName?: string | null;
  toAddresses: string | Array<{ address: string; name?: string }>;
  snippet: string;
  hasAttachments: boolean;
  status: string;
  createdAt: Date | string | number;
}): Promise<void> {
  const index = getIndex();

  // Flatten toAddresses to a searchable string
  let toStr: string;
  if (typeof email.toAddresses === "string") {
    toStr = email.toAddresses;
  } else if (Array.isArray(email.toAddresses)) {
    toStr = email.toAddresses
      .map((a) => (a.name ? `${a.name} <${a.address}>` : a.address))
      .join(", ");
  } else {
    toStr = "";
  }

  // Normalize createdAt to Unix timestamp (seconds)
  let createdAtTs: number;
  if (typeof email.createdAt === "number") {
    createdAtTs = email.createdAt;
  } else if (email.createdAt instanceof Date) {
    createdAtTs = Math.floor(email.createdAt.getTime() / 1000);
  } else {
    createdAtTs = Math.floor(new Date(email.createdAt).getTime() / 1000);
  }

  const doc: EmailSearchDocument = {
    id: email.id,
    accountId: email.accountId,
    mailboxId: email.mailboxId,
    subject: email.subject,
    textBody: email.textBody ?? null,
    fromAddress: email.fromAddress,
    fromName: email.fromName ?? null,
    toAddresses: toStr,
    snippet: email.snippet,
    hasAttachments: email.hasAttachments,
    status: email.status,
    createdAt: createdAtTs,
  };

  await index.addDocuments([doc]);
}

// ─── Search ───────────────────────────────────────────────────────────────

/**
 * Search emails scoped to a specific account. Returns matching summaries
 * suitable for displaying in a search results list.
 */
export async function searchEmails(
  accountId: string,
  query: string,
  options?: {
    mailboxId?: string;
    limit?: number;
    offset?: number;
    filters?: string;
  },
): Promise<EmailSearchResult> {
  const index = getIndex();

  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  // Build the filter — always scope to accountId
  const filterParts: string[] = [`accountId = "${accountId}"`];
  if (options?.mailboxId) {
    filterParts.push(`mailboxId = "${options.mailboxId}"`);
  }
  if (options?.filters) {
    filterParts.push(options.filters);
  }

  const filter = filterParts.join(" AND ");

  const response: SearchResponse<EmailSearchDocument> = await index.search(
    query,
    {
      filter,
      limit,
      offset,
      sort: ["createdAt:desc"],
      attributesToRetrieve: [
        "id",
        "subject",
        "fromAddress",
        "fromName",
        "snippet",
        "createdAt",
      ],
    },
  );

  return {
    hits: response.hits.map((hit) => ({
      id: hit.id,
      subject: hit.subject,
      fromAddress: hit.fromAddress,
      fromName: hit.fromName,
      snippet: hit.snippet,
      createdAt: hit.createdAt,
    })),
    totalHits:
      typeof response.estimatedTotalHits === "number"
        ? response.estimatedTotalHits
        : response.hits.length,
    processingTimeMs: response.processingTimeMs,
    query,
  };
}

// ─── Removal ──────────────────────────────────────────────────────────────

/**
 * Remove an email document from the search index by ID.
 */
export async function removeEmail(emailId: string): Promise<void> {
  const index = getIndex();
  await index.deleteDocument(emailId);
}
