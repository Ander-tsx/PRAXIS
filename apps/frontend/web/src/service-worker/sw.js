/**
 * El service worker de Praxis: **solo** la pantalla «Sin conexión».
 *
 * ## Qué hace (y qué ya no hace)
 *
 * Existe únicamente para que quien abre la app instalada sin red vea «Sin
 * conexión» en vez de la pantalla de error del navegador. Nada más:
 *
 * | Petición                        | Qué se hace                                   |
 * |---------------------------------|-----------------------------------------------|
 * | Navegaciones (HTML)             | Red. Si falla, la pantalla «Sin conexión»     |
 * | CSS y fuentes de `/_next/static`| Red. Si falla, las de la pantalla «Sin conexión» |
 * | Todo lo demás                   | **No se toca**: va directo a la red           |
 *
 * 🔴 **No guarda nada para servirlo estando la red disponible**: ni estáticos, ni
 * recursos, ni pantallas privadas, ni datos. Praxis cambia a menudo, y cada capa de
 * caché era una forma de enseñar código o pantallas viejas sin ningún error. La
 * versión anterior (M1 y M7 de `docs/PLAN-MOVIL.md`) guardaba todo eso por persona y
 * se retiró el 2026-11-10. Tampoco hay notificaciones push.
 *
 * ## Limpieza de lo que dejó la versión anterior
 *
 * Al activarse se borran **todas** las cachés que no sean la de esta versión
 * (`praxis-estaticos-*`, `praxis-recursos-*`, `praxis-paginas-*`, `praxis-datos-*`,
 * `praxis-sesion`) y se cancela cualquier suscripción push que quedara. Se activa
 * en el momento (`skipWaiting`) y toma el mando (`clients.claim`): no hay nada que
 * proteger de un cambio de versión a mitad de uso, porque ya no sirve nada guardado.
 *
 * Este archivo no se sirve tal cual: `src/app/sw.js/route.ts` lo sirve en `/sw.js`
 * con `const VERSION = '<versión>'` delante, para que cada despliegue cambie sus
 * bytes y el navegador se entere de que hay uno nuevo.
 *
 * ## Si hubiera que retirarlo del todo
 *
 * Desplegar este archivo con el cuerpo cambiado por:
 *
 *   self.addEventListener('install', () => self.skipWaiting());
 *   self.addEventListener('activate', async () => {
 *     for (const k of await caches.keys()) await caches.delete(k);
 *     await self.registration.unregister();
 *     for (const c of await self.clients.matchAll()) c.navigate(c.url);
 *   });
 */

/* global VERSION */
/* `VERSION` la declara la línea que antepone `src/app/sw.js/route.ts`. */
const CACHE = `praxis-sin-conexion-${VERSION}`;
const SIN_CONEXION = '/sin-conexion';

self.addEventListener('install', (evento) => {
  evento.waitUntil(precargar().then(() => self.skipWaiting()));
});

/**
 * La pantalla «Sin conexión», sus hojas de estilo y sus fuentes. Las hojas se sacan del
 * propio HTML: llevan hash en el nombre y cambian con cada build.
 *
 * ⚠️ **La página se guarda sin `<script>`.** Se sirve en la URL que se pidió
 * (`/projects/…`), no en `/sin-conexion`; con los scripts de Next dentro, el router
 * hidrataría un árbol de otra ruta y, sin red, intentaría pedirlo. HTML y CSS puros no
 * hidratan nada, y su «Reintentar» es un enlace que recarga la URL de verdad.
 */
async function precargar() {
  const respuesta = await fetch(SIN_CONEXION, { cache: 'no-store' });
  if (!respuesta.ok) return;
  const html = await respuesta.text();

  const sinScripts = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<link\b[^>]*rel="(?:preload|modulepreload)"[^>]*as="script"[^>]*>/gi, '');

  const cache = await caches.open(CACHE);
  await cache.put(
    SIN_CONEXION,
    new Response(sinScripts, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
  );

  const hojas = [...html.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)].map((m) => m[1]);
  const fuentes = [...html.matchAll(/href="(\/_next\/static\/media\/[^"]+\.woff2)"/g)].map(
    (m) => m[1],
  );
  await Promise.all(
    [...new Set([...hojas, ...fuentes])].map((url) => cache.add(url).catch(() => undefined)),
  );
}

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      for (const nombre of await caches.keys()) {
        if (nombre !== CACHE) await caches.delete(nombre);
      }
      /* Las suscripciones push de la versión anterior ya no tienen a nadie al otro lado. */
      try {
        const suscripcion = await self.registration.pushManager?.getSubscription();
        await suscripcion?.unsubscribe();
      } catch {
        /* Sin permiso o sin soporte: no hay nada que cancelar. */
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  const url = new URL(peticion.url);
  if (peticion.method !== 'GET' || url.origin !== self.location.origin) return;

  if (peticion.mode === 'navigate') {
    /* Las navegaciones van a la red; solo si falla, «Sin conexión», en la URL que se pidió
       para que recargar la vuelva a intentar. */
    evento.respondWith(
      fetch(peticion).catch(async () => {
        const guardada = await caches.match(SIN_CONEXION);
        return (
          guardada ||
          new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain' } })
        );
      }),
    );
  } else if (url.pathname.startsWith('/_next/static/')) {
    /* Red primero: la caché solo responde cuando la red falla, es decir, para pintar la
       pantalla «Sin conexión». Con red, siempre lo de ahora. */
    evento.respondWith(
      fetch(peticion).catch(() => caches.match(peticion).then((r) => r || Response.error())),
    );
  }
  /* El resto no se toca: sin `respondWith`, el navegador lo pide como siempre. */
});
