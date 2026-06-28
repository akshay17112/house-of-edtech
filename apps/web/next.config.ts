import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @repo/db ships raw TypeScript from the monorepo; Next must transpile it.
  transpilePackages: ["@repo/db"],
};

export default nextConfig;
