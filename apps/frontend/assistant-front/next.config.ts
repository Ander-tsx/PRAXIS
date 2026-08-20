import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Multi-Zones: esta zona vive bajo `/assistant` y el web-shell la expone con
   * un rewrite. Dentro de la zona las rutas se escriben **sin** el prefijo.
   * Ver ESTADO-ACTUAL §16.
   */
  basePath: '/assistant',

  transpilePackages: ['@praxis/commons'],
};

export default nextConfig;
