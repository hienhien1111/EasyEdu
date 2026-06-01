import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Docker multi-stage build — generates a minimal standalone server
  output: "standalone",
};

export default nextConfig;
