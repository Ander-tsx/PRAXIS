import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Multi-Zones: esta zona vive bajo `/dashboard` y el web-shell la expone con
   * un rewrite. El prefijo lo aplica Next automáticamente a `next/link`,
   * `useRouter()` y `redirect()`, así que dentro de la zona las rutas se
   * escriben **sin** él (`/perfil`, no `/dashboard/perfil`).
   *
   * Para salir de la zona hace falta navegación dura. Ver ESTADO-ACTUAL §16.
   */
  basePath: '/dashboard',

  /**
   * @praxis/commons se publica como TypeScript sin compilar y pnpm lo enlaza
   * dentro de node_modules, donde Next no transpila por defecto.
   */
  transpilePackages: ['@praxis/commons'],
};

export default nextConfig;
