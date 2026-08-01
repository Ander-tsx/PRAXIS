import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * El dominio por el que entra la gente, cuando no es el mismo que ve el
 * servidor. Ver el bloque `experimental` de abajo.
 */
const origenesPermitidos = process.env.PUBLIC_ORIGIN ? [process.env.PUBLIC_ORIGIN] : [];

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

  /**
   * ⚠️ **Sin esto, detrás de un proxy los formularios de esta zona fallan.**
   *
   * Next compara el `Origin` de toda Server Action con el host que ve el
   * servidor y la rechaza si no coinciden. Detrás de un proxy inverso no
   * coinciden nunca, así que sale `Invalid Server Actions request`. La zona
   * recibe el tráfico reescrito por el shell, pero valida contra el dominio
   * público igual que él — el razonamiento largo está en el `next.config.ts`
   * de `web-shell`.
   *
   * ⚠️ Se lee **al compilar**, no al arrancar: hay que pasarlo al `docker build`.
   */
  experimental: {
    serverActions: {
      allowedOrigins: origenesPermitidos,
    },
  },
};

export default nextConfig;
