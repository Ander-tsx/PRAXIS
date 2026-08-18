import type { NextRequest, NextResponse } from 'next/server';

/**
 * Dónde se recuerda la última conversación abierta.
 *
 * ## Por qué una cookie y no `localStorage`
 *
 * Lo tiene que leer **el servidor**, en `chat/page.tsx`, para poder redirigir
 * antes de pintar nada. Con `localStorage` habría que renderizar la pantalla
 * vacía, hidratar, leer y navegar: un parpadeo de «elige a alguien» en cada
 * vuelta a Mensajes, que es exactamente el síntoma que esto viene a quitar.
 *
 * `httpOnly` porque nada del navegador la necesita, y así no engorda ninguna
 * superficie de scripting por un dato que solo sirve para redirigir.
 */
export const ULTIMO_CHAT_COOKIE = 'praxis_ultimo_chat';

/**
 * Cuánto se recuerda.
 *
 * Treinta días: lo bastante para que volver el lunes siga abriendo donde lo
 * dejaste el viernes, y lo bastante poco para que una sesión vieja en un equipo
 * compartido no reabra una conversación meses después.
 */
const DURACION_S = 30 * 24 * 60 * 60;

/**
 * Qué conversación describe una ruta de la zona, o `null` si no es una.
 *
 * Devuelve el **sufijo** bajo `/chat`, que es justo lo que hace falta para
 * reconstruir la URL: `"<peerId>"` en una privada, `"proyecto/<projectId>"` en
 * la de un equipo.
 *
 * ⚠️ **El `pathname` que llega aquí NO lleva el basePath**, y eso cambió al
 * mudar el chat a su propia zona (E3.3). Mientras vivía en dashboard-front
 * —basePath `/dashboard`— la ruta interna de una conversación era
 * `/chat/<uuid>`, y estas expresiones empezaban por `/chat/`. Ahora el basePath
 * **es** `/chat`, así que Next lo recorta y lo que llega es `/<uuid>` a secas.
 *
 * Dejar el `/chat/` de antes no habría dado ningún error: simplemente no
 * casaría nunca, la cookie no se escribiría jamás y «vuelve a donde lo dejaste»
 * dejaría de funcionar en silencio — que es justo la clase de rotura que esta
 * mudanza tenía que evitar.
 *
 * ⚠️ Se valida la forma en vez de aceptar cualquier cosa. El valor acaba en un
 * `redirect()`, así que dejarlo libre sería dejar que una ruta cualquiera decida
 * a dónde se manda al navegador; un `%2F..%2F` o una URL absoluta convertirían
 * el recuerdo en un redirector abierto. Con esto, lo único que cabe en la cookie
 * es un UUID —opcionalmente precedido de `proyecto/`— y nada más.
 */
export function conversacionDeLaRuta(pathname: string): string | null {
  const directa = /^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
  const deProyecto =
    /^\/proyecto\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

  const proyecto = deProyecto.exec(pathname);
  if (proyecto) return `proyecto/${proyecto[1]}`;

  const persona = directa.exec(pathname);
  if (persona) return persona[1] ?? null;

  return null;
}

/**
 * Deja anotada la conversación que se está abriendo, si la ruta es una.
 *
 * Se llama desde el proxy de la zona: ahí pasa **toda** navegación, así que no
 * hay que acordarse de anotarlo en cada página ni gastar una petición extra.
 * Si la ruta no es una conversación, no toca nada — volver al índice de
 * Mensajes no debe borrar el recuerdo, que es lo que lo hace útil.
 */
export function recordarConversacion(request: NextRequest, response: NextResponse): void {
  const conversacion = conversacionDeLaRuta(request.nextUrl.pathname);
  if (!conversacion) return;

  response.cookies.set(ULTIMO_CHAT_COOKIE, conversacion, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: DURACION_S,
    secure: process.env.NODE_ENV === 'production',
  });
}

/**
 * La conversación recordada, ya validada, o `null`.
 *
 * Se vuelve a validar al leer y no solo al escribir: la cookie viaja en la
 * petición y el navegador —o cualquiera con acceso a él— puede haberla
 * cambiado. Que la escribiéramos nosotros no es garantía de que sea lo que
 * vuelve.
 */
export function conversacionRecordada(valor: string | undefined): string | null {
  if (!valor) return null;
  /* Se reconstruye la ruta **interna** de la zona —sin basePath— porque es lo
     que `conversacionDeLaRuta` sabe leer. Ver su nota. */
  return conversacionDeLaRuta(`/${valor}`);
}
