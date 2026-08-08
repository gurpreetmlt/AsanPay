import type { NextConfig } from "next";
import path from "path";

const monorepoRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  transpilePackages: ["@asanpay/shared-types"],
  // Types checked on Mac. Coolify build container OOMs on "Running TypeScript" / static gen.
  typescript: { ignoreBuildErrors: true },
  experimental: {
    cpus: 1,
    memoryBasedWorkersCount: true,
    webpackMemoryOptimizations: true,
    // Sequential static generation — parallel workers kill Coolify (exit 255).
    staticGenerationMaxConcurrency: 1,
  },
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
