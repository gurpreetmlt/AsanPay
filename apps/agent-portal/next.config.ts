import type { NextConfig } from "next";
import path from "path";

const monorepoRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  transpilePackages: ["@asanpay/shared-types"],
  // Types are checked on dev machines (`npx tsc --noEmit`).
  // Full typecheck inside Coolify's low-memory build container OOMs (exit 255).
  typescript: { ignoreBuildErrors: true },
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
