import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Multi-Zones: esta zona vive bajo `/dashboard` y el web-shell la expone con
   * un rewrite. El prefijo lo aplica Next automáticamente a `next/link`,
   * `useRouter()` y `redirect()`, así que dentro de la zona las rutas se
   * escriben **sin** él (`/profile`, no `/dashboard/profile`).
   *
   * Para salir de la zona hace falta navegación dura. Ver ESTADO-ACTUAL §16.
   */
  basePath: '/dashboard',

  /**
   * @praxis/commons se publica como TypeScript sin compilar y pnpm lo enlaza
   * dentro de node_modules, donde Next no transpila por defecto.
   */
  transpilePackages: ['@praxis/commons'],

  /**
   * ⚠️ **El tope por defecto de una Server Action es 1 MB, y el chat admite 25.**
   *
   * Subir un archivo va por una acción, así que con el valor por defecto todo
   * lo que pasara de 1 MB moría en el servidor con «Body exceeded 1 MB limit»
   * —un error que solo se ve en la consola— mientras la interfaz se quedaba
   * girando. Se sube al mismo tope que valida el backend, más un margen para
   * la sobrecarga del `multipart`: el límite de verdad lo sigue poniendo el
   * gateway, que es quien puede.
   */
  experimental: {
    serverActions: { bodySizeLimit: '30mb' },
  },
};

export default nextConfig;
