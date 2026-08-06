import type { NextConfig } from "next";
import path from "path";

const monorepoRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  transpilePackages: ["@asanpay/shared-types"],
  // Types gate the build. The Aug 2026 "Running TypeScript ..." failure this was once turned
  // off for was not a type error — a clean `next build` passes the check in under 3s. It was
  // the build container running out of memory: the EC2 box has 3.7 GB with swap already in
  // use, and the default worker count is sized off CPU count, not free memory.
  typescript: { ignoreBuildErrors: false },
  experimental: {
    // Size build workers off available memory instead of CPU count, so the build adapts to
    // the box it runs on rather than being killed on the small one.
    memoryBasedWorkersCount: true,
  },
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
