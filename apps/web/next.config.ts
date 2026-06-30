import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @repo/db and @repo/shared ship raw TypeScript from the monorepo; Next must
  // transpile them (the sync-token route imports @repo/shared).
  transpilePackages: ["@repo/db", "@repo/shared"],
};

export default nextConfig;
