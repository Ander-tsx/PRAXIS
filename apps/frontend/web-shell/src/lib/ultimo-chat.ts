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
 * ⚠️ **Lo que llega aquí es la ruta YA sin `/chat` delante**, y esa resta la
 * hace quien llama. Es la tercera vez que este detalle cambia y ninguna dio un
 * error: mientras el chat vivió en dashboard-front la ruta interna era
 * `/chat/<uuid>`; al mudarlo a zona propia el `basePath` pasó a ser `/chat` y
 * Next lo recortaba, dejando `/<uuid>` (E3.3); y desde F3 de la fusión no hay
 * `basePath` ninguno, así que el proxy recibe `/chat/<uuid>` y **quita el
 * prefijo a mano** antes de llamar aquí.
 *
 * Se mantiene la forma sin prefijo a propósito, para que `conversacionRecordada`
 * —que reconstruye `/<valor>` desde la cookie— siga sirviendo sin traducir.
 *
 * Equivocarse **no da ningún error**: la expresión no casa, la cookie no se
 * escribe nunca y «vuelve a donde lo dejaste» deja de funcionar en silencio.
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
 * Cabecera con la que Next marca una petición de **prefetch**.
 *
 * Verificado en el propio paquete, no de memoria:
 * `next/dist/client/components/app-router-headers.js` →
 * `NEXT_ROUTER_PREFETCH_HEADER = 'next-router-prefetch'`. La de segmento
 * (`next-router-segment-prefetch`) es otra constante del mismo archivo y viaja
 * sola en los prefetch parciales de PPR, así que hay que mirar las dos.
 *
 * ⚠️ **`rsc` NO sirve para distinguirlas.** Una navegación de verdad del App
 * Router también es una petición `rsc: 1`; lo que separa el prefetch del
 * clic es exactamente esta cabecera.
 */
const CABECERAS_DE_PREFETCH = ['next-router-prefetch', 'next-router-segment-prefetch'];

/**
 * ¿Esta petición es un prefetch de Next y no una navegación de verdad?
 */
function esPrefetch(request: NextRequest): boolean {
  return CABECERAS_DE_PREFETCH.some((cabecera) => request.headers.get(cabecera) !== null);
}

/**
 * Deja anotada la conversación que se está abriendo, si la ruta es una.
 *
 * Se llama desde el proxy de la zona: ahí pasa **toda** navegación, así que no
 * hay que acordarse de anotarlo en cada página ni gastar una petición extra.
 * Si la ruta no es una conversación, no toca nada — volver al índice de
 * Mensajes no debe borrar el recuerdo, que es lo que lo hace útil.
 *
 * ## 🔴 «Por el proxy pasa toda navegación» era verdad de más
 *
 * Reportado por un usuario con un vídeo: cada vez que entraba en Mensajes se
 * abría **una conversación al azar** de entre las suyas, no la última. No se
 * reproducía a voluntad, y por eso el fallo aguantó: depende de cuántas
 * conversaciones tengas y de en qué orden acaben unas peticiones que nadie ve.
 *
 * La causa es que por el proxy no pasan solo las navegaciones. Cada fila del
 * directorio es un `<Link>`, y el App Router **prefetcha** los que entran en el
 * viewport: una petición al servidor por conversación visible, sin que nadie
 * haya pulsado nada. Cada una casaba `/<uuid>`, cada una escribía la cookie, y
 * la que llegaba la última —orden de red, no de intención— era la que quedaba
 * recordada. De ahí el «al azar»: es literalmente una carrera.
 *
 * Con una o dos conversaciones el síntoma casi no aparece —el prefetch de la que
 * ya estabas mirando suele ganar—, y por eso se ve en la cuenta de quien tiene
 * muchas y no en la de quien prueba.
 *
 * Y no es un fallo de la cookie: un prefetch es una petición normal, así que su
 * `Set-Cookie` lo aplica el navegador igual que el de un clic.
 *
 * Por eso ahora un prefetch no anota nada. Recordar es una consecuencia de
 * **abrir** algo, y prefetchar no es abrirlo.
 */
export function recordarConversacion(request: NextRequest, response: NextResponse): void {
  if (esPrefetch(request)) return;

  /* Se quita el `/chat` de delante: `conversacionDeLaRuta` espera la ruta
     relativa a la sección. Ver su nota. */
  const relativa = request.nextUrl.pathname.replace(/^\/chat/, '') || '/';
  const conversacion = conversacionDeLaRuta(relativa);
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
  /* Se reconstruye la ruta relativa a la sección —sin `/chat`— porque es lo
     que `conversacionDeLaRuta` sabe leer. Ver su nota. */
  return conversacionDeLaRuta(`/${valor}`);
}
