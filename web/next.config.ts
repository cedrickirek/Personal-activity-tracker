import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // create-next-app turns on Cache Components (and partial prefetching, which
  // builds on it). This app is the opposite of cacheable: every page depends
  // on the login cookie, the current Paris time and the live Sheet. Without
  // Cache Components, a page that reads cookies is rendered fresh on every
  // request, which is exactly what we want.
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
