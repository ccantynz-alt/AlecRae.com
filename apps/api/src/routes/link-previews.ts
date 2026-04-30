/**
 * Link Previews Route — URL Unfurling with Cache
 *
 * POST /v1/link-preview       — Fetch and cache link preview for a URL
 * POST /v1/link-preview/batch — Fetch previews for multiple URLs
 * GET  /v1/link-preview       — Get cached preview for a URL
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import { getDatabase, linkPreviews } from "@alecrae/db";
import type { LinkPreviewData } from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const FetchPreviewSchema = z.object({
  url: z.string().url().max(2048),
});

const BatchPreviewSchema = z.object({
  urls: z.array(z.string().url().max(2048)).min(1).max(20),
});

const GetPreviewQuery = z.object({
  url: z.string().url().max(2048),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashUrl(url: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FETCH_TIMEOUT_MS = 5000;

/**
 * Parse OpenGraph and fallback meta tags from raw HTML.
 */
function parseMetaTags(html: string): LinkPreviewData {
  const data: LinkPreviewData = {};

  function getMetaContent(property: string): string | undefined {
    // Match <meta property="og:title" content="..."> or <meta name="description" content="...">
    const propertyRegex = new RegExp(
      `<meta[^>]+(?:property|name)=["']${escapeRegex(property)}["'][^>]+content=["']([^"']*)["']`,
      "i",
    );
    const match = propertyRegex.exec(html);
    if (match?.[1]) return decodeHtmlEntities(match[1]);

    // Also match reversed attribute order: content before property
    const reversedRegex = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escapeRegex(property)}["']`,
      "i",
    );
    const reversedMatch = reversedRegex.exec(html);
    if (reversedMatch?.[1]) return decodeHtmlEntities(reversedMatch[1]);

    return undefined;
  }

  function getTitle(): string | undefined {
    const titleRegex = /<title[^>]*>([^<]*)<\/title>/i;
    const match = titleRegex.exec(html);
    if (match?.[1]) return decodeHtmlEntities(match[1].trim());
    return undefined;
  }

  function getFavicon(baseUrl: string): string | undefined {
    const iconRegex = /<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']*)["']/i;
    const match = iconRegex.exec(html);
    if (!match?.[1]) return undefined;

    const href = match[1];
    // If it's a relative URL, resolve against base
    if (href.startsWith("http://") || href.startsWith("https://")) {
      return href;
    }
    try {
      return new URL(href, baseUrl).href;
    } catch {
      return undefined;
    }
  }

  // OG tags take priority
  data.title = getMetaContent("og:title") ?? getTitle();
  data.description = getMetaContent("og:description") ?? getMetaContent("description");
  data.image = getMetaContent("og:image");
  data.siteName = getMetaContent("og:site_name");
  data.type = getMetaContent("og:type");
  data.author = getMetaContent("author") ?? getMetaContent("article:author");
  data.publishedDate = getMetaContent("article:published_time");

  return data;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

/**
 * Fetch a URL preview: check cache first, then fetch and parse if needed.
 */
async function fetchPreview(url: string): Promise<{
  id: string;
  url: string;
  urlHash: string;
  data: LinkPreviewData;
  fetchedAt: string;
  expiresAt: string;
  cached: boolean;
}> {
  const db = getDatabase();
  const urlHash = await hashUrl(url);
  const now = new Date();

  // Check cache
  const [cached] = await db
    .select()
    .from(linkPreviews)
    .where(eq(linkPreviews.urlHash, urlHash))
    .limit(1);

  if (cached && cached.expiresAt && cached.expiresAt > now) {
    return {
      id: cached.id,
      url: cached.url,
      urlHash: cached.urlHash,
      data: cached.data,
      fetchedAt: cached.fetchedAt.toISOString(),
      expiresAt: cached.expiresAt.toISOString(),
      cached: true,
    };
  }

  // Fetch with timeout
  let html: string;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "AlecRaeLinkPreview/1.0 (+https://alecrae.com)",
        Accept: "text/html, application/xhtml+xml",
      },
      redirect: "follow",
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      // Non-HTML content — return minimal preview
      const data: LinkPreviewData = {
        title: url,
        type: contentType.split(";")[0]?.trim(),
      };

      return storeAndReturn(db, cached?.id, url, urlHash, data, now);
    }

    html = await response.text();
  } catch (error) {
    // On fetch failure, return a minimal preview
    const data: LinkPreviewData = { title: url };
    return storeAndReturn(db, cached?.id, url, urlHash, data, now);
  }

  // Parse meta tags
  const data = parseMetaTags(html);

  // Try to extract favicon if not found in meta tags
  if (!data.favicon) {
    try {
      const parsed = new URL(url);
      data.favicon = `${parsed.origin}/favicon.ico`;
    } catch {
      // ignore URL parse failure
    }
  }

  return storeAndReturn(db, cached?.id, url, urlHash, data, now);
}

async function storeAndReturn(
  db: ReturnType<typeof getDatabase>,
  existingId: string | undefined,
  url: string,
  urlHash: string,
  data: LinkPreviewData,
  now: Date,
): Promise<{
  id: string;
  url: string;
  urlHash: string;
  data: LinkPreviewData;
  fetchedAt: string;
  expiresAt: string;
  cached: boolean;
}> {
  const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);
  const id = existingId ?? generateId();

  if (existingId) {
    // Update existing cache entry
    await db
      .update(linkPreviews)
      .set({
        data,
        fetchedAt: now,
        expiresAt,
      })
      .where(eq(linkPreviews.id, existingId));
  } else {
    // Insert new cache entry
    await db.insert(linkPreviews).values({
      id,
      url,
      urlHash,
      data,
      fetchedAt: now,
      expiresAt,
    });
  }

  return {
    id,
    url,
    urlHash,
    data,
    fetchedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    cached: false,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const linkPreviewRouter = new Hono();

// POST /v1/link-preview — Fetch and cache link preview for a URL
linkPreviewRouter.post(
  "/",
  requireScope("messages:read"),
  validateBody(FetchPreviewSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof FetchPreviewSchema>>(c);

    const preview = await fetchPreview(input.url);

    return c.json({ data: preview }, 200);
  },
);

// POST /v1/link-preview/batch — Fetch previews for multiple URLs
linkPreviewRouter.post(
  "/batch",
  requireScope("messages:read"),
  validateBody(BatchPreviewSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof BatchPreviewSchema>>(c);

    const results = await Promise.all(
      input.urls.map((url) =>
        fetchPreview(url).catch((): {
          url: string;
          error: string;
          data: null;
        } => ({
          url,
          error: "Failed to fetch preview",
          data: null,
        })),
      ),
    );

    return c.json({ data: results });
  },
);

// GET /v1/link-preview?url=... — Get cached preview for a URL
linkPreviewRouter.get(
  "/",
  requireScope("messages:read"),
  validateQuery(GetPreviewQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof GetPreviewQuery>>(c);
    const db = getDatabase();

    const urlHash = await hashUrl(query.url);

    const [cached] = await db
      .select()
      .from(linkPreviews)
      .where(eq(linkPreviews.urlHash, urlHash))
      .limit(1);

    if (!cached) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "No cached preview for this URL",
            code: "preview_not_found",
          },
        },
        404,
      );
    }

    const isExpired = cached.expiresAt && cached.expiresAt < new Date();

    return c.json({
      data: {
        id: cached.id,
        url: cached.url,
        urlHash: cached.urlHash,
        data: cached.data,
        fetchedAt: cached.fetchedAt.toISOString(),
        expiresAt: cached.expiresAt?.toISOString() ?? null,
        expired: isExpired,
      },
    });
  },
);

export { linkPreviewRouter };
