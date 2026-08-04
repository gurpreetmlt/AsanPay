import type { NextConfig } from "next";
import path from "path";

const monorepoRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  transpilePackages: ["@asanpay/shared-types"],
  turbopack: {
    root: monorepoRoot,
  },
  async redirects() {
    return [{ source: "/platform-settings", destination: "/treasury-settings", permanent: true }];
  },
};

export default nextConfig;
