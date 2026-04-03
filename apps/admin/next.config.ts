import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@emailed/ui", "@emailed/shared"],
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
