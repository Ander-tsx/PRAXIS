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

    return [
      /*
       * 🕳️ Aquí estaba el rewrite de `/auth/:path*`.
       *
       * Sexta y última zona fusionada (F7). Las pantallas de sesión y los diez
       * route handlers que hablan con el gateway viven ya en `src/app/auth/`.
       * Las URLs no cambiaron, ni las públicas ni las de `/auth/api/*`.
       */
      /*
       * 🕳️ Aquí estaban las dos entradas de `/main`.
       *
       * Cuarta zona fusionada (F5). La cuenta —organizaciones, facturación,
       * papeles y ajustes— la sirve ya esta aplicación desde `src/app/main/`.
       */
      /*
       * 🕳️ Aquí estaban las dos entradas de `/projects`.
       *
       * Quinta y última zona privada fusionada (F6). Proyectos, tableros,
       * tareas y reglas los sirve ya esta aplicación desde `src/app/projects/`.
       */
      /*
       * 🕳️ Aquí estaban las dos entradas de `/admin`.
       *
       * Tercera zona fusionada (F4). El rol global se sigue comprobando en
       * `app/admin/layout.tsx`, no en el guard, y el gateway lo exige otra vez
       * en las rutas de `/api/admin`.
       */

      /*
       * 🕳️ Aquí estaban las dos entradas de `/chat`.
       *
       * Segunda zona fusionada (F3). Las pantallas viven en `src/app/chat/` y
       * la URL no cambió — incluida la redirección de cortesía desde
       * `/dashboard/chat`, que sigue más abajo en `redirects()`.
       */

      /*
       * 🕳️ Aquí estaban las dos entradas de `/assistant`.
       *
       * PRAX fue la primera zona en fusionarse (F2 de PLAN-FUSION-ZONAS): ya no
       * hay a dónde reescribir porque la pantalla la sirve esta misma
       * aplicación, desde `src/app/assistant/`. La URL no cambió.
       */

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
