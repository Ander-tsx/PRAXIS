import { execSync } from 'node:child_process';
import type { NextConfig } from 'next';

/**
 * La versión de este build, para el service worker (D6 de `docs/PLAN-MOVIL.md`).
 *
 * `src/app/sw.js/route.ts` la escribe dentro del script del SW: un build nuevo
 * son bytes nuevos, y el navegador instala otro SW que espera a que la persona
 * pulse «Actualizar». Commit **y** hora del build: con solo el commit, dos
 * builds del mismo commit —lo normal en local— darían el mismo script y el SW
 * viejo se quedaría pegado.
 * Sin git (la imagen de Docker no lo trae), el commit que da Railway o nada.
 */
function versionDelBuild(): string {
  let commit = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? '';
  if (!commit) {
    try {
      commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
    } catch {
      commit = 'sin-git';
    }
  }
  return `${commit}-${Date.now().toString(36)}`;
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_VERSION_APP: versionDelBuild(),
  },

  /**
   * @praxis/commons se publica como TypeScript sin compilar y pnpm lo enlaza
   * dentro de node_modules, donde Next no transpila por defecto.
   */
  transpilePackages: ['@praxis/commons'],

  /**
   * Probar desde el móvil en la misma red: `next dev` bloquea por defecto las
   * peticiones de otro host a sus recursos de desarrollo, y la página carga sin
   * hidratar. `DEV_ORIGINS=192.168.1.20` (separados por comas) las deja pasar.
   * Solo afecta a `next dev`.
   */
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(',').filter(Boolean) ?? [],

  experimental: {
    serverActions: {
      /**
       * 🔴 **El tope de Next son 1 MB, y por aquí suben archivos de 25.**
       *
       * Los adjuntos no van por un route handler: viajan **dentro del cuerpo de
       * una Server Action** (`uploadAttachmentAction` en tareas,
       * `uploadDirectAttachmentAction` en el chat), así que los limita esta
       * cifra y no la del gateway.
       *
       * Sin ponerla, Next corta en `1024 * 1024` —el valor está a pelo en
       * `next/dist/server/app-render/action-handler.js`— y responde **413 `Body
       * exceeded 1 MB limit.`**. Y ese 413 es especialmente malo:
       *
       * 1. Es **incoherente con lo que la propia interfaz promete**. El cliente
       *    valida contra `ATTACHMENT_MAX_BYTES` (10 MB) y
       *    `CHAT_ATTACHMENT_MAX_BYTES` (25 MB), y el backend acepta esos mismos
       *    números. O sea: la aplicación decía que sí a un PDF de 4 MB y lo
       *    rechazaba una capa más abajo.
       * 2. Ocurre **antes** de que corra el cuerpo de la acción, así que el
       *    `try/catch` que esa acción sí tiene no llega a verlo: la promesa se
       *    rechaza y la pantalla se iba al `error.tsx`. La red de seguridad para
       *    eso está en `commons/hooks/useAccion`; esto es la causa.
       * 3. **No se notaba con archivos pequeños**, que son los que uno prueba.
       *    Se leía como un fallo intermitente de red.
       *
       * 30 MB, no 25: el multipart y el sobre RSC ocupan además del archivo, y
       * quedarse justo en el tope haría fallar precisamente el archivo que la
       * validación acaba de dar por bueno.
       *
       * ⚠️ **Si sube `CHAT_ATTACHMENT_MAX_BYTES`, esto sube con él.** Son la
       * misma decisión escrita en dos sitios, y el que se quede corto no da un
       * error que hable de él.
       */
      bodySizeLimit: '30mb',
    },
  },

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
   * ⚠️ **Una ruta que vaya al gateway no se pone aquí.** Next evalúa
   * `rewrites()` al **construir** y guarda el destino ya
   * resuelto en `routes-manifest.json`: con `GATEWAY_URL` de relleno durante el
   * build, el destino queda cocido como `http://localhost:3000` y en producción
   * responde 500 pese a que el proceso tiene la variable correcta. Los rewrites
   * de zona sobrevivían a eso por casualidad —todas las apps compartían
   * máquina, así que `localhost:410x` también era cierto en producción—; el
   * gateway está en otra máquina y no tenía esa suerte.
   *
   * Va en un route handler que lea la variable en cada petición, como
   * `src/app/api/gateway/[...path]` y `src/app/api/webhooks/stripe`.
   */

  /**
   * Atajos: /login y /signup redirigen a /auth/login y /auth/signup.
   * Mejora de UX para que no haya que recordar el prefijo /auth.
   */
  /**
   * El service worker **nunca** se sirve de caché HTTP: si el navegador
   * guardara `sw.js`, no vería las versiones nuevas y la app se quedaría
   * congelada en la vieja (I4). Y su ámbito es la raíz entera.
   */
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },

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
