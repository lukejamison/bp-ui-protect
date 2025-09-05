import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['unifi-protect'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude unifi-protect from server-side bundling to prevent browser API issues
      config.externals = [...(config.externals || []), 'unifi-protect'];
    }
    return config;
  },
};

export default nextConfig;
