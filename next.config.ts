import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  turbopack: {},
  // The corpus renders large editorial pages. Bound parallelism on local and
  // free CI runners instead of starting eleven memory-heavy render workers.
  experimental: { cpus: 2, staticGenerationMaxConcurrency: 2 },
};

export default nextConfig;
