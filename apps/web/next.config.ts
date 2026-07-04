import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.agent.cvm.dev", "*.cvm.dev", "localhost", "127.0.0.1"],
  async rewrites() {
    const server = process.env.SERVER_URL ?? "http://localhost:3847";
    return [
      { source: "/api/:path*", destination: `${server}/api/:path*` },
      { source: "/health", destination: `${server}/health` },
    ];
  },
};

export default nextConfig;
