import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Multi-Zones: esta zona vive bajo `/chat` y el web-shell la expone con un
   * rewrite. Dentro de la zona las rutas se escriben **sin** el prefijo.
   * Ver ESTADO-ACTUAL §16.
   */
  basePath: '/chat',

  transpilePackages: ['@praxis/commons'],
};

export default nextConfig;
