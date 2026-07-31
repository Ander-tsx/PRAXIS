import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * @praxis/commons se publica como TypeScript sin compilar y pnpm lo enlaza
   * dentro de node_modules, donde Next no transpila por defecto.
   */
  transpilePackages: ['@praxis/commons'],

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
