'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CHAT_EVENT_TYPE, type NotificationType } from '../../api/domain';
import { projectHref } from '../../api/routes';
import { useRefrescoAgrupado } from '../../hooks';
import { alpha, colors } from '../../tokens';

/**
 * Lo que publica el gateway por el flujo. Espejo de `AvisoEnVivo` allí.
 *
 * ⚠️ `type` es **texto libre**, no `NotificationType`. Por este flujo viaja
 * todo lo que hay que anunciar en el momento, y no todo deja fila en la
 * bandeja: los mensajes de chat llegan como `CHAT_MESSAGE` y no existen en el
 * enum de `notifications`. Tiparlo como el enum haría creer al resto del
 * archivo que la lista está cerrada, que es justo lo que no está.
 */
interface AvisoRecibido {
  type: NotificationType | typeof CHAT_EVENT_TYPE | (string & {});
  /** Quién lo provocó. En un mensaje privado es con quien hay que hablar. */
  actorId?: string | null;
  /** El nombre de quien lo provocó. Lo resuelve el gateway al relevar el
      evento; `null` o ausente cuando no se pudo, y entonces se lee impersonal. */
  actorName?: string | null;
  /**
   * Solo en los avisos de chat: de qué tipo de conversación viene.
   *
   * Es lo que decide a dónde lleva la tarjeta — al chat del proyecto o a la
   * conversación privada—, y no se puede deducir del resto: un mensaje privado
   * llega sin proyecto, así que sin esto sería indistinguible de un aviso al
   * que simplemente le falta el dato.
   */
  channelKind?: 'PROJECT' | 'DIRECT' | null;
  projectId: string | null;
  projectName: string | null;
  /**
   * Solo lo llevan los avisos de chat.
   *
   * Los demás se construyen desde una fila de `notifications`, que guarda el
   * nombre del proyecto como copia del momento pero no su slug. Cuando falta se
   * cae al `projectId`: el guard acepta las dos formas, así que el enlace
   * funciona igual — solo sale una URL más fea.
   */
  projectSlug?: string | null;
  taskId: string | null;
  taskTitle: string | null;
  createdAt: string;
}

interface AvisoEnPantalla {
  id: number;
  texto: string;
  tono: string;
  /** A dónde lleva al pulsarla. `null` si el aviso no tiene destino. */
  destino: string | null;
}

/** Cuánto se queda un aviso en pantalla antes de irse solo. */
const DURACION_MS = 6000;

/**
 * Tope de avisos apilados a la vez.
 *
 * Sin tope, alguien que asigne quince tareas de golpe llena la pantalla de
 * tarjetas y tapa la aplicación que vienen a anunciar.
 */
const MAXIMO_APILADO = 3;

export interface AvisosEnVivoProps {
  /**
   * Proxy de la zona, sin barra final: `/projects/api/gateway`.
   *
   * Tiene que ser el de la zona en la que estamos. El token vive en una cookie
   * httpOnly y `EventSource` no puede mandar cabeceras, así que la petición
   * **debe** cruzar el proxy para que le añada el `Authorization`.
   */
  gatewayPath: string;
}

/**
 * Avisos que llegan solos, mientras la pantalla está abierta.
 *
 * Escucha el flujo SSE del gateway —una sola vía: el servidor empuja y aquí no
 * se escribe nunca— y por cada aviso hace tres cosas: lo enseña unos segundos en
 * una tarjeta que entra por la derecha, suena, y **refresca la ruta**.
 *
 * Ese refresco es la parte que más importa y la más fácil de olvidar: sin él, el
 * aviso emergente contaría algo que la página de debajo sigue sin enseñar —la
 * insignia de la barra lateral con el número viejo, el tablero sin la tarea que
 * te acaban de asignar—. Refrescar vuelve a pedir los componentes de servidor
 * conservando el estado del cliente, así que la pantalla se pone al día sin
 * perder lo que estuvieras haciendo.
 *
 * ⚠️ **El refresco va agrupado, y eso no es una optimización cosmética.** Cada
 * `router.refresh()` entra en la misma cola global que las Server Actions, y
 * tenerla ocupada es lo que destapa el fallo del botón que gira para siempre
 * —explicado en `commons/hooks/useAccion`—. Por este flujo viaja también el
 * chat, que no tiene ritmo: uno a uno, una conversación viva dejaba la cola
 * ocupada casi todo el rato. Con [`useRefrescoAgrupado`] una ráfaga es un solo
 * refresco, y el resultado en pantalla es idéntico porque cada refresco trae el
 * estado completo, no un incremento.
 *
 * ⚠️ **No reemplaza a la bandeja.** Si nadie tiene la pestaña abierta, el aviso
 * ya está guardado y se ve al entrar. Esto es una capa encima; que Redis o el
 * flujo fallen degrada el tiempo real y nada más.
 *
 * ⚠️ **El flujo se recupera solo de los cortes.** `EventSource` reconecta
 * automáticamente cuando la conexión cae, pero lo publicado mientras estaba
 * caída se pierde: por eso el `onopen` de una reconexión refresca la ruta (es el
 * momento en que lo perdido se puede recuperar) y un vigilante de latidos
 * detecta las conexiones que mueren sin avisar —un socket que un intermediario
 * congela— y las fuerza a reconectar. Sin esto, un mensaje caído en un hueco de
 * red no aparecía hasta una recarga manual.
 */
export function AvisosEnVivo({ gatewayPath }: AvisosEnVivoProps) {
  const [avisos, setAvisos] = useState<AvisoEnPantalla[]>([]);
  const pedirRefresco = useRefrescoAgrupado();
  const siguienteId = useRef(0);

  /**
   * El contexto de audio se crea una vez y a la primera necesidad.
   *
   * Crearlo al montar no sirve: los navegadores lo dejan suspendido hasta que ha
   * habido un gesto de la persona, y uno creado antes de eso nace mudo.
   */
  const audio = useRef<AudioContext | null>(null);

  const sonar = useCallback(() => {
    try {
      const Contexto =
        window.AudioContext ??
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Contexto) return;

      audio.current ??= new Contexto();
      const contexto = audio.current;
      if (contexto.state === 'suspended') void contexto.resume();

      /**
       * Dos notas cortas, generadas aquí en vez de reproducir un archivo.
       *
       * Un `.mp3` habría que servirlo desde `public/` de cada zona **con su
       * basePath delante**, que es justo el detalle que se olvida y deja un 404
       * silencioso. Esto no se puede romper al desplegar y pesa cero.
       */
      const ahora = contexto.currentTime;
      for (const [indice, frecuencia] of [880, 1174].entries()) {
        const oscilador = contexto.createOscillator();
        const volumen = contexto.createGain();

        oscilador.type = 'sine';
        oscilador.frequency.value = frecuencia;

        const inicio = ahora + indice * 0.09;
        /* Rampas en vez de saltos: un gain que cambia de golpe suena a chasquido. */
        volumen.gain.setValueAtTime(0, inicio);
        volumen.gain.linearRampToValueAtTime(0.06, inicio + 0.01);
        volumen.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.16);

        oscilador.connect(volumen).connect(contexto.destination);
        oscilador.start(inicio);
        oscilador.stop(inicio + 0.18);
      }
    } catch {
      /* Sin audio disponible el aviso se ve igual. No es motivo para romper nada. */
    }
  }, []);

  useEffect(() => {
    /**
     * `withCredentials` no hace falta —es el mismo origen, la cookie va sola—
     * pero el flujo sí tiene que ser de la propia zona: el shell reescribe
     * `/<zona>/*` hacia ella, así que esta ruta relativa resuelve bien tanto en
     * local como detrás del balanceador.
     */
    let fuente: EventSource | null = null;
    /* La primera apertura es la inicial; las siguientes son RECONEXIONES.
       `EventSource` reintenta solo, pero al volver hay que refrescar: todo lo
       publicado mientras el flujo estuvo caído —un mensaje, una asignación— se
       perdió, y un `EventSource` no reenvía lo que no vio. Sin este refresco,
       eso no aparecía hasta una recarga manual o el siguiente aviso. */
    let primeraConexion = true;
    /* Cuándo llegó la última señal (aviso o latido), para el vigilante. */
    let ultimoLatido = Date.now();

    function marcarVivo() {
      ultimoLatido = Date.now();
    }

    function alLlegarAviso(evento: MessageEvent<string>) {
      marcarVivo();
      let aviso: AvisoRecibido;
      try {
        aviso = JSON.parse(evento.data) as AvisoRecibido;
      } catch {
        return;
      }

      const destino = destinoDe(aviso);

      /**
       * ⚠️ **Si ya estás mirando esa conversación, ni tarjeta ni sonido.**
       *
       * Avisar de un mensaje que aparece solo, delante de tus ojos, es ruido: la
       * tarjeta tapa el propio hilo y el sonido suena por algo que ya estás
       * leyendo. En una conversación viva eso son dos pitidos por minuto para no
       * decir nada nuevo.
       *
       * Se compara contra `window.location` y no contra `usePathname()` a
       * propósito: aquel devuelve la ruta **sin el basePath** de la zona
       * —`/chat/<id>` dentro de dashboard-front— mientras que `destinoDe`
       * construye la ruta pública completa. Comparar las dos daría siempre
       * falso. Aquí, además, estamos en un manejador de evento: el navegador ya
       * está montado y `location` es la verdad.
       *
       * ⚠️ **El refresco se pide igual.** Es lo que mete el mensaje en el hilo
       * abierto: silenciar el aviso no puede significar no enterarse.
       */
      const estoyViendolo = destino !== null && mismaVista(destino, window.location);

      pedirRefresco();
      if (estoyViendolo) return;

      const id = siguienteId.current++;
      setAvisos((actuales) =>
        [...actuales, { id, texto: describir(aviso), tono: tonoDe(aviso.type), destino }].slice(
          -MAXIMO_APILADO,
        ),
      );

      sonar();

      window.setTimeout(() => {
        setAvisos((actuales) => actuales.filter((candidato) => candidato.id !== id));
      }, DURACION_MS);
    }

    /* Un `latido` marca la conexión viva: es la señal de que el flujo sigue
       abierto aunque no haya avisos que mostrar. El vigilante de abajo lo
       necesita para distinguir «sin novedades» de «conexión muerta». */
    function abrirFlujo() {
      const nueva = new EventSource(`${gatewayPath}/me/notifications/stream`);
      fuente = nueva;

      nueva.addEventListener('aviso', alLlegarAviso as EventListener);
      nueva.addEventListener('latido', marcarVivo as EventListener);

      /* El `onerror` no cierra nada — `EventSource` reconecta solo, y cerrarlo
         aquí desactivaría esa reconexión. Lo que sí hacemos es refrescar al
         volver: es el momento en que lo perdido se puede recuperar. */
      nueva.onopen = () => {
        if (!primeraConexion) pedirRefresco();
        primeraConexion = false;
        marcarVivo();
      };
    }

    abrirFlujo();

    /* Vigilante de la conexión. `EventSource` no detecta que un flujo se quedó
       en silencio: si el gateway muere sin cerrar el socket —o un proxy
       intermedio lo congela— la conexión sigue «abierta» para el navegador pero
       no llega nada. Los latidos vienen cada 25 s, así que tras más de dos sin
       señal la conexión está muerta: se fuerza el cierre y la reconexión, y el
       `onopen` de arriba refresca lo perdido. */
    const vigilante = window.setInterval(() => {
      if (Date.now() - ultimoLatido > 2 * 25_000 + 10_000) {
        fuente?.close();
        abrirFlujo();
      }
    }, 15_000);

    return () => {
      window.clearInterval(vigilante);
      fuente?.removeEventListener('aviso', alLlegarAviso as EventListener);
      fuente?.removeEventListener('latido', marcarVivo as EventListener);
      fuente?.close();
    };
  }, [gatewayPath, pedirRefresco, sonar]);

  if (avisos.length === 0) return null;

  return (
    <div
      /* `aria-live="polite"`: se anuncia cuando quien escucha termina lo que
         esté leyendo, en vez de interrumpirle. Un aviso de cortesía no puede
         cortar la lectura de un formulario. */
      aria-live="polite"
      aria-label="Avisos recientes"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {avisos.map((aviso) => (
        <Tarjeta key={aviso.id} aviso={aviso} />
      ))}
    </div>
  );
}

/**
 * El texto del aviso emergente.
 *
 * ## Con nombre desde que el gateway lo resuelve
 *
 * Antes iba todo en impersonal —«Te han asignado…»— porque por el flujo solo
 * viajaba `actorId` y resolverlo desde aquí habría costado una petición por
 * aviso. Ahora lo resuelve el gateway al relevar el evento, con caché, así que
 * el nombre llega puesto y **quién lo hizo es la mitad del aviso**: en un chat de
 * equipo, «mensaje nuevo» sin remitente obliga a abrirlo para saber si te
 * incumbe.
 *
 * Sigue degradando a impersonal cuando `actorName` no viene —credentials caído,
 * una cuenta borrada, un emisor que no lo manda— y esa es la forma que tenía
 * antes: se pierde un dato, no el aviso.
 *
 * ## Y el proyecto solo cuando distingue algo
 *
 * En un mensaje privado no hay proyecto que nombrar, y decir «un proyecto» ahí
 * sería inventarse un contexto que no existe.
 */
function describir(aviso: AvisoRecibido): string {
  const proyecto = aviso.projectName ?? null;
  const tarea = aviso.taskTitle ?? 'una tarea';
  const quien = aviso.actorName?.trim() || null;
  /* «en «Proyecto»» o nada. Se compone una vez y se reutiliza abajo para que
     ninguna rama se olvide de contemplar el caso sin proyecto. */
  const donde = proyecto ? ` en «${proyecto}»` : '';

  /**
   * ⚠️ **Sin el texto del mensaje, a propósito.** El aviso no lo trae y no debe:
   * reproducir lo escrito lo enseñaría en la pantalla de quien tenga el portátil
   * abierto en una reunión. Para leerlo está el chat, que comprueba permisos.
   */
  if (aviso.type === CHAT_EVENT_TYPE) {
    if (quien && proyecto) return `${quien} ha escrito en «${proyecto}».`;
    if (quien) return `${quien} te ha escrito.`;
    if (proyecto) return `Mensaje nuevo en el chat de «${proyecto}».`;
    return 'Tienes un mensaje nuevo.';
  }

  switch (aviso.type) {
    case 'INVITATION_RECEIVED':
      return quien
        ? `${quien} te ha invitado a «${proyecto ?? 'un proyecto'}».`
        : `Te han invitado a «${proyecto ?? 'un proyecto'}».`;
    case 'INVITATION_ACCEPTED':
      return quien
        ? `${quien} ha aceptado tu invitación a «${proyecto ?? 'un proyecto'}».`
        : `Han aceptado tu invitación a «${proyecto ?? 'un proyecto'}».`;
    case 'INVITATION_REJECTED':
      return quien
        ? `${quien} ha rechazado tu invitación a «${proyecto ?? 'un proyecto'}».`
        : `Han rechazado tu invitación a «${proyecto ?? 'un proyecto'}».`;
    case 'MEMBER_LEFT':
      return quien
        ? `${quien} ha salido de «${proyecto ?? 'un proyecto'}».`
        : `Alguien ha salido de «${proyecto ?? 'un proyecto'}».`;
    case 'MEMBER_REMOVED':
      return `Te han sacado de «${proyecto ?? 'un proyecto'}».`;
    case 'TASK_ASSIGNED':
      return quien
        ? `${quien} te ha asignado «${tarea}»${donde}.`
        : `Te han asignado «${tarea}»${donde}.`;
    case 'TASK_UNASSIGNED':
      return quien
        ? `${quien} te ha quitado de «${tarea}»${donde}.`
        : `Te han quitado de «${tarea}»${donde}.`;
    case 'AUTOMATION_TASK_DUE_SOON':
      return `«${tarea}» vencerá pronto${donde}.`;
    case 'AUTOMATION_TASK_STALE':
      return `«${tarea}» lleva varios días sin movimiento${donde}.`;
    default:
      return 'Tienes un aviso nuevo.';
  }
}

/**
 * Una tarjeta.
 *
 * Con destino es un **enlace de verdad**, no un `onClick` sobre un `div`: así se
 * puede abrir en otra pestaña, se ve a dónde va en la barra de estado y el
 * teclado lo alcanza sin añadirle `role` ni `tabIndex` a mano.
 *
 * ⚠️ Y es `<a>` y no `next/link`: la tarjeta aparece en cualquier zona y el
 * destino vive en otra —el aviso te llega estando en el panel y lleva a
 * `projects`—, así que la navegación tiene que ser dura. Misma regla que la
 * barra lateral (ESTADO-ACTUAL §16).
 */
function Tarjeta({ aviso }: { aviso: AvisoEnPantalla }) {
  const caja =
    'animate-entrar-desde-la-derecha pointer-events-auto flex items-start gap-3 rounded-xl border border-border p-3';
  const estilo = {
    background: colors.surfaceElevated,
    boxShadow: `0 12px 32px ${alpha(colors.overlay, 55)}`,
  };

  const contenido = (
    <>
      <span
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
        style={{ background: aviso.tono }}
        aria-hidden="true"
      />
      <p className="font-sans text-sm leading-snug text-text-primary">{aviso.texto}</p>
    </>
  );

  if (!aviso.destino) {
    return (
      <article className={caja} style={estilo}>
        {contenido}
      </article>
    );
  }

  return (
    <a
      href={aviso.destino}
      className={`${caja} cursor-pointer transition-colors hover:border-border-strong`}
      style={estilo}
    >
      {contenido}
    </a>
  );
}

/**
 * A dónde lleva la tarjeta al pulsarla, o `null` si no lleva a ninguna parte.
 *
 * ⚠️ **Se usa `projectHref` y no una plantilla a mano.** El slug va en la URL y
 * el UUID en la API, los dos son `string`, y confundirlos no da error de
 * compilación: sale una URL fea, un 403 o un desplegable vacío. Ya se coló en
 * cinco sitios (CLAUDE.md, trampa 10).
 *
 * Sin `projectSlug` se cae al `projectId`, que el guard también resuelve. Es
 * mejor una URL fea que una tarjeta que no lleva a ningún sitio.
 */
function destinoDe(aviso: AvisoRecibido): string | null {
  /* Un mensaje privado no tiene proyecto: lleva a la conversación con quien
     escribió. Se resuelve antes que nada porque `projectId` viene vacío y la
     comprobación de abajo lo descartaría. */
  if (aviso.type === CHAT_EVENT_TYPE && aviso.channelKind === 'DIRECT') {
    return aviso.actorId ? `/dashboard/chat/${aviso.actorId}` : null;
  }

  const identificador = aviso.projectSlug || aviso.projectId;
  if (!identificador) return null;

  if (aviso.type === CHAT_EVENT_TYPE) {
    return projectHref({ slug: identificador }, { tab: 'chat' });
  }

  /* Los avisos de tarea abren la tarea directamente. La página resuelve el
     tablero desde `?task=`, así que no hace falta saberlo aquí. */
  if (aviso.taskId) {
    return projectHref({ slug: identificador }, { task: aviso.taskId });
  }

  /* Los de equipo —invitaciones, altas y bajas— llevan al proyecto sin más.
     `MEMBER_REMOVED` es la excepción: te acaban de sacar, así que el enlace
     daría 403 y sería peor que no ofrecerlo. */
  if (aviso.type === 'MEMBER_REMOVED') return null;

  return projectHref({ slug: identificador });
}

/**
 * El color del punto del aviso.
 *
 * Va por función y no por índice directo al mapa porque `type` ya no es una
 * lista cerrada: un `CHAT_MESSAGE` —o cualquier tipo que el gateway estrene
 * antes que el navegador— no está en `TONO_POR_TIPO` y leerlo daría `undefined`
 * sin que nada avise.
 */
function tonoDe(tipo: AvisoRecibido['type']): string {
  if (tipo === CHAT_EVENT_TYPE) return colors.info;
  return TONO_POR_TIPO[tipo as NotificationType] ?? colors.primary;
}

/** Mismos colores que la bandeja: equipo en ámbar, tareas en violeta, salidas en rojo. */
const TONO_POR_TIPO: Record<NotificationType, string> = {
  INVITATION_RECEIVED: colors.accent,
  INVITATION_ACCEPTED: colors.success,
  INVITATION_REJECTED: colors.textSecondary,
  MEMBER_LEFT: colors.warning,
  MEMBER_REMOVED: colors.error,
  TASK_ASSIGNED: colors.primary,
  TASK_UNASSIGNED: colors.textSecondary,
  AUTOMATION_TASK_DUE_SOON: colors.warning,
  AUTOMATION_TASK_STALE: colors.error,
};

/**
 * ¿La pantalla que hay abierta es el destino de este aviso?
 *
 * Compara la ruta y, **solo si el destino la lleva**, la pestaña. Un aviso del
 * chat de un proyecto apunta a `?tab=chat`: estar en el proyecto pero en otra
 * pestaña **no** cuenta como estarlo viendo, porque la conversación no está a la
 * vista. En cambio los parámetros que trae la URL de más —`ws`, `board`— no
 * deben romper la coincidencia: quien mira el chat con un tablero recordado
 * sigue mirando el chat.
 */
export function mismaVista(destino: string, actual: { pathname: string; search: string }): boolean {
  const [rutaDestino, consultaDestino] = destino.split('?');
  if (rutaDestino !== actual.pathname) return false;
  if (!consultaDestino) return true;

  const abiertos = new URLSearchParams(actual.search);
  for (const [clave, valor] of new URLSearchParams(consultaDestino)) {
    if (abiertos.get(clave) !== valor) return false;
  }
  return true;
}
