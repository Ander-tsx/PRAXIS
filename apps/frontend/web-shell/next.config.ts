import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * @praxis/commons se publica como TypeScript sin compilar y pnpm lo enlaza
   * dentro de node_modules, donde Next no transpila por defecto.
   */
  transpilePackages: ['@praxis/commons'],

  /**
   * Multi-Zones: redirige todas las rutas /auth/* a auth-front.
   * En desarrollo: http://localhost:4001
   * En producción: AUTH_FRONT_URL apunta al deploy real de auth-front.
   *
   * Los puertos del frontend viven en el rango 4000+ porque 3001-3004 los
   * ocupan los microservicios del backend por TCP. Ver docs/frontend/ESTADO-ACTUAL.md §4.2
   *
   * Documentación verificada en:
   * node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/rewrites.md
   * La API de rewrites() no ha cambiado en Next.js 16 respecto a versiones anteriores.
   */
  async rewrites() {
    const authFrontUrl = process.env.AUTH_FRONT_URL ?? 'http://localhost:4001';

    return [
      {
        source: '/auth/:path*',
        destination: `${authFrontUrl}/auth/:path*`,
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
