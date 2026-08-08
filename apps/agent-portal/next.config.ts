import type { NextConfig } from "next";
import path from "path";

const monorepoRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  transpilePackages: ["@asanpay/shared-types"],
  // Types are checked on Mac (`npx tsc --noEmit` / local `next build`).
  // Coolify's small build container OOMs during "Running TypeScript ..." (exit 255)
  // even with memoryBasedWorkersCount — no TS error in the log, just kill.
  typescript: { ignoreBuildErrors: true },
  experimental: {
    memoryBasedWorkersCount: true,
  },
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
