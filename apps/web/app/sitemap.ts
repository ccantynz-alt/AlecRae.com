import type { MetadataRoute } from "next";

const LEGAL_LAST_UPDATED = new Date("2026-04-16");

const legalRoutes: readonly string[] = [
  "/terms",
  "/privacy",
  "/cookies",
  "/do-not-sell",
  "/california-notice",
  "/children",
  "/acceptable-use",
  "/dpa",
  "/sla",
  "/dmca",
  "/subprocessors",
  "/refund",
  "/ai-transparency",
  "/accessibility",
  "/security",
  "/compliance",
  "/impressum",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://alecrae.com";

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...legalRoutes.map((path) => ({
      url: `${baseUrl}${path}`,
      lastModified: LEGAL_LAST_UPDATED,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  ];
}
