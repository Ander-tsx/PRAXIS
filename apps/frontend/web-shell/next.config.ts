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
    const adminFrontUrl = process.env.ADMIN_FRONT_URL ?? 'http://localhost:4105';
    const chatFrontUrl = process.env.CHAT_FRONT_URL ?? 'http://localhost:4106';

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
      /**
       * El panel de administración. Las **dos** entradas, igual que las demás
       * zonas: sin la primera, `/admin` a secas no casa con `/:path*` y cae en el
       * 404 del shell.
       *
       * El shell no comprueba nada aquí —no protege ninguna zona— y no hace falta:
       * admin-front exige sesión en su `proxy.ts`, rol de administración en su
       * layout, y el gateway exige el rol otra vez en las cuatro rutas de
       * `/api/admin`.
       */
      { source: '/admin', destination: `${adminFrontUrl}/admin` },
      {
        source: '/admin/:path*',
        destination: `${adminFrontUrl}/admin/:path*`,
      },

      /**
       * El chat, que hasta E3 vivía dentro de `/dashboard/chat`. Las **dos**
       * entradas, como todas: sin la primera, `/chat` a secas —que es la
       * pantalla a la que lleva el menú— cae en el 404 del shell.
       *
       * Las direcciones viejas (`/dashboard/chat/*`) siguen funcionando: las
       * redirige dashboard-front, no el shell, porque el `basePath` de esa zona
       * hace que sea ella quien las recibe. Ver E3.5 del plan de pulido.
       */
      { source: '/chat', destination: `${chatFrontUrl}/chat` },
      {
        source: '/chat/:path*',
        destination: `${chatFrontUrl}/chat/:path*`,
      },

      /**
       * ⚠️ Las rutas de voz (`/api/alexa/*`) **no van aquí**, aunque lo parezca.
       *
       * Se intentó y falla de forma engañosa: Next evalúa `rewrites()` al
       * construir y guarda el destino ya resuelto en `routes-manifest.json`. Con
       * `GATEWAY_URL` de relleno durante el build, el destino queda cocido como
       * `http://localhost:3000` y en producción responde 500 pese a que el
       * proceso tiene la variable correcta.
       *
       * Los rewrites de arriba sobreviven a eso por casualidad: las seis apps
       * comparten máquina, así que `localhost:410x` también es cierto en
       * producción. El gateway está en otra máquina y no tiene esa suerte.
       *
       * Viven en `src/app/api/alexa/[...path]/route.ts`, que sí lee la variable
       * en cada petición.
       */
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
