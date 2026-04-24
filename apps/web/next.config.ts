import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@alecrae/ui"],
  reactStrictMode: true,
  // typedRoutes promoted to top-level in Next.js 15
  typedRoutes: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
