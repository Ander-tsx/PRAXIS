import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * El dominio por el que entra la gente, cuando no es el mismo que ve el
 * servidor. Ver el bloque `experimental` de abajo.
 *
 * Vacío en local: ahí navegador y servidor coinciden y no hace falta nada.
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
   * @praxis/commons se publica como TypeScript sin compilar y pnpm lo enlaza
   * dentro de node_modules, donde Next no transpila por defecto.
   */
  transpilePackages: ['@praxis/commons'],

  /**
   * ⚠️ **Sin esto, detrás de un proxy no se puede ni iniciar sesión.**
   *
   * Next compara el `Origin` de toda Server Action con el host que ve el
   * servidor y la rechaza si no coinciden — es su defensa contra CSRF. Detrás
   * de un proxy inverso (Caddy, un túnel, el router de una plataforma) el
   * servidor ve `localhost:8080` mientras el navegador manda el dominio
   * público: no coinciden nunca y **fallan todos los formularios** —login,
   * registro, crear proyecto—. El error es `Invalid Server Actions request`.
   *
   * La guía de Multi-Zones de Next lo da por obligatorio en esta arquitectura,
   * y con razón: un solo dominio sirve cinco aplicaciones distintas.
   * node_modules/next/dist/docs/01-app/02-guides/multi-zones.md §Server Actions
   *
   * ⚠️ **Se lee al compilar, no al arrancar.** Con `output: 'standalone'` el
   * valor acaba dentro de `.next/required-server-files.json`, así que ponerlo
   * en el `docker run` no sirve de nada: va en el `docker build`. Y sin
   * protocolo — `mi-dominio.com`, no `https://mi-dominio.com`.
   */
  experimental: {
    serverActions: {
      allowedOrigins: origenesPermitidos,
    },
  },

  /**
   * Multi-Zones: cada zona es una app Next independiente con su propio
   * `basePath`, y el shell la publica aquí.
   *
   * En desarrollo apuntan a localhost; en producción, a su deploy real vía
   * env var.
   *
   * Los puertos del frontend viven en el rango 4100+ porque 3001-3004 los
   * ocupan los microservicios del backend por TCP. Ver docs/frontend/ESTADO-ACTUAL.md §4.2
   *
   * Documentación verificada en:
   * node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/rewrites.md
   * La API de rewrites() no ha cambiado en Next.js 16 respecto a versiones anteriores.
   */
  async rewrites() {
    const authFrontUrl = process.env.AUTH_FRONT_URL ?? 'http://localhost:4101';
    const dashboardFrontUrl = process.env.DASHBOARD_FRONT_URL ?? 'http://localhost:4102';
    const projectsFrontUrl = process.env.PROJECTS_FRONT_URL ?? 'http://localhost:4103';
    const reportsFrontUrl = process.env.REPORTS_FRONT_URL ?? 'http://localhost:4104';

    return [
      {
        source: '/auth/:path*',
        destination: `${authFrontUrl}/auth/:path*`,
      },
      /**
       * Las dos entradas de dashboard-front: la raíz de la zona (`/dashboard`,
       * sin segmento extra) y todo lo que cuelga de ella. Sin la primera,
       * `/dashboard` a secas no casa con `/:path*` y cae en un 404 del shell.
       */
      {
        source: '/dashboard',
        destination: `${dashboardFrontUrl}/dashboard`,
      },
      {
        source: '/dashboard/:path*',
        destination: `${dashboardFrontUrl}/dashboard/:path*`,
      },
      { source: '/projects', destination: `${projectsFrontUrl}/projects` },
      {
        source: '/projects/:path*',
        destination: `${projectsFrontUrl}/projects/:path*`,
      },
      { source: '/reports', destination: `${reportsFrontUrl}/reports` },
      {
        source: '/reports/:path*',
        destination: `${reportsFrontUrl}/reports/:path*`,
      },
    ];
  },

  /**
   * Atajos: /login y /signup redirigen a /auth/login y /auth/signup.
   * Mejora de UX para que no haya que recordar el prefijo /auth.
   */
  async redirects() {
    return [
      { source: '/login', destination: '/auth/login', permanent: false },
      { source: '/signup', destination: '/auth/signup', permanent: false },
    ];
  },
};

export default nextConfig;
