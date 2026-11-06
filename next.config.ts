import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components stay off in the MVP: the app is authenticated and dynamic, and the
  // Suspense-everywhere requirement would slow the first phases. Revisit at launch.
  cacheComponents: false,
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
