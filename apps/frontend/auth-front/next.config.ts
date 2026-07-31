import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  basePath: '/auth',

  /**
   * @praxis/commons se publica como TypeScript sin compilar y pnpm lo enlaza
   * dentro de node_modules, donde Next no transpila por defecto.
   */
  transpilePackages: ['@praxis/commons'],
};

export default nextConfig;
