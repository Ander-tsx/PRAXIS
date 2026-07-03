import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Multi-Zones: redirige todas las rutas /auth/* a auth-front.
   * En desarrollo: http://localhost:3002
   * En producción: AUTH_FRONT_URL apunta al deploy real de auth-front.
   *
   * Documentación verificada en:
   * node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/rewrites.md
   * La API de rewrites() no ha cambiado en Next.js 16 respecto a versiones anteriores.
   */
  async rewrites() {
    const authFrontUrl = process.env.AUTH_FRONT_URL ?? 'http://localhost:3002';
    const adminFrontUrl = process.env.ADMIN_FRONT_URL ?? 'http://localhost:3003';
    const projectsFrontUrl = process.env.PROJECTS_FRONT_URL ?? 'http://localhost:3004';
    const dashboardFrontUrl = process.env.DASHBOARD_FRONT_URL ?? 'http://localhost:3005';
    const reportsFrontUrl = process.env.REPORTS_FRONT_URL ?? 'http://localhost:3006';

    return [
      {
        source: '/auth/:path*',
        destination: `${authFrontUrl}/auth/:path*`,
      },
      {
        source: '/admin/:path*',
        destination: `${adminFrontUrl}/admin/:path*`,
      },
      {
        source: '/projects/:path*',
        destination: `${projectsFrontUrl}/projects/:path*`,
      },
      {
        source: '/dashboard/:path*',
        destination: `${dashboardFrontUrl}/dashboard/:path*`,
      },
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
