import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['unifi-protect'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevent bundling of unifi-protect
      config.externals = config.externals || [];
      config.externals.push('unifi-protect');
    }
    return config;
  },
};

export default nextConfig;
