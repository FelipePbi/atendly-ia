import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const bffBaseUrl = (
  process.env.BFF_BASE_URL ?? "http://localhost:3002"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/bff/:path*",
        destination: `${bffBaseUrl}/:path*`,
      },
    ];
  },
  transpilePackages: ["@atendly-ia/legal-contract"],
  turbopack: {
    root: fileURLToPath(new URL("../..", import.meta.url)),
  },
};

export default nextConfig;
