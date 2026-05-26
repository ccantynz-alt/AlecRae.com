import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/.well-known/"],
        disallow: [
          "/inbox",
          "/compose",
          "/settings",
          "/analytics",
          "/domains",
          "/login",
          "/register",
          "/api/",
          "/admin",
        ],
      },
    ],
    sitemap: "https://alecrae.com/sitemap.xml",
    host: "https://alecrae.com",
  };
}
