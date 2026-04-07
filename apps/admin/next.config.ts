import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@emailed/ui"],
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
