import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://alecrae.com";

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date("2026-04-12"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date("2026-04-12"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/acceptable-use`,
      lastModified: new Date("2026-04-12"),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/dpa`,
      lastModified: new Date("2026-04-12"),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/sla`,
      lastModified: new Date("2026-04-12"),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/dmca`,
      lastModified: new Date("2026-04-12"),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/cookies`,
      lastModified: new Date("2026-04-12"),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/subprocessors`,
      lastModified: new Date("2026-04-12"),
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];
}
