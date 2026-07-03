import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  basePath: '/dashboard',
  async rewrites() {
    return [
      {
        source: '/api/mock/:path*',
        destination: 'http://localhost:3001/api/mock/:path*',
      },
    ];
  },
};

export default nextConfig;
//
