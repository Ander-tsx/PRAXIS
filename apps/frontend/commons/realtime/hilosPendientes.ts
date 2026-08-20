/**
 * Los hilos de los que ya se ha avisado y todavía no se han mirado.
 *
 * ## 🔴 Por qué no bastaba con contar respuestas
 *
 * `useHilosNoLeidos` enciende el punto comparando `_count.replies` con cuántas
 * respuestas había la última vez que se abrió ese hilo. Eso funciona **si ya se
 * conocía el hilo**, y para el que se ve por primera vez tiene que elegir: darlo
 * por nuevo —y encender de golpe todos los hilos viejos la primera vez que
 * alguien abre una conversación— o darlo por visto. Elegía lo segundo.
 *
 * Y ahí se colaba justo el caso que todo esto venía a resolver, reportado por el
 * usuario: **llega el aviso de una respuesta y se pulsa el aviso**, que lleva
 * derecho a la conversación. Si es la primera vez que se abre esa conversación
 * en este navegador, el hilo se sembraba como visto en el mismo instante en que
 * se pintaba, y el punto no salía nunca. Por el otro camino —ir a Mensajes y
 * entrar a mano— sí salía, porque para entonces ya había una marca anterior con
 * la que comparar. Dos caminos a la misma pantalla, dos resultados.
 *
 * ## Lo que arregla esto
 *
 * El aviso **es** la señal. Cuando llega una respuesta de hilo por el flujo en
 * vivo se anota aquí el mensaje raíz, y se anota esté donde esté quien lo
 * recibe: `LiveNotices` vive en `AppShell`, o sea en las siete zonas. Cuando
 * después se abra la conversación —por el aviso o a pie— el punto ya está
 * decidido, sin depender de que hubiera una marca previa con la que comparar.
 *
 * Es la misma pieza que decide si suena la tarjeta, así que el punto y el aviso
 * no se pueden contradecir: o se enteran los dos o no se entera ninguno.
 *
 * ⚠️ **Se anota antes de mirar si el canal está silenciado**, a propósito.
 * Silenciar es «sin tarjeta ni sonido», no «sin enterarse» — es la misma regla
 * que ya sigue lo no leído del canal (ver `ChatMessagePage.muted`).
 *
 * ⚠️ Y solo cubre lo que llega **con la aplicación abierta**, que es lo que hay:
 * el flujo SSE no reparte hacia atrás. Una respuesta que entre con todo cerrado
 * sigue dependiendo de la comparación de contadores, que es la que ya había.
 * Saberlo siempre y en cualquier dispositivo pide una marca de lectura por hilo
 * en el servidor, y eso es del equipo de backend.
 */

/** Prefijo de la clave. El canal va detrás: un almacén por conversación. */
const CLAVE = 'praxis_hilos_pendientes';

/**
 * Con qué se entera de un cambio quien ya está pintado.
 *
 * Quien escribe (`LiveNotices`) y quien lee (`useHilosNoLeidos`) están en dos
 * puntos del árbol que no se conocen, y `localStorage` no avisa a nadie dentro
 * de la misma pestaña —`storage` solo se dispara en **las otras**—. Un evento
 * en `window` es lo que hace que el punto salga en el momento y no en la
 * siguiente carga.
 */
export const EVENTO_HILOS_PENDIENTES = 'praxis:hilos-pendientes';

function claveDe(channelId: string): string {
  return `${CLAVE}:${channelId}`;
}

function avisar(channelId: string): void {
  window.dispatchEvent(new CustomEvent(EVENTO_HILOS_PENDIENTES, { detail: { channelId } }));
}

/**
 * ⚠️ Todo acceso va envuelto: `localStorage` **lanza** en modo privado de
 * algunos navegadores y con la cuota llena. Aquí eso no puede tumbar ni el aviso
 * ni la conversación — es una ayuda visual, no un dato del que dependa nada.
 */
export function leerHilosPendientes(channelId: string): Set<string> {
  try {
    const crudo = window.localStorage.getItem(claveDe(channelId));
    if (!crudo) return new Set();
    const valor: unknown = JSON.parse(crudo);
    if (!Array.isArray(valor)) return new Set();
    return new Set(valor.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function guardar(channelId: string, pendientes: Set<string>): void {
  try {
    if (pendientes.size === 0) {
      window.localStorage.removeItem(claveDe(channelId));
    } else {
      window.localStorage.setItem(claveDe(channelId), JSON.stringify([...pendientes]));
    }
  } catch {
    /* Sin sitio o sin permiso: se pierde el recuerdo, no la conversación. */
  }
}

/** Este hilo tiene una respuesta de la que ya se ha avisado. */
export function marcarHiloPendiente(channelId: string, rootId: string): void {
  const pendientes = leerHilosPendientes(channelId);
  if (pendientes.has(rootId)) return;
  pendientes.add(rootId);
  guardar(channelId, pendientes);
  avisar(channelId);
}

/** Ya se ha mirado: el punto se apaga. */
export function olvidarHiloPendiente(channelId: string, rootId: string): void {
  const pendientes = leerHilosPendientes(channelId);
  if (!pendientes.delete(rootId)) return;
  guardar(channelId, pendientes);
  avisar(channelId);
}
