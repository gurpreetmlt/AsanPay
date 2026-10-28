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
    // KYC submit may include several base64 images through the proxy.
    serverActions: { bodySizeLimit: "12mb" },
    middlewareClientMaxBodySize: "12mb",
  },
  turbopack: {
    root: monorepoRoot,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // KYC live photo + shop location need camera and geolocation on this origin only.
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
