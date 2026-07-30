import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Multi-Zones: esta zona vive bajo `/reports` y el web-shell la expone con un
   * rewrite. Dentro de la zona las rutas se escriben **sin** el prefijo.
   * Ver ESTADO-ACTUAL §16.
   */
  basePath: '/reports',

  transpilePackages: ['@praxis/commons'],
};

export default nextConfig;
