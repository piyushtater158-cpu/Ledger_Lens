import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: { serverActions: { allowedOrigins: ['localhost:3000', 'ledgerlens.piyushtater.com'] } },
};

export default nextConfig;
