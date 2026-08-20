'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Toaster, sileo } from 'sileo';
import { projectHref } from '../../api/routes';
import { useCurrentTheme, useRefrescoAgrupado } from '../../hooks';
import { marcarHiloPendiente, useLiveEvent, useReconnection } from '../../realtime';
import type { ChatMessageEvent, NoticeEvent } from '../../realtime';
import {
  PRESENTACION_DE_MENSAJE,
  type Presentacion,
  RELLENO_POR_TEMA,
  presentacionDe,
} from './styles';

/**
 * Las tarjetas que aparecen solas mientras la pantalla está abierta.
 *
 * ## Lo que este componente ya **no** hace
 *
 * Abría la conexión SSE y llamaba a `router.refresh()` con cada evento. Las dos
 * cosas se han ido, y las dos por el mismo motivo.
 *
 * La conexión ahora la abre [`LiveSource`] —una sola por pestaña, en el
 * armazón— porque el chat, la lista de conversaciones y los hilos quieren
 * enterarse de lo mismo, y cuatro `EventSource` por pestaña era pagar cuatro
 * veces por los mismos bytes.
 *
 * El refresco por cada mensaje era peor. Era lo único que metía un mensaje nuevo
 * en la conversación abierta, y entraba en la **misma cola de transición del App
 * Router que las Server Actions**: perder esa carrera contra un envío propio es
 * exactamente el fallo de «mi mensaje se envía, le llega al otro y en mi pantalla
 * no aparece». Ahora cada superficie se suscribe a lo suyo; aquí solo queda
 * **anunciar**, que es lo que este componente decía ser.
 *
 * ⚠️ **Queda un refresco, y solo para los avisos de bandeja.** Una invitación o
 * una tarea asignada sí cambian lo que renderiza el servidor —la bandeja, el
 * tablero— y esas pantallas no se suscriben a nada. Son unos pocos al día, no el
 * chorro constante del chat.
 *
 * ## Las tarjetas las pinta `sileo`
 *
 * Había un apilado propio de `<article>` con su temporizador y su tope de tres.
 * `sileo` hace eso mismo con una píldora que **se despliega** para enseñar el
 * texto, y ese despliegue es lo que permite darle un ritmo distinto a cada clase
 * de aviso: ver `estilos.ts`.
 *
 * ⚠️ **No reemplaza a la bandeja.** Si nadie tiene la pestaña abierta, el aviso
 * ya está guardado y se ve al entrar. Esto es una capa encima; que Redis o el
 * flujo fallen degrada el tiempo real y nada más.
 */
export function LiveNotices() {
  const pedirRefresco = useRefrescoAgrupado();
  const tema = useCurrentTheme();

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

  /**
   * Lanza la tarjeta y suena.
   *
   * ⚠️ El destino se navega con `window.location` y no con `next/link`: el aviso
   * aparece en cualquier zona y su destino puede vivir en otra —te llega estando
   * en el panel y lleva a `projects`—, así que la navegación tiene que ser dura.
   * Misma regla que la barra lateral (ESTADO-ACTUAL §16).
   */
  const anunciar = useCallback(
    (presentacion: Presentacion, descripcion: string, destino: string | null) => {
      sileo.show({
        type: presentacion.tipo,
        title: presentacion.titulo,
        description: descripcion,
        duration: presentacion.duracion,
        autopilot: presentacion.autopilot,
        /* El tono de la píldora sale de la paleta de PRAXIS, no del blanco y
           negro casi puros que trae `sileo`. Ver `RELLENO_POR_TEMA`. */
        fill: RELLENO_POR_TEMA[tema],
        ...(destino && presentacion.accion
          ? {
              button: {
                title: presentacion.accion,
                onClick: () => {
                  window.location.href = destino;
                },
              },
            }
          : {}),
      });
      sonar();
    },
    [sonar, tema],
  );

  /**
   * Un mensaje de chat: tarjeta y sonido.
   *
   * ⚠️ **Sin refrescar nada.** El mensaje ya lo ha insertado el panel de la
   * conversación por su cuenta, escuchando este mismo evento. Aquí solo se
   * decide si además hay que llamar la atención.
   */
  useLiveEvent('chat.mensaje', (evento) => {
    /* Lo tuyo no se te anuncia: lo acabas de escribir. El evento te llega igual
       —lo necesitan tus otras pestañas y el panel para reconciliar— pero sin
       ruido. `mio` lo resuelve el servidor, que sabe a quién manda cada copia. */
    if (evento.mio) return;

    /**
     * 🔴 **Una respuesta de hilo se anota aquí, y aquí es el único sitio donde
     * se puede.**
     *
     * Un mensaje escrito dentro de un hilo no aparece en la conversación: lo
     * único que cambia allí es el contador «N respuestas» de un mensaje que
     * puede estar muy arriba. Sin esta anotación, quien pulsa el aviso llega a
     * la conversación y no ve nada — que es el fallo reportado.
     *
     * Va **antes** de las dos salidas de abajo a propósito. Silenciado es «sin
     * tarjeta ni sonido», no «sin enterarse»; y estar mirando la conversación
     * quita la tarjeta, pero el hilo sigue cerrado y su punto sigue haciendo
     * falta.
     *
     * `visibleEnChat === false` es lo que distingue una respuesta **de hilo** de
     * una cita normal escrita desde el compositor principal: las dos llevan
     * `replyTo`, pero la segunda ya se ve en la conversación y no necesita que
     * nadie la señale.
     */
    const raizDelHilo =
      evento.mensaje.visibleEnChat === false ? evento.mensaje.replyTo?.id : undefined;
    if (raizDelHilo) marcarHiloPendiente(evento.channelId, raizDelHilo);

    /* Silenciado es «sin tarjeta ni sonido», no «sin enterarse». */
    if (evento.silenciado) return;

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
     * —`/chat/<id>` dentro de dashboard-front— mientras que `destinoDeMensaje`
     * construye la ruta pública completa. Comparar las dos daría siempre falso.
     * Aquí, además, estamos en un manejador de evento: el navegador ya está
     * montado y `location` es la verdad.
     */
    const destino = destinoDeMensaje(evento);
    if (destino && mismaVista(destino, window.location)) return;

    anunciar(PRESENTACION_DE_MENSAJE, textoDeMensaje(evento), destino);
  });

  /** Los avisos de la bandeja: invitaciones, asignaciones, altas y bajas. */
  useLiveEvent('aviso', (evento) => {
    /* Estos sí cambian lo que renderiza el servidor —la bandeja, el tablero— y
       esas pantallas no escuchan nada. */
    pedirRefresco();

    const destino = destinoDeAviso(evento);
    if (destino && mismaVista(destino, window.location)) return;

    anunciar(presentacionDe(evento.type), describir(evento), destino);
  });

  /**
   * Al recuperarse de un corte, se repasa lo que no se suscribe a nada.
   *
   * El chat se resincroniza solo —cada panel pide lo suyo con `?after=`, que es
   * una petición pequeña y exacta— pero la bandeja y el tablero se pintan en el
   * servidor y hay que volver a pedir la ruta.
   */
  useReconnection(pedirRefresco);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 639px)');
    setIsMobile(mobileQuery.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mobileQuery.addEventListener('change', handler);
    return () => mobileQuery.removeEventListener('change', handler);
  }, []);

  /**
   * ⚠️ **El `theme` va explícito, y no se puede omitir.**
   *
   * `sileo` pinta una píldora **de color contrario al tema** (`{light:
   * '#1a1a1a', dark: '#f2f2f2'}`), que es lo que le da protagonismo sin invadir:
   * sobre la aplicación oscura sale clara y al revés. Para acertar necesita
   * saber el tema, y si no se le pasa lo deduce de `prefers-color-scheme` — que
   * aquí **es la respuesta equivocada**: el tema de PRAXIS se elige a mano y
   * vive en la cookie `praxis_theme`, así que quien tenga el sistema en oscuro y
   * la aplicación en claro vería una tarjeta oscura sobre fondo claro.
   *
   * Sin `theme` tampoco se estampa `data-theme` en el contenedor, y sin ese
   * atributo la descripción se queda sin regla de color.
   *
   * `bottom-right` para no tapar la cabecera ni el buscador, que es donde estaba
   * el apilado anterior. En móvil van al centro para no romper los márgenes.
   */
  return (
    <Toaster
      position={isMobile ? 'bottom-center' : 'bottom-right'}
      theme={tema === 'dark' ? 'light' : 'dark'}
      offset={16}
    />
  );
}

/**
 * El texto de un mensaje de chat.
 *
 * ⚠️ **Sin el texto del mensaje, a propósito.** El evento **sí** lo trae —quien
 * lo recibe es participante del canal y ya tiene permiso para leerlo— pero
 * reproducirlo en una tarjeta que aparece sobre cualquier pantalla lo enseñaría
 * en la de quien tenga el portátil abierto en una reunión. Para leerlo está el
 * chat.
 *
 * Y el proyecto solo se nombra cuando distingue algo: en un mensaje privado no
 * hay proyecto, y decir «un proyecto» ahí sería inventarse un contexto.
 */
function textoDeMensaje(evento: ChatMessageEvent): string {
  const quien = evento.actorName?.trim() || null;
  const proyecto = evento.projectName ?? null;

  if (quien && proyecto) return `${quien} ha escrito en «${proyecto}».`;
  if (quien) return `${quien} te ha escrito.`;
  if (proyecto) return `Mensaje nuevo en el chat de «${proyecto}».`;
  return 'Tienes un mensaje nuevo.';
}

/**
 * A dónde lleva la tarjeta de un mensaje.
 *
 * ⚠️ **El chat de un equipo vive en Mensajes**, no en la pantalla del proyecto.
 * Esto apuntaba a `/projects/<slug>?tab=chat`, donde ya solo queda una muestra
 * de cuatro líneas — y como `mismaVista()` compara este destino con la URL
 * abierta para decidir si callar, con un destino que no coincidía con ninguna
 * pantalla real **la comparación daba falso siempre**: sonaba y salía tarjeta
 * aunque tuvieras la conversación delante, y también con un hilo abierto encima.
 *
 * ⚠️ Va con el **UUID** y no con el slug: esa ruta lo pasa tal cual a
 * `/projects/:id/chat/messages`, y todo lo anidado bajo `/projects/:id` espera
 * el UUID (CLAUDE.md, trampa 10).
 */
function destinoDeMensaje(evento: ChatMessageEvent): string | null {
  if (evento.channelKind === 'DIRECT') {
    return evento.peerId ? `/chat/${evento.peerId}` : null;
  }
  return evento.projectId ? `/chat/proyecto/${evento.projectId}` : null;
}

/**
 * El texto de un aviso de bandeja.
 *
 * Con nombre desde que el gateway lo resuelve al relevar el evento: en un equipo,
 * «te han asignado algo» sin decir quién obliga a abrirlo para saber si te
 * incumbe. Degrada a impersonal cuando `actorName` no viene —credentials caído,
 * una cuenta borrada—, que es la forma que tenía antes: se pierde un dato, no el
 * aviso.
 */
function describir(evento: NoticeEvent): string {
  const proyecto = evento.projectName ?? null;
  const tarea = evento.taskTitle ?? 'una tarea';
  const quien = evento.actorName?.trim() || null;
  /* «en «Proyecto»» o nada. Se compone una vez para que ninguna rama se olvide
     de contemplar el caso sin proyecto. */
  const donde = proyecto ? ` en «${proyecto}»` : '';

  switch (evento.type) {
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
    default:
      return 'Tienes un aviso nuevo.';
  }
}

/**
 * A dónde lleva la tarjeta de un aviso de bandeja.
 *
 * ⚠️ **Se usa `projectHref` y no una plantilla a mano.** El slug va en la URL y
 * el UUID en la API, los dos son `string`, y confundirlos no da error de
 * compilación: sale una URL fea, un 403 o un desplegable vacío. Ya se coló en
 * cinco sitios (CLAUDE.md, trampa 10).
 *
 * Sin `projectSlug` se cae al `projectId`, que el guard también resuelve: es
 * mejor una URL fea que una tarjeta que no lleva a ningún sitio.
 */
function destinoDeAviso(evento: NoticeEvent): string | null {
  const identificador = evento.projectSlug || evento.projectId;
  if (!identificador) return null;

  /* Los avisos de tarea abren la tarea directamente. La página resuelve el
     tablero desde `?task=`, así que no hace falta saberlo aquí. */
  if (evento.taskId) {
    return projectHref({ slug: identificador }, { task: evento.taskId });
  }

  /* Los de equipo llevan al proyecto sin más. `MEMBER_REMOVED` es la excepción:
     te acaban de sacar, así que el enlace daría 403 y sería peor que nada. */
  if (evento.type === 'MEMBER_REMOVED') return null;

  return projectHref({ slug: identificador });
}

/*
 * ⚠️ Aquí vivían `Tarjeta`, `tonoDe` y `TONO_POR_TIPO`: el apilado propio de
 * tarjetas, con su temporizador, su tope de tres y un color por tipo de aviso.
 * Lo pinta `sileo`, y el color por tipo se expresa ahora con sus estados
 * (`success`, `warning`, `error`, `info`, `action`) en `estilos.ts`, que además
 * decide el ritmo de despliegue de cada uno. Los colores de esos estados se
 * atan a la paleta de PRAXIS en `commons/styles/theme.css`.
 */

/**
 * ¿La pantalla que hay abierta es el destino de este aviso?
 *
 * Compara la ruta y, **solo si el destino la lleva**, la pestaña. Los parámetros
 * que trae la URL de más —`ws`, `board`— no deben romper la coincidencia: quien
 * mira el chat con un tablero recordado sigue mirando el chat.
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
