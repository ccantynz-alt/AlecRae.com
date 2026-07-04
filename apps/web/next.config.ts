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
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
      { protocol: "https", hostname: "graph.microsoft.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
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
        // Security headers + no-cache for all HTML pages and API routes.
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          // no-store alone is sufficient; must-revalidate is void with no-store (RFC 9111)
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            // Permissive CSP — allows Next.js inline scripts/styles needed for
            // hydration. Tighten with nonces in a future pass.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.googleusercontent.com https://graph.microsoft.com",
              "font-src 'self' data:",
              "connect-src 'self' https://api.alecrae.com wss://api.alecrae.com",
              "frame-src 'none'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
