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
 * 🔴 **El HTML privado solo se guarda por persona** (M7, ver «Lectura sin
 * conexión» más abajo), y nunca respuestas del gateway: llevan los datos de la
 * sesión, y en un móvil compartido quien entrase después los vería (I2).
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

/**
 * ## Lectura sin conexión (M7, D5)
 *
 * Las pantallas privadas ya visitadas se guardan **por persona**, en
 * `praxis-datos-<huella>`, donde la huella es un SHA-256 del correo que manda
 * la propia app al montarse (este SW no puede leer la cookie de sesión: es
 * httpOnly). Sin red, se sirve la última copia de **esa** persona y de nadie
 * más:
 *
 * - si entra otra cuenta, se borran las copias de cualquier otra (I2);
 * - al cerrar sesión, la app pide `olvidar-datos` y se borran todas;
 * - sin persona conocida, no se sirve ninguna copia.
 *
 * Solo navegaciones (HTML). Las peticiones RSC del router no se guardan: su
 * respuesta depende de cabeceras del árbol de rutas y una copia por URL podría
 * pintar un árbol que no encaja. Sin red, el router cae a una navegación dura,
 * y esa sí sale de aquí.
 */
const SESION = 'praxis-sesion';
const CLAVE_DE_PERSONA = '/__praxis/persona';
/** Lo privado que vale la pena leer sin red. `/admin` no: no está en móvil. */
const PREFIJOS_LEGIBLES = ['/projects', '/chat', '/assistant', '/main', '/ayuda'];
/** Cuántas pantallas se guardan por persona; las más viejas salen primero. */
const MAXIMO_DE_PANTALLAS = 60;

async function personaActual() {
  const respuesta = await (await caches.open(SESION)).match(CLAVE_DE_PERSONA);
  return respuesta ? respuesta.text() : null;
}

async function fijarPersona(huella) {
  if (!/^[a-f0-9]{16,128}$/.test(huella)) return;
  const sesion = await caches.open(SESION);
  await sesion.put(CLAVE_DE_PERSONA, new Response(huella));
  for (const nombre of await caches.keys()) {
    if (nombre.startsWith(PREFIJO_DATOS) && nombre !== PREFIJO_DATOS + huella) {
      await caches.delete(nombre);
    }
  }
}

async function olvidarDatos() {
  for (const nombre of await caches.keys()) {
    if (nombre.startsWith(PREFIJO_DATOS)) await caches.delete(nombre);
  }
  await caches.delete(SESION);
}

function esLegible(url) {
  return PREFIJOS_LEGIBLES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));
}

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
      const vigentes = new Set([ESTATICOS, RECURSOS, PAGINAS, SESION]);
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
    evento.waitUntil(olvidarDatos());
  } else if (tipo === 'persona' && typeof evento.data.huella === 'string') {
    evento.waitUntil(fijarPersona(evento.data.huella));
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
    evento.respondWith(redPrimero(peticion, evento));
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
 * Las navegaciones van a la red. Las privadas que salen bien se guardan para la
 * persona de ahora (M7); sin red se sirve su copia, y si no hay, «Sin
 * conexión», en la URL que se pidió para que recargar la vuelva a intentar.
 */
async function redPrimero(peticion, evento) {
  const url = new URL(peticion.url);
  const legible = esLegible(url);
  try {
    const respuesta = await fetch(peticion);
    if (
      legible &&
      respuesta.ok &&
      !respuesta.redirected &&
      (respuesta.headers.get('content-type') || '').includes('text/html')
    ) {
      const persona = await personaActual();
      if (persona) {
        evento.waitUntil(guardarPantalla(persona, url.href, respuesta.clone()));
      }
    }
    return respuesta;
  } catch {
    if (legible) {
      const persona = await personaActual();
      if (persona) {
        const guardada = await (await caches.open(PREFIJO_DATOS + persona)).match(url.href);
        if (guardada) return guardada;
      }
    }
    const sinConexion = await caches.match(SIN_CONEXION);
    return (
      sinConexion ||
      new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain' } })
    );
  }
}

async function guardarPantalla(persona, clave, respuesta) {
  const cache = await caches.open(PREFIJO_DATOS + persona);
  await cache.put(clave, respuesta);
  const claves = await cache.keys();
  /* `keys()` sale en orden de inserción: las primeras son las más viejas. */
  for (const vieja of claves.slice(0, Math.max(0, claves.length - MAXIMO_DE_PANTALLAS))) {
    await cache.delete(vieja);
  }
}

/* Push (docs/PLAN-PUSH.md). El servidor manda un JSON `{ title, body, url, tag }`.

   Todo push **tiene que** acabar en una notificación visible: Safari revoca la
   suscripción a quien recibe pushes sin enseñar nada, y Chrome enseña una
   genérica. Por eso no hay rama que se salte `showNotification`, ni siquiera si
   el JSON llega roto. El `tag` hace que un chat con varios mensajes seguidos
   sea una sola notificación que se actualiza. */
/* Cuántas líneas se apilan en la notificación de un chat. */
const LINEAS_APILADAS = 4;

self.addEventListener('push', (evento) => {
  evento.waitUntil(
    (async () => {
      let datos = {};
      try {
        datos = evento.data ? evento.data.json() : {};
      } catch {
        /* Un cuerpo que no es JSON se ignora: se enseña la notificación genérica. */
      }
      const titulo = typeof datos.title === 'string' && datos.title ? datos.title : 'Praxis';
      const tag = typeof datos.tag === 'string' ? datos.tag : undefined;
      let cuerpo = typeof datos.body === 'string' ? datos.body : '';
      let lineas = cuerpo ? [cuerpo] : [];

      /* Un chat con varios mensajes seguidos es **una** notificación con los
         últimos: se leen las líneas de la que ya hay con ese `tag` y se le suma
         la nueva. Si el navegador no deja leerlas, se enseña solo la nueva. */
      if (datos.acumular && tag) {
        try {
          const previas = await self.registration.getNotifications({ tag });
          const antes = previas[0]?.data?.lineas;
          if (Array.isArray(antes)) lineas = [...antes, ...lineas].slice(-LINEAS_APILADAS);
          cuerpo = lineas.join('\n');
        } catch {
          /* Sin acceso a las anteriores. */
        }
      }

      await self.registration.showNotification(titulo, {
        body: cuerpo,
        /* El icono de la app. `badge` es el pequeño de la barra de estado de
           Android: tiene que ser **monocromo sobre transparente**, o sale un
           cuadrado blanco. iOS pone el icono de la app por su cuenta. */
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        tag,
        renotify: Boolean(tag),
        /* Sonido: la web no puede elegir el suyo, suena el de notificaciones del
           sistema (`silent: false` lo pide expresamente). La vibración solo la
           respeta Android. */
        silent: false,
        vibrate: [120, 60, 120],
        timestamp: Date.now(),
        data: {
          url: typeof datos.url === 'string' && datos.url.startsWith('/') ? datos.url : '/',
          lineas,
        },
      });
    })(),
  );
});

/* Pulsar la notificación: si la app ya está abierta se lleva a esa ventana al
   sitio; si no, se abre. La URL es siempre relativa (se comprueba arriba): un
   push no puede mandar a nadie fuera de Praxis. */
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = new URL(evento.notification.data?.url ?? '/', self.location.origin).href;
  evento.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const ventana of ventanas) {
        if (new URL(ventana.url).origin !== self.location.origin) continue;
        await ventana.focus();
        if ('navigate' in ventana) await ventana.navigate(destino).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(destino);
    })(),
  );
});
