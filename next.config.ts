import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg is a Node dependency; keep it out of the bundle.
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
};

export default nextConfig;
