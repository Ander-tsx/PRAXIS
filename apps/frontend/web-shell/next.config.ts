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
    const adminFrontUrl = process.env.ADMIN_FRONT_URL ?? 'http://localhost:4105';
    const chatFrontUrl = process.env.CHAT_FRONT_URL ?? 'http://localhost:4106';
    const assistantFrontUrl = process.env.ASSISTANT_FRONT_URL ?? 'http://localhost:4107';

    return [
      {
        source: '/auth/:path*',
        destination: `${authFrontUrl}/auth/:path*`,
      },
      /**
       * dashboard-front es `/main`. El shell no se mete con el enrutado interno,
       * todo lo que empieza por ahí se le manda a la zona.
       */
      { source: '/main', destination: `${dashboardFrontUrl}/main` },
      { source: '/main/:path*', destination: `${dashboardFrontUrl}/main/:path*` },
      { source: '/projects', destination: `${projectsFrontUrl}/projects` },
      {
        source: '/projects/:path*',
        destination: `${projectsFrontUrl}/projects/:path*`,
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
       * Las direcciones viejas siguen funcionando: hay una redirección de
       * cortesía en `redirects()`, más abajo.
       */
      { source: '/chat', destination: `${chatFrontUrl}/chat` },
      {
        source: '/chat/:path*',
        destination: `${chatFrontUrl}/chat/:path*`,
      },

      /**
       * PRAX, el asistente. Séptima zona.
       *
       * Salió de dentro de Análisis, donde era un panel al lado de los gráficos:
       * ahí solo se le podía preguntar por el informe que estabas viendo, y sabe
       * hacer bastante más. Sigue estando allí —con el proyecto ya puesto— pero
       * ahora tiene pantalla propia.
       *
       * Las **dos** entradas, como todas: sin la primera, `/assistant` a secas
       * —que es exactamente la ruta a la que lleva el menú— cae en el 404 del
       * shell.
       */
      { source: '/assistant', destination: `${assistantFrontUrl}/assistant` },
      {
        source: '/assistant/:path*',
        destination: `${assistantFrontUrl}/assistant/:path*`,
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

      /**
       * El chat se mudó de `/dashboard/chat` a su propia zona (E3), y estas dos
       * entradas son lo que impide que eso rompa nada por ahí fuera.
       *
       * Hay enlaces vivos a las direcciones viejas que no controlamos: los que
       * alguien haya compartido por privado, los que estén en el historial del
       * navegador y los que tenga guardados en marcadores. Un 404 en todos ellos
       * sería el coste de una decisión de arquitectura que a quien pulsa no le
       * importa.
       *
       * Van **aquí y no en dashboard-front**, que era el plan inicial: Next
       * evalúa `redirects()` antes que `rewrites()`, así que el shell puede
       * atenderlas antes de mandar nada a la zona del panel. Resolverlo en
       * dashboard-front obligaría a que esa zona siguiera sabiendo del chat solo
       * para reenviarlo, que es justo el acoplamiento que E3 viene a quitar.
       *
       * ⚠️ **`permanent: true` es un 308 y los navegadores lo cachean con
       * ganas.** Es lo correcto —la dirección se ha movido para siempre— pero
       * significa que quien la visite no volverá a preguntar; si algún día se
       * revierte la mudanza, esa caché sobrevive al despliegue.
       *
       * La cookie de «último chat» (`praxis_ultimo_chat`) sobrevive sola: va con
       * `path: '/'` y guarda solo el sufijo (`<uuid>` o `proyecto/<uuid>`), sin
       * prefijo de zona.
       */
      { source: '/dashboard/chat', destination: '/chat', permanent: true },
      {
        source: '/dashboard/chat/:path*',
        destination: '/chat/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
