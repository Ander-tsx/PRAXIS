import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * @praxis/commons se publica como TypeScript sin compilar y pnpm lo enlaza
   * dentro de node_modules, donde Next no transpila por defecto.
   */
  transpilePackages: ['@praxis/commons'],

  /*
   * 🕳️ Aquí vivían los `rewrites()` del multi-zone: catorce entradas que
   * mandaban `/auth`, `/main`, `/projects`, `/reports`, `/admin`, `/chat` y
   * `/assistant` a siete aplicaciones Next distintas, cada una con su
   * `basePath` y su puerto en el rango 4100+.
   *
   * Se fueron una a una entre F2 y F7 (`docs/PLAN-FUSION-ZONAS.md`). Ninguna
   * URL cambió: esta aplicación no tiene `basePath`, así que un segmento
   * llamado `projects` se sirve donde antes se reescribía.
   *
   * ⚠️ **Las rutas de voz (`/api/alexa/*`) nunca estuvieron aquí, y no deben
   * volver.** Next evalúa `rewrites()` al **construir** y guarda el destino ya
   * resuelto en `routes-manifest.json`: con `GATEWAY_URL` de relleno durante el
   * build, el destino queda cocido como `http://localhost:3000` y en producción
   * responde 500 pese a que el proceso tiene la variable correcta. Los rewrites
   * de zona sobrevivían a eso por casualidad —todas las apps compartían
   * máquina, así que `localhost:410x` también era cierto en producción—; el
   * gateway está en otra máquina y no tenía esa suerte.
   *
   * Viven en `src/app/api/alexa/[...path]/route.ts`, que lee la variable en
   * cada petición.
   */

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
