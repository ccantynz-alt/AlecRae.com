import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@alecrae/ui"],
  reactStrictMode: true,
  // typedRoutes moved out of experimental in Next.js 15
  typedRoutes: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  async headers() {
    return [
      {
        // Immutable cache for fingerprinted static assets (JS/CSS bundles).
        // Safe because Next.js includes a content hash in every chunk filename.
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Never cache HTML pages or API routes. Each deploy produces new
        // chunk hashes; stale HTML referencing old hashes causes blank pages
        // that ipconfig/flushdns cannot fix (that only clears DNS, not HTTP).
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
