import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@emailed/ui"],
  reactStrictMode: true,
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
