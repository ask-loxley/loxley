import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components and partial prefetching are off: they hang on Cloudflare Workers
  // (Next.js warns its setTimeout-based scheduling isn't guaranteed there), and Loxley doesn't need them.
  cacheComponents: false,
  partialPrefetching: false,
};

export default nextConfig;
