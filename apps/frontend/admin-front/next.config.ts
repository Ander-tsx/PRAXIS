import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  basePath: '/admin',
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
