import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components stay off in the MVP: the app is authenticated and dynamic, and the
  // Suspense-everywhere requirement would slow the first phases. Revisit at launch.
  cacheComponents: false,
  // Legal pages read docs/legal/*.md with fs; make sure the files ship with the serverless bundle.
  outputFileTracingIncludes: { "/legal/[slug]": ["./docs/legal/*.md"] },
  experimental: {
    // Files never go through Server Actions: media is uploaded straight to R2 with presigned PUTs
    // and actions only receive ids and text. This cap is a safety net below Vercel's 4.5 MB limit.
    serverActions: { bodySizeLimit: "4mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
