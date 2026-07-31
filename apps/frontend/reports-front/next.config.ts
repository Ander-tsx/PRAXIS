import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Imagen mínima para producción.
   *
   * Sin esto, la imagen de cada zona se lleva `node_modules` entero —cientos de
   * megas por zona, y son cinco—. Con `standalone`, Next copia a `.next/standalone`
   * solo lo que el servidor necesita de verdad.
   *
   * ⚠️ En un monorepo con pnpm hace falta además `outputFileTracingRoot`: los
   * paquetes viven en enlaces simbólicos hacia la raíz, y sin decirle dónde
   * está esa raíz Next no los sigue y la imagen arranca sin `@praxis/commons`.
   */
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../../..'),

  /**
   * Multi-Zones: esta zona vive bajo `/reports` y el web-shell la expone con un
   * rewrite. Dentro de la zona las rutas se escriben **sin** el prefijo.
   * Ver ESTADO-ACTUAL §16.
   */
  basePath: '/reports',

  transpilePackages: ['@praxis/commons'],
};

export default nextConfig;
