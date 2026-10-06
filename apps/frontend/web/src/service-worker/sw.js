/**
 * El service worker de Praxis (M1 de `docs/PLAN-MOVIL.md`).
 *
 * Escrito a mano y no con Serwist ni Workbox (D3): Serwist exige webpack y aquí
 * se compila con Turbopack, y lo que hace falta son cuatro estrategias que se
 * leen enteras en este archivo.
 *
 * ## Qué se guarda y qué no (D4)
 *
 * | Petición                                | Estrategia                                 |
 * |-----------------------------------------|--------------------------------------------|
 * | `/_next/static/*`                        | Caché primero: llevan hash en el nombre    |
 * | Fuentes, iconos, `/media/*`, manifiesto  | Caché y revalidación en segundo plano      |
 * | Navegaciones (HTML)                      | Red; sin red, la pantalla «Sin conexión»   |
 * | Todo lo demás                            | **No se toca**: va directo a la red        |
 *
 * 🔴 **Nunca se guarda HTML de la aplicación ni respuestas del gateway** en
 * esta fase. Llevan los datos de la sesión, y en un móvil compartido quien
 * entrase después los vería (I2). La lectura sin conexión es M7, con una caché
 * por usuario que se borra al cerrar sesión (D5).
 *
 * 🔴 **Ni escrituras, ni sesión, ni flujos en vivo, ni Stripe** (I3): todo lo
 * que no sea un GET del mismo origen, `/api/*`, `/auth/api/*`, los
 * `text/event-stream` y las peticiones RSC pasan sin que este archivo los toque.
 *
 * ## Versiones (D6)
 *
 * Este archivo **no se sirve tal cual**: lo sirve `src/app/sw.js/route.ts` en
 * `/sw.js`, generado en el build con `const VERSION = '<versión>'` delante.
 * Cada despliegue cambia los bytes del script, y así es como el navegador se
 * entera de que hay uno nuevo —desde cualquier pestaña, también una vieja—.
 * El nuevo **espera** sin activarse hasta que la página le dice `activar`
 * —cuando la persona pulsa «Actualizar»—, para no recargar a nadie a mitad
 * de un documento.
 *
 * ⚠️ Estuvo versionado por la URL (`/sw.js?v=…`) y tenía un agujero: una
 * pestaña abierta desde antes del despliegue registraba **su** versión, la
 * vieja, como si fuera nueva, y «Actualizar» hacía bajar de versión. Con la
 * URL fija, el servidor siempre sirve la última y bajar no es posible.
 *
 * ## Si hubiera que retirarlo (I4)
 *
 * Desplegar este archivo con el cuerpo cambiado por:
 *
 *   self.addEventListener('install', () => self.skipWaiting());
 *   self.addEventListener('activate', async () => {
 *     for (const k of await caches.keys()) await caches.delete(k);
 *     await self.registration.unregister();
 *     for (const c of await self.clients.matchAll()) c.navigate(c.url);
 *   });
 *
 * Se desregistra solo en la siguiente visita de cada navegador.
 */

/* global VERSION */
/* `VERSION` la declara la línea que antepone `src/app/sw.js/route.ts`. */
const ESTATICOS = `praxis-estaticos-${VERSION}`;
const RECURSOS = `praxis-recursos-${VERSION}`;
const PAGINAS = `praxis-paginas-${VERSION}`;
/** Las cachés de datos por usuario de M7 empiezan así; se borran al salir. */
const PREFIJO_DATOS = 'praxis-datos-';

const SIN_CONEXION = '/sin-conexion';

self.addEventListener('install', (evento) => {
  evento.waitUntil(precargar());
});

/**
 * La pantalla «Sin conexión» y su hoja de estilos, para poder enseñarla sin
 * red. La hoja se saca del propio HTML: lleva hash en el nombre y cambia con
 * cada build.
 */
async function precargar() {
  const paginas = await caches.open(PAGINAS);
  const respuesta = await fetch(SIN_CONEXION, { cache: 'no-store' });
  if (!respuesta.ok) return;
  const html = await respuesta.text();

  /* ⚠️ **Se guarda sin `<script>`.** La pantalla se sirve en la URL que se
     pidió (`/projects/…`), no en `/sin-conexion`; con los scripts de Next
     dentro, el router hidrataría un árbol de otra ruta y, sin red, intentaría
     pedirlo. HTML y CSS puros no hidratan nada, y su «Reintentar» es un enlace
     que recarga la URL de verdad. */
  const sinScripts = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<link\b[^>]*rel="(?:preload|modulepreload)"[^>]*as="script"[^>]*>/gi, '');
  await paginas.put(
    SIN_CONEXION,
    new Response(sinScripts, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
  );

  const hojas = [...html.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)].map((m) => m[1]);
  const fuentes = [...html.matchAll(/href="(\/_next\/static\/media\/[^"]+\.woff2)"/g)].map(
    (m) => m[1],
  );
  const estaticos = await caches.open(ESTATICOS);
  await Promise.all(
    [...new Set([...hojas, ...fuentes])].map((url) => estaticos.add(url).catch(() => undefined)),
  );
}

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      /* Fuera las cachés de versiones anteriores. Las de datos no son de una
         versión: son de una persona, y las borra cerrar sesión. */
      const vigentes = new Set([ESTATICOS, RECURSOS, PAGINAS]);
      for (const nombre of await caches.keys()) {
        if (nombre.startsWith(PREFIJO_DATOS)) continue;
        if (!vigentes.has(nombre)) await caches.delete(nombre);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (evento) => {
  const tipo = evento.data?.tipo;
  if (tipo === 'activar') {
    self.skipWaiting();
  } else if (tipo === 'olvidar-datos') {
    evento.waitUntil(
      (async () => {
        for (const nombre of await caches.keys()) {
          if (nombre.startsWith(PREFIJO_DATOS)) await caches.delete(nombre);
        }
      })(),
    );
  }
});

/** Lo que este SW no debe tocar nunca (I3). */
function esIntocable(peticion, url) {
  if (peticion.method !== 'GET') return true;
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/api/')) return true;
  if ((peticion.headers.get('accept') || '').includes('text/event-stream')) return true;
  /* Las peticiones RSC del router llevan datos de la sesión, igual que el HTML. */
  if (peticion.headers.get('rsc') || url.searchParams.has('_rsc')) return true;
  if (url.pathname === '/sw.js') return true;
  return false;
}

function esRecursoPublico(url) {
  return (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/media/') ||
    url.pathname === '/manifest.webmanifest' ||
    /^\/(icon|apple-icon)[^/]*\.png$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  const url = new URL(peticion.url);
  if (esIntocable(peticion, url)) return;

  if (url.pathname.startsWith('/_next/static/')) {
    evento.respondWith(cachePrimero(peticion));
  } else if (esRecursoPublico(url)) {
    evento.respondWith(revalidarEnSegundoPlano(peticion, evento));
  } else if (peticion.mode === 'navigate') {
    evento.respondWith(redPrimero(peticion));
  }
  /* El resto no se toca: sin `respondWith`, el navegador lo pide como siempre. */
});

async function cachePrimero(peticion) {
  const cache = await caches.open(ESTATICOS);
  const guardada = await cache.match(peticion);
  if (guardada) return guardada;
  const respuesta = await fetch(peticion);
  if (respuesta.ok) cache.put(peticion, respuesta.clone());
  return respuesta;
}

async function revalidarEnSegundoPlano(peticion, evento) {
  const cache = await caches.open(RECURSOS);
  const guardada = await cache.match(peticion);
  const deRed = fetch(peticion)
    .then((respuesta) => {
      if (respuesta.ok) cache.put(peticion, respuesta.clone());
      return respuesta;
    })
    .catch(() => guardada);
  if (guardada) {
    evento.waitUntil(deRed);
    return guardada;
  }
  return deRed;
}

/**
 * Las navegaciones van a la red. Su HTML **no se guarda** (lleva la sesión);
 * sin red se enseña «Sin conexión», en la URL que se pidió para que recargar
 * la vuelva a intentar.
 */
async function redPrimero(peticion) {
  try {
    return await fetch(peticion);
  } catch {
    const sinConexion = await caches.match(SIN_CONEXION);
    return (
      sinConexion ||
      new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain' } })
    );
  }
}

/* Push (D14): fuera de este plan, y a propósito sin `addEventListener('push')`.
   Chrome exige enseñar una notificación por cada push; un oyente vacío haría que
   enseñara la suya genérica. Sin suscripciones no llega ninguno. */
