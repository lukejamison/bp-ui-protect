import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['unifi-protect'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude unifi-protect and related packages from server-side bundling
      config.externals = [
        ...config.externals,
        'unifi-protect',
        // Add any related packages that might cause issues
        'node-fetch',
        'ws',
      ];
      
      // Prevent bundling of browser-only code
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
