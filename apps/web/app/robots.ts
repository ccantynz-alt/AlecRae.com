import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/inbox", "/compose", "/settings", "/analytics", "/domains", "/login", "/register", "/api/"],
      },
    ],
    sitemap: "https://alecrae.com/sitemap.xml",
  };
}
