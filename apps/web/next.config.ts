import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@alecrae/ui"],
  reactStrictMode: true,
  // Disable build-time Google Fonts download — fonts load from CDN at runtime.
  // Required in sandboxed/offline build environments (self-signed cert chain).
  optimizeFonts: false,
  experimental: {
    typedRoutes: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
