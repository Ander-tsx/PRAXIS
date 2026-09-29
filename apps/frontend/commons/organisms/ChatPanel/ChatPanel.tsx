'use client';

import { Zap } from 'lucide-react';

import {
  type ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ChatRefKind } from '../../api/chat-refs';
import { PRAX_REF_ID } from '../../api/chat-refs';
import { createApiClient } from '../../api/client';
import type { Directory } from '../../api/directory';
import { personName } from '../../api/directory';
import type { ChatAttachment, ChatMessage, ChatMessagePage } from '../../api/domain';
import { personLabel } from '../../api/domain';
import type { LinkPreview } from '../../api/link-preview';
import { avatarHref } from '../../api/presence';
import { Avatar } from '../../atoms/Avatar';
import { useRefrescoAgrupado } from '../../hooks';
import { useLiveEvent, useReconnection } from '../../realtime';
import { alpha, colors } from '../../tokens';
import { AttachmentPreview } from './AttachmentPreview';
import { Composer, type Sugerencia } from './Composer';
import { MessageBubble } from './MessageBubble';
import { PinnedBar } from './PinnedBar';
import { ThreadPanel } from './ThreadPanel';
import { fieldFromBody } from './tagging';
import { useHilosNoLeidos } from './useHilosNoLeidos';

/** Cuántos mensajes trae cada tirón del historial. */
const PAGINA = 50;

/**
 * Cuánto silencio parte un bloque de mensajes seguidos.
 *
 * Cinco minutos: dos frases seguidas son una intervención, pero lo que se
 * escribió media hora después es otra cosa aunque sea de la misma persona, y
 * agruparlas haría creer que se dijeron del tirón.
 */
const CORTE_DE_BLOQUE_MS = 5 * 60_000;

export interface ChatActions {
  /**
   * `enHilo` separa «responder» de «hilo»: los dos citan con `replyToId`,
   * pero solo un envío desde el panel del hilo (`enHilo: true`) se guarda
   * fuera de la conversación general. El compositor principal siempre manda
   * `false`, aunque lleve una cita puesta.
   */
  /**
   * Devuelve **el mensaje creado**, no solo si hubo error.
   *
   * ⚠️ Devolvía `{ error }` a secas, y lo que metía el mensaje en la pantalla era
   * el `revalidatePath` de la propia acción. Esa revalidación compite en la cola
   * de transición del App Router con los refrescos del flujo en vivo, y perder
   * esa carrera era el fallo de «se envía, le llega al otro y en mi pantalla no
   * sale». Con el mensaje en la respuesta, el panel lo inserta él mismo y no
   * depende de ninguna revalidación.
   */
  enviar: (
    cuerpo: string,
    replyToId: string | null,
    attachmentIds: string[],
    enHilo: boolean,
  ) => Promise<{ error: string | null; mensaje: ChatMessage | null }>;
  borrar: (messageId: string) => Promise<{ error: string | null }>;
  reaccionar: (messageId: string, emoji: string, on: boolean) => Promise<void>;
  /**
   * Fija o desfija un mensaje.
   *
   * Devuelve el estado nuevo para que el panel lo pinte al instante sin
   * revalidar — como reaccionar.
   */
  fijar: (
    messageId: string,
    on: boolean,
  ) => Promise<{
    error: string | null;
    pinned: boolean;
    pinnedById: string | null;
  }>;
  /**
   * Edita el texto de un mensaje propio.
   *
   * Devuelve el mensaje nuevo para que el panel lo pinte al instante sin
   * revalidar — el servidor es quien sabe si el autor coincide.
   */
  editar: (
    messageId: string,
    body: string,
  ) => Promise<{ error: string | null; message: ChatMessage | null }>;
  /** Sin argumentos: la zona ya sabe de qué canal habla. */
  marcarLeido: () => Promise<void>;
  /** Sube un archivo como borrador y devuelve sus metadatos para el chip. */
  adjuntar: (file: File) => Promise<{ error: string | null; attachment: ChatAttachment | null }>;
  /** Borra un borrador antes de enviarlo. */
  quitarAdjunto: (attachmentId: string) => Promise<{ error: string | null }>;
  /**
   * Preview de una URL del mensaje (título, imagen…). La pone la zona, que es
   * quien tiene el server action. Si no se da, los links se pintan clicables y
   * sin card.
   */
  previewDeLink?: (url: string) => Promise<LinkPreview | null>;
}

export interface ChatPanelProps {
  /**
   * En móvil, la conversación ocupa la pantalla entera.
   *
   * ## Por qué un modo aparte y no solo estilos responsive
   *
   * Un chat metido en una columna de 360 px con la lista de conversaciones
   * encima y la cabecera de la aplicación arriba deja unas pocas líneas útiles:
   * se escribe a ciegas y se lee de tres en tres mensajes. Toda app de
   * mensajería resuelve lo mismo igual —la lista y la conversación son dos
   * pantallas, no dos columnas— y es lo que se hace aquí a partir de `sm`.
   *
   * ⚠️ Se posiciona **fijo respecto al viewport**, así que quien lo active tiene
   * que dar una salida visible: sin ella, en móvil no habría forma de volver.
   * Va en `salidaMovil`, y por eso los dos van juntos.
   */
  pantallaCompletaEnMovil?: boolean;
  /**
   * El control de volver, solo visible en móvil.
   *
   * Lo pone la zona porque solo ella sabe a dónde se vuelve: al listado de
   * conversaciones en el panel, a las pestañas del proyecto en projects.
   */
  salidaMovil?: ReactNode;
  page: ChatMessagePage;
  /**
   * Quién es quién, **y si se pudo preguntar**.
   *
   * ⚠️ Era un `Map` a secas, y esa era la mitad del fallo de «Alguien que ya no
   * está»: un id ausente del mapa se leía como «esa cuenta se fue» tanto si el
   * directorio había respondido que no existe como si la consulta había fallado.
   * Un 429 del limitador se convertía así en una afirmación falsa sobre gente
   * que estaba perfectamente. Ver `commons/api/directory.ts`.
   */
  directorio: Directory;
  currentUserId: string;
  acciones: ChatActions;

  /** Proxy de la zona, sin barra final: `/dashboard/api/gateway`. */
  gatewayPath: string;
  /** Ruta del gateway del canal: `/me/chats/<id>` o `/projects/<id>/chat`. */
  rutaCanal: string;

  canWrite: boolean;
  /**
   * Cuánta gente **además de ti** puede leer este canal.
   *
   * Es lo que decide si un mensaje tuyo está «visto por todos» —los dos checks
   * en azul— o solo por algunos. Lo pone la zona porque es quien conoce el
   * canal: uno en una conversación privada, el equipo menos tú en la de un
   * proyecto. No sale de los acuses: ahí solo aparece quien ya ha abierto el
   * canal alguna vez, así que contarlos daría «todos» en cuanto lo abriera el
   * primero.
   */
  participantes?: number;
  /** Si `@` ofrece personas. Apagado en las conversaciones privadas. */
  permiteMenciones: boolean;
  /** Qué se enseña cuando no hay ni un mensaje. */
  vacio: string;
  /** Por qué no puedes escribir, si es que no puedes. */
  motivoSinEscribir?: string;
  /** La cabecera: quién es, y los controles del canal. */
  encabezado: ReactNode;
  hrefDePersona?: (userId: string) => string | null;
  hrefDeRef?: (kind: ChatRefKind, id: string) => string | null;
}

/**
 * Lo que la zona puede pedirle al panel desde fuera.
 *
 * Solo `abrirBusqueda`: el botón de la lupa vive en la cabecera —al lado de
 * «Silenciar avisos», con su mismo estilo— y la cabecera la construye la zona,
 * fuera del árbol del panel. Es lo único que se expone así; todo lo demás sigue
 * siendo props normales.
 */
export interface ChatPanelHandle {
  abrirBusqueda: () => void;
  buscarLocal: (termino: string) => void;
  cerrarBusqueda: () => void;
}

/**
 * Una conversación completa: cabecera, historial y redactor.
 *
 * ## Cómo llegan los mensajes nuevos
 *
 * **No abre ninguna conexión.** `LiveNotices` ya mantiene un flujo SSE por
 * persona —uno para toda la aplicación— y llama a `router.refresh()` con cada
 * evento; este panel se pinta en el servidor, así que ese refresco lo repinta
 * con lo último sin perder el estado del cliente ni lo que estuvieras
 * escribiendo. Abrir aquí un segundo `EventSource` sería una conexión más por
 * pestaña para enterarse de lo mismo.
 *
 * ## El historial sí se pide desde el cliente
 *
 * Solo hacia atrás y solo cuando alguien lo pide. Se antepone a lo que vino del
 * servidor, que siempre es la última página: los dos tramos no se solapan porque
 * uno termina donde empieza el otro.
 */
export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(function ChatPanel(
  {
    pantallaCompletaEnMovil = false,
    salidaMovil,
    page,
    directorio,
    currentUserId,
    acciones,
    gatewayPath,
    rutaCanal,
    canWrite,
    participantes = 0,
    permiteMenciones,
    vacio,
    motivoSinEscribir,
    encabezado,
    hrefDePersona,
    hrefDeRef,
  }: ChatPanelProps,
  ref,
) {
  const [older, setOlder] = useState<ChatMessage[]>([]);
  /**
   * Los mensajes que han llegado **después** de lo que sirvió el servidor.
   *
   * ## Es la pieza que arregla «mi mensaje no se pinta»
   *
   * La conversación se pintaba entera en el servidor y se actualizaba llamando a
   * `router.refresh()` con cada evento. Eso metía cada mensaje en la **misma
   * cola de transición del App Router** que el `revalidatePath` de la acción de
   * enviar, y en Next 16 una navegación encima de otra descarta la anterior:
   * cuando perdía la tuya, el mensaje estaba guardado, le llegaba al otro
   * extremo y en tu pantalla no aparecía. Aleatorio en apariencia, una carrera
   * en realidad.
   *
   * Ahora lo nuevo se acumula aquí, en estado de cliente, y llega por dos
   * caminos que **se solapan a propósito**:
   *
   * 1. La respuesta del envío, que devuelve el mensaje creado. Es el camino
   *    rápido: aparece en el mismo fotograma, sin esperar a la red del evento.
   * 2. El evento `chat.mensaje` del flujo, que es el que trae lo de los demás
   *    —y también lo tuyo desde otra pestaña—.
   *
   * Que se solapen no es un problema porque `insertarMensaje` deduplica por id.
   * Es justo lo que hace que ninguno de los dos caminos sea imprescindible: si
   * el flujo está caído, tu mensaje sale igual; si la respuesta tarda, el evento
   * llega antes y también sale.
   */
  const [nuevos, setNuevos] = useState<ChatMessage[]>([]);

  /* Para el único caso en que el panel no puede reconstruirse solo: un hueco de
     reconexión que no cupo. Ver `useReconnection` más abajo. */
  const refrescar = useRefrescoAgrupado();
  const [hasMore, setHasMore] = useState(page.hasMore);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [respondiendo, setRespondiendo] = useState<ChatMessage | null>(null);
  /**
   * El mensaje que se está editando **en el compositor de abajo**.
   *
   * ⚠️ **El editor es el compositor de siempre, no uno propio.** Hubo un
   * compositor dentro de la burbuja: mismo diseño, pero otro campo, más
   * pequeño, con su propio estado y su propio sitio en la pantalla. Al pedir
   * editar ahora se rellena el campo de escribir con el mensaje, se esconde el
   * clip —editar no cambia los adjuntos— y salen «Guardar» y «Cancelar» ahí
   * mismo. Un solo campo, el que ya se estaba mirando.
   */
  const [editando, setEditando] = useState<ChatMessage | null>(null);
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [alFinal, setAlFinal] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  /** Los borradores que esperan al envío del mensaje. */
  /**
   * Los borradores que esperan al envío, **uno por compositor**.
   *
   * ⚠️ **Era un solo estado para los dos, y por eso adjuntar un archivo en el
   * chat lo pegaba también en el hilo.** El panel monta dos `Composer` —el de la
   * conversación y el del hilo— y los dos leían `adjuntosPendientes` y
   * `subiendo`: el chip del archivo salía en los dos campos a la vez y las dos
   * ruletas de carga giraban juntas, aunque solo se hubiera pulsado un clip.
   * Peor todavía, enviar por cualquiera de los dos reclamaba el mismo id, así
   * que el archivo acababa donde no era.
   *
   * Son dos redactores distintos con dos borradores distintos. Se separan por
   * `destino`, que es lo que cada operación de adjuntar dice de sí misma.
   */
  const [adjuntosPendientes, setAdjuntosPendientes] = useState<{
    chat: ChatAttachment[];
    hilo: ChatAttachment[];
  }>({ chat: [], hilo: [] });
  const [subiendo, setSubiendo] = useState<{ chat: boolean; hilo: boolean }>({
    chat: false,
    hilo: false,
  });

  /**
   * El hilo abierto en el panel lateral, si hay uno.
   *
   * Guarda el mensaje raíz —el que pulsó quien abrió el hilo— y sus respuestas
   * en el orden que trajo el servidor. El panel lateral las reúne bajo el raíz;
   * en el historial las mismas respuestas fluyen como mensajes normales.
   */
  const [hiloRaiz, setHiloRaiz] = useState<ChatMessage | null>(null);
  const [hiloReplies, setHiloReplies] = useState<ChatMessage[]>([]);
  const [hiloCargando, setHiloCargando] = useState(false);
  const [hiloError, setHiloError] = useState<string | null>(null);

  /**
   * Búsqueda en la conversación.
   *
   * `busquedaAbierta` es la lupa que sustituye al historial; `termino` es el
   * texto que se está escribiendo en el campo; `resultados` son los mensajes que
   * devolvió el servidor (`null` = no se ha buscado nada todavía).
   *
   * ⚠️ La búsqueda **reemplaza** la vista del historial en lugar de filtrarlo
   * encima: el historial es una página con cursor y un filtro local solo
   * encontraría lo que ya está cargado, que es justo lo que la búsqueda se
   * trae al caso de encontrar. Al pulsar un resultado se vuelve al historial y
   * se salta al mensaje (cargando lo que falte por delante).
   */
  const [busquedaAbierta, setBusquedaAbierta] = useState(false);
  const [termino, setTermino] = useState('');
  const [resultados, setResultados] = useState<ChatMessage[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);

  /**
   * **Solo tus** reacciones pendientes de que el servidor las confirme:
   * `messageId` → `emoji` → puesta o quitada.
   *
   * ⚠️ Sin esto, reaccionar no se ve hasta que la página se vuelve a renderizar:
   * la lista viene del servidor y la acción no revalida —revalidar en cada
   * reacción repintaría la conversación entera—.
   *
   * ⚠️ **Y guardaba la lista entera de reacciones del mensaje, que es lo que
   * hacía que los emojis «no siempre se sumaran».** Esa lista pisaba la del
   * servidor para siempre: en cuanto reaccionabas a un mensaje, las reacciones
   * que pusiera **otra persona** en ese mismo mensaje ya no aparecían nunca —el
   * servidor las traía y la corrección local las tapaba—. Ahora se guarda el
   * delta de lo tuyo y se aplica **encima** de lo que trae el servidor, así que
   * lo de los demás nunca se pierde y lo tuyo se ve al instante. Al llegar la
   * confirmación del servidor el delta ya es idempotente y deja de notarse.
   */
  const [reaccionesLocales, setReaccionesLocales] = useState<Map<string, Map<string, boolean>>>(
    new Map(),
  );

  /**
   * Las reacciones que han puesto **otros** desde que se cargó la página.
   *
   * `messageId` → `"<userId>|<emoji>"` → puesta o quitada.
   *
   * ⚠️ **Van a un mapa distinto del de las tuyas, y no es duplicación.** El
   * tuyo (`reaccionesLocales`) es optimista: se escribe antes de que el servidor
   * conteste y se deshace si rechaza. Este es confirmado: llega del flujo, ya
   * ocurrió. Mezclarlos haría que el eco de tu propia reacción pisara un cambio
   * de opinión rápido —poner y quitar antes de que llegue el evento— dejándola
   * al revés de como la dejaste.
   *
   * La clave lleva el `userId` dentro porque varias personas pueden poner el
   * mismo emoji al mismo mensaje, y son reacciones distintas.
   */
  const [reaccionesAjenas, setReaccionesAjenas] = useState<Map<string, Map<string, boolean>>>(
    new Map(),
  );

  /**
   * Cuántas respuestas de hilo han llegado en vivo por cada mensaje raíz.
   *
   * Se suma a `_count.replies`, que es una foto del momento en que el servidor
   * sirvió la página. Sin esto, la marca «N respuestas» se quedaba congelada:
   * alguien contestaba en un hilo y el mensaje raíz seguía diciendo el número
   * viejo —o no diciendo nada, si era la primera respuesta— hasta recargar.
   */
  /**
   * Aplica tu delta pendiente sobre las reacciones que trae el servidor.
   *
   * Idempotente a propósito: poner un emoji que el servidor ya devuelve no lo
   * duplica, y quitar uno que ya no está no hace nada. Es lo que permite dejar
   * el delta puesto sin tener que adivinar cuándo el servidor «ya se enteró».
   */
  const conMisReacciones = useCallback(
    (mensaje: ChatMessage): ChatMessage['reactions'] => {
      const mias = reaccionesLocales.get(mensaje.id);
      const ajenas = reaccionesAjenas.get(mensaje.id);
      if (!mias?.size && !ajenas?.size) return mensaje.reactions;

      let salida = mensaje.reactions;

      /* Primero las de los demás, que llegan confirmadas por el flujo. */
      for (const [clave, puesta] of ajenas ?? []) {
        const [userId, emoji] = clave.split('|');
        if (!userId || !emoji) continue;
        const yaEsta = salida.some(
          (reaccion) => reaccion.emoji === emoji && reaccion.userId === userId,
        );
        if (puesta && !yaEsta) {
          salida = [...salida, { messageId: mensaje.id, emoji, userId }];
        } else if (!puesta && yaEsta) {
          salida = salida.filter(
            (reaccion) => !(reaccion.emoji === emoji && reaccion.userId === userId),
          );
        }
      }

      /* Y encima la tuya, que es optimista y manda: si acabas de pulsar, lo que
         se ve tiene que ser lo que pulsaste. */
      for (const [emoji, puesta] of mias ?? []) {
        const yaEsta = salida.some(
          (reaccion) => reaccion.emoji === emoji && reaccion.userId === currentUserId,
        );
        if (puesta && !yaEsta) {
          salida = [...salida, { messageId: mensaje.id, emoji, userId: currentUserId }];
        } else if (!puesta && yaEsta) {
          salida = salida.filter(
            (reaccion) => !(reaccion.emoji === emoji && reaccion.userId === currentUserId),
          );
        }
      }

      return salida;
    },
    [reaccionesLocales, reaccionesAjenas, currentUserId],
  );

  /**
   * Los fijados que este navegador ya ha aplicado, encima de lo que trajo el
   * servidor. Mismo motivo que `reaccionesLocales`: fijar no revalida, así que
   * sin esta corrección la marca no se vería hasta el siguiente render.
   */
  const [fijadosLocales, setFijadosLocales] = useState<
    Map<string, { pinnedAt: string | null; pinnedById: string | null }>
  >(new Map());

  /**
   * La barra de fijados, aparte del historial.
   *
   * ⚠️ **No sale de `mensajes`.** Un mensaje fijado hace tiempo puede no estar
   * cargado —el historial pagina hacia atrás y solo trae lo último—, así que la
   * barra pide su propia lista al servidor (`?pinned=true`, ya la sirve el
   * mismo endpoint que la búsqueda) en vez de filtrar lo que ya está en pantalla.
   */
  const [fijadosLista, setFijadosLista] = useState<ChatMessage[]>([]);
  const [fijadosIndice, setFijadosIndice] = useState(0);
  const [fijadosExpandido, setFijadosExpandido] = useState(false);

  /**
   * Los textos editados que este navegador ya ha aplicado, encima de lo que
   * trajo el servidor. Mismo motivo que los otros dos: editar no revalida, así
   * que sin esta corrección el cambio no se vería hasta el siguiente render.
   */
  const [editadosLocales, setEditadosLocales] = useState<
    Map<string, { body: string; editedAt: string }>
  >(new Map());

  /**
   * Los que este navegador ya ha borrado, con la fecha en que lo hizo.
   *
   * Mismo patrón que los tres de arriba: borrar sí revalida, pero la lápida
   * tiene que aparecer **en el mismo fotograma del clic** o el mensaje se queda
   * ahí, entero, hasta que el servidor conteste. En una conexión lenta eso son
   * segundos mirando algo que creías haber borrado.
   *
   * Se aplica encima de lo que trae el servidor y es idempotente: cuando llegue
   * la revalidación el mensaje ya vendrá con su `deletedAt` y esto dejará de
   * notarse.
   */
  const [borradosLocales, setBorradosLocales] = useState<Map<string, string>>(new Map());

  const [respuestasExtra, setRespuestasExtra] = useState<Map<string, number>>(new Map());

  /**
   * Qué hilos tienen respuestas sin mirar.
   *
   * Se apoya en `_count.replies`, que ya viaja con cada raíz, y recuerda en el
   * navegador cuántas había la última vez. El porqué de que no lo conteste el
   * servidor —y por qué entrar al chat borraría la marca aunque lo hiciera—
   * está entero en `useHilosNoLeidos`.
   */
  const {
    tieneNovedad: hiloTieneNovedad,
    marcarVisto: marcarHiloVisto,
    sembrar: sembrarHilos,
    listo: hilosListos,
  } = useHilosNoLeidos(page.channelId);

  // Limpiar el estado local de respuestas extra si la página servida cambia
  // (por ejemplo, tras una revalidación, la base de datos ya trae los contadores actualizados)
  useEffect(() => {
    setRespuestasExtra(new Map());
  }, [page.items]);

  /**
   * El historial completo: lo viejo, lo que sirvió el servidor y lo que ha
   * llegado después, **sin repetidos y en orden**.
   *
   * ⚠️ La deduplicación por id es lo que permite que el mensaje propio llegue
   * por dos caminos a la vez —la respuesta del envío y el evento del flujo— sin
   * salir dos veces. Gana el más reciente de los dos: `Map` conserva el orden de
   * inserción y sobrescribe el valor al repetir clave, así que un mensaje del
   * flujo (que puede traer adjuntos ya reclamados) pisa al de la respuesta sin
   * moverlo de sitio.
   *
   * ⚠️ Y se filtra `visibleEnChat`: una respuesta escrita **dentro del panel del
   * hilo** no fluye por la conversación general. Sin este filtro, un mensaje de
   * hilo que llegara por el flujo aparecía en medio del chat, que es lo que el
   * modelo lleva evitando desde que se separaron «responder» y «hilo».
   */
  const historial = useMemo(() => {
    if (busquedaAbierta && resultados !== null) {
      return [...resultados]
        .filter((m) => m.visibleEnChat !== false)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    const porId = new Map<string, ChatMessage>();
    for (const mensaje of [...older, ...page.items, ...nuevos]) {
      if (mensaje.visibleEnChat === false) continue;
      porId.set(mensaje.id, mensaje);
    }
    return [...porId.values()].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [older, page.items, nuevos, busquedaAbierta, resultados]);

  const mensajes = historial.map((mensaje) => {
    const reacciones = conMisReacciones(mensaje);
    const fijado = fijadosLocales.get(mensaje.id);
    const editado = editadosLocales.get(mensaje.id);
    const borrado = borradosLocales.get(mensaje.id);
    const respuestasNuevas = respuestasExtra.get(mensaje.id) ?? 0;
    return {
      ...mensaje,
      reactions: reacciones,
      ...(respuestasNuevas > 0
        ? { _count: { replies: mensaje._count.replies + respuestasNuevas } }
        : {}),
      ...(fijado ? { pinnedAt: fijado.pinnedAt, pinnedById: fijado.pinnedById } : {}),
      ...(editado ? { body: editado.body, editedAt: editado.editedAt } : {}),
      /* La lápida va la última: si un mensaje está borrado, ninguna de las
         correcciones de arriba tiene ya sentido sobre él. Se vacía el cuerpo y
         se quitan adjuntos y reacciones aquí también, para que la burbuja nunca
         llegue a ver contenido de un mensaje que ya no existe. */
      ...(borrado
        ? {
            deletedAt: borrado,
            body: '',
            reactions: [],
            attachments: [],
            pinnedAt: null,
            pinnedById: null,
          }
        : {}),
    };
  });
  const ultimoId = mensajes.at(-1)?.id;

  /**
   * Los hilos que se ven ahora, con su número de respuestas.
   *
   * Es una cadena y no un array a propósito: `mensajes` se reconstruye en cada
   * render —es un `.map`, no un `useMemo`— así que como dependencia de efecto
   * dispararía siempre. Esta firma solo cambia cuando cambia algún contador,
   * que es justo cuando hay algo que sembrar.
   */
  const firmaDeHilos = mensajes
    .filter((mensaje) => mensaje._count.replies > 0)
    .map((mensaje) => `${mensaje.id}:${mensaje._count.replies}`)
    .join('|');

  /**
   * Un hilo que se ve por primera vez nace **visto**.
   *
   * Si no, la primera visita a una conversación con historial encendería todos
   * sus hilos a la vez. Ver la nota 2 de `useHilosNoLeidos`.
   */
  useEffect(() => {
    if (!hilosListos || !firmaDeHilos) return;
    const conteos = new Map<string, number>();
    for (const par of firmaDeHilos.split('|')) {
      const corte = par.lastIndexOf(':');
      conteos.set(par.slice(0, corte), Number(par.slice(corte + 1)));
    }
    sembrarHilos(conteos);
  }, [firmaDeHilos, hilosListos, sembrarHilos]);

  /**
   * Con el hilo abierto, lo que hay dentro se está viendo.
   *
   * Una sola fuente para la marca, igual que el contador de «N respuestas»: se
   * apunta aquí y en ningún otro sitio. Cubre los tres casos con la misma
   * línea —abrirlo, recibir una respuesta con él delante y escribir tú una— sin
   * que ninguno tenga que acordarse.
   *
   * ⚠️ Mientras carga, `hiloReplies` está vacío y esto apunta un 0. Es la
   * dirección segura: si la carga falla, el recuerdo se queda por debajo del
   * contador real y el punto **sigue encendido**, que es lo correcto cuando el
   * hilo no ha llegado a verse.
   */
  useEffect(() => {
    if (!hiloRaiz || !hilosListos) return;
    marcarHiloVisto(hiloRaiz.id, hiloReplies.length);
  }, [hiloRaiz, hiloReplies.length, hilosListos, marcarHiloVisto]);

  /**
   * Lo último que ha llegado al canal, **contando también los hilos**.
   *
   * ⚠️ **`ultimoId` no vale para marcar leído, y ahí estaba el fallo de que las
   * respuestas de un hilo se quedaran siempre sin ver.** `mensajes` filtra
   * `visibleEnChat`, así que una respuesta escrita dentro de un hilo no lo
   * cambia nunca. El servidor, en cambio, **sí** las cuenta como no leídas:
   * `countUnread` mira todos los mensajes del canal, sin mirar si viven en un
   * hilo. Resultado: llegaba una respuesta de hilo, subía el contador, nada
   * disparaba `marcarLeido` y la insignia se quedaba encendida para siempre.
   *
   * Este disparador toma el más reciente de los dos lados, así que abrir el
   * panel o recibir una respuesta lo mueve igual que un mensaje normal.
   */
  const ultimoDelHilo = hiloReplies.at(-1)?.id;
  const disparadorDeLectura = `${ultimoId ?? ''}|${ultimoDelHilo ?? ''}`;

  /**
   * Hasta dónde ha leído cada persona del canal, sin contarte a ti.
   *
   * ## No hay acuse por mensaje, y no hace falta
   *
   * El servidor ya guardaba `lastReadAt` por persona y canal, así que un
   * mensaje está visto por alguien si esa marca es **posterior** a su fecha.
   * Una tabla de acuses por mensaje serían tantas filas como mensajes por
   * personas para decir exactamente lo mismo.
   *
   * Se vuelven a pedir cuando llega un mensaje nuevo (`ultimoId`): es cuando
   * el «visto» de los demás puede haber cambiado, y evita preguntarlo en bucle.
   */
  const [acuses, setAcuses] = useState<{ userId: string; lastReadAt: string }[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `ultimoId` es el disparador, no un valor que se lea — al llegar un mensaje nuevo hay que volver a preguntar quién ha leído
  useEffect(() => {
    let vivo = true;
    createApiClient({ gatewayPath })
      .get<{ userId: string; lastReadAt: string }[]>(`${rutaCanal}/receipts`)
      .then((lista) => {
        if (vivo) setAcuses(lista);
      })
      /* Sin acuses no se pinta nada. No saber quién ha leído no es motivo para
         enseñar un error encima de la conversación. */
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [gatewayPath, rutaCanal, ultimoId]);

  /**
   * Quién ha leído **hasta cada mensaje**.
   *
   * ⚠️ **Antes esto guardaba «el último mensaje que leyó cada quien» y se
   * pintaba una fila de caritas debajo.** Salía también bajo tus propios
   * mensajes —donde lo que interesa no es quién más lo ha visto en una fila de
   * caras, sino si ya llegó— y ocupaba una línea por conversación. Ahora el
   * dato es el mismo pero la pregunta es otra: para un mensaje dado, quién lo
   * ha visto. De ahí salen los dos checks y la lista de «Visto por».
   */
  const lectoresPorMensaje = useMemo(() => {
    const mapa = new Map<string, string[]>();
    if (acuses.length === 0) return mapa;

    for (const mensaje of mensajes) {
      const escrito = new Date(mensaje.createdAt).getTime();
      const lectores = acuses
        .filter((acuse) => new Date(acuse.lastReadAt).getTime() >= escrito)
        .map((acuse) => acuse.userId);
      if (lectores.length > 0) mapa.set(mensaje.id, lectores);
    }
    return mapa;
  }, [acuses, mensajes]);

  /**
   * Los fijados con las mismas correcciones locales que el historial.
   *
   * Los borrados se **quitan** en vez de corregirse: una lápida no se ancla
   * —el servidor la desfija al borrar— así que en la barra no pinta nada.
   */
  const fijadosConCorrecciones = fijadosLista
    .filter((mensaje) => !borradosLocales.has(mensaje.id))
    .map((mensaje) => {
      const editado = editadosLocales.get(mensaje.id);
      return editado ? { ...mensaje, body: editado.body, editedAt: editado.editedAt } : mensaje;
    });

  /** Las respuestas del hilo con las mismas correcciones locales que el historial. */
  const hiloMensajes = hiloReplies.map((mensaje) => {
    const reacciones = conMisReacciones(mensaje);
    const fijado = fijadosLocales.get(mensaje.id);
    const editado = editadosLocales.get(mensaje.id);
    const borrado = borradosLocales.get(mensaje.id);
    return {
      ...mensaje,
      reactions: reacciones,
      ...(fijado ? { pinnedAt: fijado.pinnedAt, pinnedById: fijado.pinnedById } : {}),
      ...(editado ? { body: editado.body, editedAt: editado.editedAt } : {}),
      /* La lápida, la última y arrasando con el resto: ver la nota de `mensajes`. */
      ...(borrado
        ? {
            deletedAt: borrado,
            body: '',
            reactions: [],
            attachments: [],
            pinnedAt: null,
            pinnedById: null,
          }
        : {}),
    };
  });

  /**
   * Cómo se lee un autor.
   *
   * Delega en `personName`, que es quien sabe distinguir «esta cuenta ya no
   * existe» de «no se pudo preguntar». Antes decía lo primero en los dos casos.
   */
  const nombreDeAutor = useCallback(
    (userId: string) => personName(directorio, userId, currentUserId),
    [directorio, currentUserId],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: `disparadorDeLectura` es el disparador, no un valor que se lea — al llegar un mensaje con el chat abierto hay que volver a marcarlo leído o el contador reaparecería
  useEffect(() => {
    void acciones.marcarLeido();
  }, [acciones.marcarLeido, disparadorDeLectura]);

  /**
   * La conversación empieza abajo, en lo último.
   *
   * ⚠️ **Solo baja si ya estabas abajo.** Si estás leyendo algo de hace un rato
   * y entra un mensaje, arrastrarte al final te quita de donde estabas mirando —
   * que es la forma más rápida de hacer inservible un chat con movimiento.
   *
   * `useLayoutEffect` y no `useEffect`: el salto ocurre antes de que el navegador
   * pinte, así que no se ve la lista aparecer arriba y bajar de golpe.
   */
  const scrollerRef = useRef<HTMLDivElement>(null);
  const busquedaRef = useRef<HTMLDivElement>(null);
  const bloqueoDeSalto = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: ídem — `ultimoId` es el disparador
  useLayoutEffect(() => {
    if (bloqueoDeSalto.current) {
      bloqueoDeSalto.current = false;
      return;
    }
    if (!alFinal) return;
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [ultimoId]);

  // Si cambiamos de canal, forzamos que el estado del scroll sea "al final"
  // para que el efecto de ultimoId nos lleve abajo automáticamente.
  useLayoutEffect(() => {
    setAlFinal(true);
    // Y damos un salto inmediato por si acaso ya estaban cargados
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [rutaCanal]);

  function alDesplazar() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    /* 80 px de margen: pegarse al píxel exacto haría que el botón parpadeara con
       el rebote del desplazamiento suave. */
    const distancia = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    setAlFinal(distancia < 80);
  }

  function irAlFinal() {
    const scroller = scrollerRef.current;
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
  }

  /**
   * El error se retira solo a los ocho segundos.
   *
   * ⚠️ **No lo hacía, y se quedaba clavado indefinidamente.** Solo desaparecía
   * si la siguiente acción llamaba a `setError(null)`, y varias no lo hacen
   * —fijar, reaccionar, borrar—: un «Solo se pueden fijar 5 mensajes» se
   * quedaba bajo el compositor el resto de la sesión, afirmando algo que ya no
   * era cierto.
   *
   * Ocho segundos: lo bastante para leer una frase larga sin prisa, y lo
   * bastante poco para que no acompañe a la siguiente cosa que hagas. El aspa
   * de al lado permite quitarlo antes.
   */
  useEffect(() => {
    if (!error) return;
    const temporizador = window.setTimeout(() => setError(null), 8000);
    return () => window.clearTimeout(temporizador);
  }, [error]);

  /* ─── Tiempo real ───────────────────────────────────────────────────────
   *
   * Todo lo que sigue sustituye a un `router.refresh()` por evento. Cada
   * manejador aplica **solo** lo que cambia, así que un mensaje nuevo no vuelve
   * a renderizar la página en el servidor ni pisa lo que estuvieras escribiendo.
   * Ver `commons/realtime/` y la nota de `nuevos`, arriba.
   *
   * ⚠️ **Todos comprueban `channelId` primero.** La conexión es una por pestaña
   * y por ella pasan los eventos de **todas** tus conversaciones: sin ese filtro,
   * un mensaje de otro chat se insertaría en el que tienes abierto.
   */

  /** Un mensaje: al historial, o al panel del hilo si nació dentro de uno. */
  useLiveEvent('chat.mensaje', (evento) => {
    if (evento.channelId !== page.channelId) return;

    const mensaje = evento.mensaje;

    /**
     * Una respuesta de hilo va **al hilo**, no a la conversación.
     *
     * ⚠️ Esto es la mitad del arreglo de «con el hilo abierto, los mensajes
     * nuevos no salían hasta refrescar a mano»: las respuestas solo se cargaban
     * al abrirlo y nada volvía a pedirlas.
     *
     * Se inserta solo si el hilo abierto es **el suyo**: una respuesta a otro
     * mensaje no pinta nada en este panel. Y aunque no haya hilo abierto, el
     * mensaje raíz tiene que enterarse para subir su contador de «N respuestas»,
     * que es lo de abajo.
     */
    if (mensaje.visibleEnChat === false) {
      const raizId = mensaje.replyTo?.id;
      if (!raizId) return;

      /* Solo si el hilo abierto es **el suyo**: una respuesta a otro mensaje no
         pinta nada en este panel. */
      if (raizId === hiloRaiz?.id) {
        setHiloReplies((actuales) =>
          actuales.some((candidato) => candidato.id === mensaje.id)
            ? actuales
            : [...actuales, mensaje],
        );
      }

      /**
       * Y el contador «N respuestas» del raíz sube aunque el hilo esté cerrado:
       * es la única señal de que ahí abajo hay conversación nueva.
       *
       * ⚠️ **Se cuenta aquí y en ningún otro sitio, incluidas las tuyas.** El
       * evento llega también cuando la respuesta es tuya —el servidor manda el
       * eco al autor— así que sumar además al enviar contaría dos veces cada
       * respuesta propia. Un contador necesita una sola fuente; la inserción del
       * mensaje puede tener dos porque deduplica por id, pero sumar no
       * deduplica.
       */
      setRespuestasExtra((previas) => new Map(previas).set(raizId, (previas.get(raizId) ?? 0) + 1));
      return;
    }

    setNuevos((actuales) =>
      actuales.some((candidato) => candidato.id === mensaje.id) ? actuales : [...actuales, mensaje],
    );
  });

  /** Una edición: se aplica encima, como si la hubieras hecho tú. */
  useLiveEvent('chat.editado', (evento) => {
    if (evento.channelId !== page.channelId) return;
    setEditadosLocales((previos) =>
      new Map(previos).set(evento.messageId, { body: evento.body, editedAt: evento.editedAt }),
    );
  });

  /** Un borrado: lápida en su sitio, y fuera de la barra de fijados. */
  useLiveEvent('chat.borrado', (evento) => {
    if (evento.channelId !== page.channelId) return;
    setBorradosLocales((previos) => new Map(previos).set(evento.messageId, evento.at));
    setFijadosLista((previos) => previos.filter((mensaje) => mensaje.id !== evento.messageId));
  });

  /**
   * Una reacción ajena.
   *
   * ⚠️ **Solo las ajenas.** Las tuyas ya las tienes aplicadas de forma optimista
   * en `reaccionesLocales`, y volver a aplicarlas desde el evento no cambiaría
   * nada —el delta es idempotente— pero sí pisaría una que hubieras puesto y
   * quitado muy rápido, dejándola al revés. Las de los demás van a su propio
   * mapa, que se aplica encima de lo que trajo el servidor.
   */
  useLiveEvent('chat.reaccion', (evento) => {
    if (evento.channelId !== page.channelId || evento.mio) return;
    setReaccionesAjenas((previas) => {
      const copia = new Map(previas);
      const delMensaje = new Map(copia.get(evento.messageId) ?? []);
      delMensaje.set(`${evento.actorId}|${evento.emoji}`, evento.on);
      return copia.set(evento.messageId, delMensaje);
    });
  });

  /** Un fijado o desfijado de otra persona: se refresca la barra. */
  useLiveEvent('chat.fijado', (evento) => {
    if (evento.channelId !== page.channelId || evento.mio) return;
    setFijadosLocales((previos) =>
      new Map(previos).set(evento.messageId, {
        pinnedAt: evento.pinned ? evento.at : null,
        pinnedById: evento.pinnedById,
      }),
    );
    /* La barra sí se vuelve a pedir: no basta con la marca del mensaje, porque
       un fijado puede ser de un mensaje que este navegador **no tiene cargado**
       —el historial pagina hacia atrás—. Es una petición pequeña y ocurre solo
       cuando alguien fija algo, que no es un gesto frecuente. */
    void cargarFijados();
  });

  /** Alguien ha leído: mueve los checks de «visto» sin volver a pedir los acuses. */
  useLiveEvent('chat.leido', (evento) => {
    if (evento.channelId !== page.channelId || evento.mio) return;
    setAcuses((previos) => {
      const sinEl = previos.filter((acuse) => acuse.userId !== evento.actorId);
      return [...sinEl, { userId: evento.actorId, lastReadAt: evento.hasta }];
    });
  });

  /**
   * Al volver de un corte, se pide **solo el hueco**.
   *
   * `EventSource` reconecta solo pero no reenvía lo publicado mientras estuvo
   * caído. Antes esto era un `router.refresh()`: volver a renderizar la página
   * entera en el servidor por un hipo de red. Ahora es un `?after=<último>`, que
   * trae exactamente lo que falta y nada más.
   *
   * Si no hay ni un mensaje todavía no hay cursor desde el que pedir, y tampoco
   * hay nada que reconstruir: el siguiente mensaje llegará por el flujo.
   */
  useReconnection(() => {
    if (!ultimoId) return;

    createApiClient({ gatewayPath })
      .get<ChatMessagePage>(`${rutaCanal}/messages?limit=${PAGINA}&after=${ultimoId}`)
      .then((pagina) => {
        /**
         * 🔴 **Si el hueco no cabía, no se pega nada: se recarga.**
         *
         * El servidor recorta a `PAGINA` mensajes. Antes eso pasaba en silencio
         * y aquí se pegaba el trozo recibido al final de lo que ya había, con lo
         * de en medio perdido para siempre: la conversación se quedaba con un
         * agujero mudo, sin error y sin nada que lo delatara. Solo se nota tras
         * un corte largo —un portátil cerrado media hora en un chat activo—, que
         * es justo cuando nadie sospecha de la aplicación.
         *
         * `router.refresh()` vuelve a pedir la página en el servidor, que es lo
         * único correcto cuando no se sabe qué falta. Va por `useRefrescoAgrupado`
         * porque el refresco entra en la cola de transiciones del App Router y
         * dispararlo suelto es lo que destapa el fallo de los botones girando
         * (ESTADO-ACTUAL §35).
         */
        if (pagina.hasMoreAfter) {
          refrescar();
          return;
        }

        if (pagina.items.length === 0) return;
        /* Entran todos, de hilo y de conversación: `historial` filtra los de
           hilo y el panel lateral recoge los suyos al volver a abrirse. */
        setNuevos((actuales) => [...actuales, ...pagina.items]);
      })
      .catch(() => {
        /* Un hueco que no se pudo rellenar no merece un error en pantalla: el
           siguiente mensaje que llegue lo pondrá al día, y recargar siempre
           funciona. */
      });
  });

  async function cargarHistorial() {
    const primero = mensajes[0];
    if (!primero || cargandoHistorial) return;

    setCargandoHistorial(true);
    setError(null);
    /* Al traer historial no se baja: quien lo pidió está mirando arriba y
       llevarle al final desharía justo lo que acaba de pedir. */
    bloqueoDeSalto.current = true;

    try {
      const api = createApiClient({ gatewayPath });
      const previos = await api.get<ChatMessagePage>(
        `${rutaCanal}/messages?limit=${PAGINA}&before=${primero.id}`,
      );
      setOlder((actuales) => [...previos.items, ...actuales]);
      setHasMore(previos.hasMore);
    } catch {
      setError('No se pudo cargar el historial.');
    } finally {
      setCargandoHistorial(false);
    }
  }

  const pedirSugerencias = useCallback(async () => {
    try {
      const api = createApiClient({ gatewayPath });
      const catalogo = await api.get<{
        people: string[];
        refs: { kind: string; id: string; label: string; contexto: string; estado?: string }[];
      }>(`${rutaCanal}/mentionables`);

      const personas: Sugerencia[] = catalogo.people
        .filter((id) => id !== currentUserId)
        .map((id) => {
          const perfil = directorio.perfiles.get(id);
          return {
            kind: 'user' as const,
            id,
            label: perfil ? personLabel(perfil) : id.slice(0, 8),
            contexto: perfil?.credential.email ?? '',
          };
        });

      /* En el chat de un proyecto, PRAX es la primera persona a la que se puede
         mencionar (D15): responde aquí mismo, con los permisos y la cuota de
         quien lo llama. En los privados no: sois dos. */
      const prax: Sugerencia[] = rutaCanal.includes('/projects')
        ? [
            {
              kind: 'assistant',
              id: PRAX_REF_ID,
              label: 'PRAX',
              contexto: 'El asistente: contesta aquí a quien lo llama',
            },
          ]
        : [];
      setSugerencias([...prax, ...personas, ...(catalogo.refs as Sugerencia[])]);
    } catch {
      /* Sin catálogo el desplegable simplemente no ofrece nada. No se avisa: no
         se puede escribir una etiqueta a mano, así que no hay nada que hacer al
         respecto y un error aquí solo estorbaría. */
    }
  }, [gatewayPath, rutaCanal, directorio, currentUserId]);

  /**
   * La lista de fijados, entera y sin paginar — el propio backend la deja así
   * (ver el comentario de `dto.pinned` en `ChatService.findAll`).
   */
  const cargarFijados = useCallback(async () => {
    try {
      const api = createApiClient({ gatewayPath });
      const pagina = await api.get<ChatMessagePage>(`${rutaCanal}/messages?pinned=true`);
      setFijadosLista(pagina.items);
      setFijadosIndice(0);
    } catch {
      /* Sin lista, la barra simplemente no aparece: no es una acción que haya
         pedido nadie, así que un fallo aquí no merece un `error` visible. */
    }
  }, [gatewayPath, rutaCanal]);

  useEffect(() => {
    void cargarFijados();
  }, [cargarFijados]);

  /**
   * Enviar, y **pintar el mensaje con lo que devuelve el servidor**.
   *
   * ## El fallo que cierra
   *
   * Esto solo miraba `resultado.error`. Lo que metía el mensaje en la pantalla
   * era el `revalidatePath` de la Server Action, es decir, volver a renderizar
   * la página en el servidor — y eso entra en la misma cola de transición del
   * App Router que el `router.refresh()` que disparaba cada evento del flujo.
   * Con una conversación viva esa cola estaba ocupada casi siempre, y cuando tu
   * revalidación perdía la carrera **Next la descartaba**: el mensaje quedaba
   * guardado, le llegaba al otro extremo y en tu pantalla no aparecía. Ese era
   * el «a veces sí y a veces no».
   *
   * Ahora se usa el mensaje que devuelve la acción y se inserta aquí mismo. No
   * hay revalidación, no hay cola y no hay carrera que perder.
   *
   * ⚠️ **No es optimismo: es el mensaje real del servidor**, con su id, su hora y
   * sus adjuntos ya reclamados. No hace falta reconciliar nada después, y si el
   * envío falla no hay nada que deshacer porque no se pintó nada. El eco que
   * llega luego por el flujo trae el mismo id y `historial` lo deduplica.
   */
  async function enviar(cuerpo: string, attachmentIds: string[]) {
    setEnviando(true);
    setError(null);
    /* `enHilo: false` siempre desde aquí: es el compositor principal, y su
       resultado tiene que fluir en la conversación general aunque lleve una
       cita puesta. */
    const resultado = await acciones.enviar(cuerpo, respondiendo?.id ?? null, attachmentIds, false);
    if (resultado.error) setError(resultado.error);
    else {
      if (resultado.mensaje)
        setNuevos((actuales) => [...actuales, resultado.mensaje as ChatMessage]);
      setRespondiendo(null);
      setAdjuntosPendientes((previos) => ({ ...previos, chat: [] }));
    }
    setEnviando(false);
  }

  /**
   * Sube un archivo como borrador.
   *
   * ⚠️ **El `try` no es de adorno, y su ausencia era un fallo mudo.** Una
   * Server Action que **lanza** —y lanza, por ejemplo, cuando el archivo pasa
   * del tope de cuerpo de Next— reventaba este `await`: ni se pintaba el
   * error, ni se quitaba el «subiendo», así que el clip se quedaba girando
   * para siempre y lo único que decía algo era la consola del navegador. El
   * `finally` garantiza que la ruleta pare pase lo que pase.
   */
  /**
   * Sube un archivo como borrador, **al compositor que lo pidió**.
   *
   * ⚠️ `destino` no es un adorno: el panel monta dos redactores y sin él el chip
   * y la ruleta salían en los dos a la vez. Ver la nota de `adjuntosPendientes`.
   *
   * ⚠️ **El `try` tampoco es de adorno, y su ausencia era un fallo mudo.** Una
   * Server Action que **lanza** —y lanza, por ejemplo, cuando el archivo pasa
   * del tope de cuerpo de Next— reventaba este `await`: ni se pintaba el
   * error, ni se quitaba el «subiendo», así que el clip se quedaba girando
   * para siempre y lo único que decía algo era la consola del navegador. El
   * `finally` garantiza que la ruleta pare pase lo que pase.
   */
  async function adjuntar(destino: 'chat' | 'hilo', file: File) {
    setSubiendo((previo) => ({ ...previo, [destino]: true }));
    setError(null);
    try {
      const resultado = await acciones.adjuntar(file);
      if (resultado.error) setError(resultado.error);
      else if (resultado.attachment) {
        const adjunto = resultado.attachment;
        setAdjuntosPendientes((previos) => ({
          ...previos,
          [destino]: [...previos[destino], adjunto],
        }));
      }
    } catch {
      setError('No se pudo subir el archivo. Si es muy grande, prueba con uno más ligero.');
    } finally {
      setSubiendo((previo) => ({ ...previo, [destino]: false }));
    }
  }

  async function quitarAdjunto(destino: 'chat' | 'hilo', attachmentId: string) {
    setError(null);
    try {
      const resultado = await acciones.quitarAdjunto(attachmentId);
      if (resultado.error) setError(resultado.error);
      else {
        setAdjuntosPendientes((previos) => ({
          ...previos,
          [destino]: previos[destino].filter((a) => a.id !== attachmentId),
        }));
      }
    } catch {
      setError('No se pudo quitar el archivo.');
    }
  }

  /**
   * Reaccionar, **con la respuesta pintada al instante**.
   *
   * ## El fallo que arregla
   *
   * Esto releía el canal con `?limit=1` y buscaba el mensaje en el resultado.
   * `limit=1` devuelve **el último mensaje de la conversación**, así que la
   * búsqueda solo acertaba si habías reaccionado justo al más reciente: en
   * cualquier otro no encontraba nada, no actualizaba nada y la reacción no
   * aparecía hasta recargar la página.
   *
   * ## Y por qué ahora no se pide nada
   *
   * La reacción es información completa en el cliente: sabemos el emoji, quién
   * la pone y si se añade o se quita. Calcularla aquí la enseña **en el mismo
   * fotograma del clic**, que es lo que hace que un chat se sienta vivo; ir al
   * servidor a preguntar qué pasó añadía una espera para saber algo que ya
   * sabíamos.
   *
   * Si el servidor rechaza, se deshace: es la única forma honesta de ser
   * optimista — enseñar el resultado antes de tenerlo obliga a saber volver.
   */
  /**
   * Pone o quita **tu** reacción, pintada en el mismo fotograma.
   *
   * Solo se anota el delta de este emoji: lo que hayan puesto los demás sigue
   * saliendo del servidor y no se toca. Ver el aviso de `reaccionesLocales`.
   */
  async function reaccionar(messageId: string, emoji: string, on: boolean) {
    const anterior = reaccionesLocales.get(messageId)?.get(emoji);

    setReaccionesLocales((previas) => {
      const copia = new Map(previas);
      const delMensaje = new Map(copia.get(messageId) ?? []);
      delMensaje.set(emoji, on);
      return copia.set(messageId, delMensaje);
    });

    try {
      await acciones.reaccionar(messageId, emoji, on);
    } catch {
      /* Vuelta atrás: dejar la reacción puesta cuando el servidor la rechazó
         sería mentir sobre lo que ven los demás. */
      setReaccionesLocales((previas) => {
        const copia = new Map(previas);
        const delMensaje = new Map(copia.get(messageId) ?? []);
        if (anterior === undefined) delMensaje.delete(emoji);
        else delMensaje.set(emoji, anterior);
        return copia.set(messageId, delMensaje);
      });
      setError('No se pudo guardar la reacción.');
    }
  }

  /**
   * Borrar, con la lápida pintada al instante.
   *
   * Si el servidor rechaza, se deshace: dejar la lápida puesta cuando el borrado
   * falló sería mentir sobre lo que ven los demás — que es la misma regla que
   * siguen reaccionar y fijar.
   */
  async function borrar(messageId: string) {
    setBorradosLocales((previos) => new Map(previos).set(messageId, new Date().toISOString()));

    /* Un mensaje borrado se desfija en el servidor, así que también sale aquí
       de la barra: si no, la barra seguiría anclando una lápida hasta la
       siguiente revalidación. */
    setFijadosLista((previos) => previos.filter((mensaje) => mensaje.id !== messageId));

    const resultado = await acciones.borrar(messageId);
    if (resultado.error) {
      setBorradosLocales((previos) => {
        const copia = new Map(previos);
        copia.delete(messageId);
        return copia;
      });
      setError(resultado.error);
      void cargarFijados();
    }
  }

  /**
   * Fijar o desfijar, **con el resultado pintado al instante**.
   *
   * Igual que reaccionar: se calcula el estado nuevo aquí —sabemos el id y el
   * interruptor— y se pinta en el mismo fotograma; si el servidor rechaza, se
   * deshace. Fijar no revalida, y con varias personas fijando seguido el
   * repintado por mensaje parpadearía la conversación entera.
   */
  async function fijar(messageId: string, on: boolean) {
    /* ⚠️ De `mensajes` primero, y se recuerda si estaba ahí: es la conversación
       general, así que ahí es donde vive la barra de fijados. Un mensaje que
       solo está en `hiloMensajes` es de un hilo — se fija en su sitio, pero
       no tiene sentido en la barra de la conversación general porque no vive
       ahí. */
    const enConversacionGeneral = mensajes.some((mensaje) => mensaje.id === messageId);
    const actual =
      mensajes.find((mensaje) => mensaje.id === messageId) ??
      hiloMensajes.find((mensaje) => mensaje.id === messageId);
    const previo = {
      pinnedAt: fijadosLocales.get(messageId)?.pinnedAt ?? actual?.pinnedAt ?? null,
      pinnedById: fijadosLocales.get(messageId)?.pinnedById ?? actual?.pinnedById ?? null,
    };

    setFijadosLocales((previos) =>
      new Map(previos).set(messageId, {
        pinnedAt: on ? new Date().toISOString() : null,
        pinnedById: on ? currentUserId : null,
      }),
    );

    try {
      const resultado = await acciones.fijar(messageId, on);
      if (resultado.error) throw new Error(resultado.error);
      /* Se usa lo que devuelve el servidor, no lo que se pidió: es la única
         fuente honesta de quién fijó y cuándo. */
      setFijadosLocales((previos) =>
        new Map(previos).set(messageId, {
          pinnedAt: resultado.pinned ? new Date().toISOString() : null,
          pinnedById: resultado.pinnedById,
        }),
      );

      /**
       * La barra se corrige con el mismo resultado, sin esperar a revalidar.
       *
       * ⚠️ **Un mensaje solo del hilo no entra en la barra**, igual que en el
       * servidor (`findAll` filtra `visibleEnChat: true` para `pinned=true`):
       * fijarlo lo ancla dentro de su hilo, no en la conversación general.
       * Una respuesta citada desde el compositor principal sí entra — vive en
       * la conversación general igual que cualquier otro mensaje.
       */
      if (actual && enConversacionGeneral) {
        setFijadosLista((previos) => {
          const sinEste = previos.filter((mensaje) => mensaje.id !== messageId);
          if (!resultado.pinned) return sinEste;
          return [
            {
              ...actual,
              pinnedAt: new Date().toISOString(),
              pinnedById: resultado.pinnedById,
            },
            ...sinEste,
          ];
        });
      }
    } catch (fallo) {
      setFijadosLocales((previos) => new Map(previos).set(messageId, previo));
      /**
       * ⚠️ **El mensaje del servidor, no uno genérico.**
       *
       * Esto decía siempre «No se pudo guardar el fijado», y con el tope de
       * cinco fijados por conversación esa frase es inservible: quien lo intenta
       * no tiene forma de saber que hay un límite ni que la solución es desfijar
       * otro. El servidor ya devuelve exactamente eso —«Solo se pueden fijar 5
       * mensajes por conversación. Desfija alguno antes.»— y lo único que había
       * que hacer era dejarlo pasar.
       *
       * El respaldo se queda para lo que no trae mensaje: un corte de red.
       */
      const motivo = fallo instanceof Error ? fallo.message.trim() : '';
      setError(motivo || 'No se pudo guardar el fijado.');
    }
  }

  /**
   * Editar, **con el resultado pintado al instante**.
   *
   * Igual que reaccionar y fijar: no se revalida y se usa lo que devuelve el
   * servidor —que es quien sabe si el mensaje era tuyo—. Si rechaza, no hay
   * nada que deshacer porque todavía no se ha pintado nada.
   */
  async function editar(messageId: string, body: string) {
    const resultado = await acciones.editar(messageId, body);
    if (resultado.error) {
      setError(resultado.error);
      return false;
    }
    if (!resultado.message) {
      setError('El servidor no devolvió el mensaje editado.');
      return false;
    }
    const editado = resultado.message;
    setEditadosLocales((previos) =>
      new Map(previos).set(messageId, {
        body: editado.body,
        editedAt: editado.editedAt ?? new Date().toISOString(),
      }),
    );
    return true;
  }

  /**
   * Lo que hace el botón «Guardar» del compositor cuando está editando.
   *
   * El compositor entrega el cuerpo ya serializado —con los ids de las
   * menciones puestos—, así que aquí solo se guarda y se sale del modo.
   */
  async function guardarEdicion(cuerpo: string) {
    if (!editando) return;
    const guardado = await editar(editando.id, cuerpo);
    if (guardado) setEditando(null);
  }

  /**
   * Pedir editar un mensaje.
   *
   * Cancela la respuesta en curso: el compositor es uno, y no puede estar
   * citando a alguien y editando otra cosa a la vez.
   */
  function pedirEdicion(mensaje: ChatMessage) {
    setRespondiendo(null);
    setEditando(mensaje);
  }

  /**
   * Abrir el hilo de un mensaje: guardar el raíz y pedir sus respuestas.
   *
   * Las respuestas van a la ruta `…/messages/<id>/thread`, que devuelve el raíz
   * y sus respuestas de primer nivel en orden. El panel lateral las reúne bajo
   * el mensaje que las provocó.
   */
  async function abrirHilo(message: ChatMessage) {
    setHiloRaiz(message);
    setHiloReplies([]);
    setHiloCargando(true);
    setHiloError(null);
    try {
      const api = createApiClient({ gatewayPath });
      const hilo = await api.get<{ root: ChatMessage; replies: ChatMessage[] }>(
        `${rutaCanal}/messages/${message.id}/thread`,
      );
      setHiloReplies(hilo.replies);
    } catch {
      setHiloError('No se pudo cargar el hilo.');
    } finally {
      setHiloCargando(false);
    }
  }

  function cerrarHilo() {
    setHiloRaiz(null);
    setHiloReplies([]);
    setHiloError(null);
  }

  /**
   * Enviar una respuesta del hilo.
   *
   * Va al servidor con `replyToId` = el mensaje raíz; al volver, la respuesta
   * se añade al panel lateral al instante (además de fluir por el historial al
   * siguiente refresco).
   */
  /**
   * Enviar una respuesta del hilo.
   *
   * ⚠️ **Ya no recarga el hilo entero.** Terminaba con `await abrirHilo(hiloRaiz)`,
   * o sea: por cada respuesta, otra petición que traía el raíz y **todas** sus
   * respuestas otra vez, y que además reiniciaba el estado de carga —el panel
   * parpadeaba con su propio mensaje—. Se inserta lo que devuelve el servidor,
   * igual que en la conversación general.
   */
  async function enviarEnHilo(cuerpo: string, attachmentIds: string[]) {
    if (!hiloRaiz) return;
    setEnviando(true);
    setError(null);
    /* `enHilo: true`: nace en el panel del hilo, así que se guarda fuera de
       la conversación general — aparece aquí y solo aquí. */
    const resultado = await acciones.enviar(cuerpo, hiloRaiz.id, attachmentIds, true);
    if (resultado.error) setError(resultado.error);
    else {
      if (resultado.mensaje) {
        const respuesta = resultado.mensaje;
        setHiloReplies((actuales) =>
          actuales.some((candidato) => candidato.id === respuesta.id)
            ? actuales
            : [...actuales, respuesta],
        );
        /* La marca «N respuestas» **no** se toca aquí: la sube el manejador de
           `chat.mensaje`, que recibe también el eco de lo tuyo. Sumarla en los
           dos sitios contaría cada respuesta propia dos veces. */
      }
      setAdjuntosPendientes((previos) => ({ ...previos, hilo: [] }));
    }
    setEnviando(false);
  }

  /**
   * Borrar una respuesta del hilo, o cerrarlo si el borrado es el raíz.
   *
   * El servidor no devuelve el mensaje, así que la respuesta se quita de la
   * lista local — si se borrara el raíz, no queda hilo que mostrar.
   */
  /**
   * Borrar dentro del hilo.
   *
   * ⚠️ **La respuesta ya no se quita de la lista: se convierte en lápida**, igual
   * que en la conversación general. Quitarla dejaba el mismo hueco mudo que
   * arreglamos arriba, y en un hilo se nota más porque son cuatro mensajes
   * contados.
   *
   * El raíz sigue cerrando el panel: sin él no queda hilo del que hablar, y una
   * lápida como cabecera de un subchat no dice nada útil.
   */
  async function borrarEnHilo(messageId: string) {
    setBorradosLocales((previos) => new Map(previos).set(messageId, new Date().toISOString()));

    const resultado = await acciones.borrar(messageId);
    if (resultado.error) {
      setBorradosLocales((previos) => {
        const copia = new Map(previos);
        copia.delete(messageId);
        return copia;
      });
      setError(resultado.error);
      return;
    }

    if (messageId === hiloRaiz?.id) cerrarHilo();
  }

  /**
   * Buscar, y colgar el resultado del término exacto que se pidió.
   *
   * Se guarda el término junto con los resultados para que una búsqueda
   * anterior no pinte sus hallazgos sobre el texto nuevo que se está tecleando:
   * entre el último Enter y la respuesta, el campo puede contener otra cosa.
   */
  const [terminoBuscado, setTerminoBuscado] = useState('');

  async function buscar() {
    const t = termino.trim();
    if (!t) return;
    setBuscando(true);
    setErrorBusqueda(null);
    try {
      const api = createApiClient({ gatewayPath });
      const pagina = await api.get<ChatMessagePage>(
        `${rutaCanal}/messages?q=${encodeURIComponent(t)}`,
      );
      setResultados(pagina.items);
      setTerminoBuscado(t);
    } catch {
      setResultados(null);
      setErrorBusqueda('No se pudo buscar.');
    } finally {
      setBuscando(false);
    }
  }

  function abrirBusqueda() {
    setBusquedaAbierta(true);
    setTermino('');
    setResultados(null);
    setErrorBusqueda(null);
    setTerminoBuscado('');
  }

  useEffect(() => {
    function alClicFuera(e: MouseEvent) {
      if (
        busquedaAbierta &&
        busquedaRef.current &&
        !busquedaRef.current.contains(e.target as Node)
      ) {
        cerrarBusqueda();
      }
    }
    document.addEventListener('mousedown', alClicFuera);
    return () => document.removeEventListener('mousedown', alClicFuera);
  }, [busquedaAbierta]);

  function cerrarBusqueda() {
    setBusquedaAbierta(false);
    setTermino('');
    setResultados(null);
    setErrorBusqueda(null);
    setTerminoBuscado('');
  }

  async function buscarLocal(t: string) {
    if (!t.trim()) {
      setResultados(null);
      setTerminoBuscado('');
      return;
    }
    setBuscando(true);
    setErrorBusqueda(null);
    try {
      const api = createApiClient({ gatewayPath });
      const pagina = await api.get<ChatMessagePage>(
        `${rutaCanal}/messages?q=${encodeURIComponent(t.trim())}`,
      );
      setResultados(pagina.items);
      setTerminoBuscado(t.trim());
      setBusquedaAbierta(true); // Flag to show we are searching
    } catch {
      setResultados(null);
      setErrorBusqueda('No se pudo buscar.');
    } finally {
      setBuscando(false);
    }
  }

  useImperativeHandle(ref, () => ({ abrirBusqueda, buscarLocal, cerrarBusqueda }));

  /**
   * Saltar a un mensaje y enseñarlo en su sitio del historial.
   *
   * ## Por qué puede haber que cargar historial
   *
   * La búsqueda viaja a la base, que recuerda mensajes que esta página nunca
   * llegó a cargar. Si el resultado es de antes del primer mensaje visible, hay
   * que pedir las páginas anteriores —la misma ruta con `before` que usa el
   * botón «ver mensajes anteriores»— hasta alcanzarlo, y solo entonces se puede
   * hacer scroll a su sitio.
   *
   * Si el historial se agota sin encontrarlo —un mensaje borrado mientras la
   * búsqueda estaba abierta, digamos— se avisa y se vuelve al final del chat.
   */
  async function saltarAlMensaje(messageId: string) {
    setBusquedaAbierta(false);
    setResultados(null);

    /* Ya estaba en pantalla: solo hace falta llevarlo al centro. */
    const scroller = scrollerRef.current;
    const yaCargado = document.querySelector<HTMLElement>(`[data-msg-id="${messageId}"]`);
    if (yaCargado && scroller) {
      scroller.scrollTo({
        top: yaCargado.offsetTop - scroller.clientHeight / 3,
        behavior: 'smooth',
      });
      return;
    }

    /* No está cargado: se sube el historial hasta llegar a él. Se marca el
       bloqueo para que el salto automático de `ultimoId` no nos arrastre de
       vuelta abajo. */
    bloqueoDeSalto.current = true;
    try {
      const api = createApiClient({ gatewayPath });
      let antes = mensajes[0]?.id;
      /* Tope de seguridad: subir de 100 en 100 hasta encontrar el mensaje o
         agotar el historial. 30 tirones son 3000 mensajes, bastante más de lo
         que esta pantalla va a encontrar jamás. */
      for (let i = 0; i < 30; i++) {
        const previos = await api.get<ChatMessagePage>(
          `${rutaCanal}/messages?limit=100&before=${antes}`,
        );
        if (previos.items.some((m) => m.id === messageId)) {
          setOlder((actuales) => [...previos.items, ...actuales]);
          setHasMore(previos.hasMore);
          /* Se espera un turno para que React pinte las páginas nuevas y el
             elemento exista en el DOM antes de intentar hacerle scroll. */
          requestAnimationFrame(() => {
            const elemento = document.querySelector<HTMLElement>(`[data-msg-id="${messageId}"]`);
            if (elemento && scroller) {
              scroller.scrollTo({
                top: elemento.offsetTop - scroller.clientHeight / 3,
                behavior: 'smooth',
              });
            }
          });
          return;
        }
        if (!previos.hasMore || previos.items.length === 0) break;
        const masAntiguo = previos.items[0];
        if (!masAntiguo) break;
        antes = masAntiguo.id;
      }
      setError('No se encontró el mensaje en el historial.');
      irAlFinal();
    } catch {
      setError('No se pudo cargar el historial hasta el mensaje.');
    }
  }

  /**
   * Saltar a un fijado desde la barra, y dejar el puntero en el siguiente.
   *
   * Así una pulsación tras otra recorre todos los fijados sin tener que abrir
   * la lista — es lo que hace que la barra compacta baste para el caso normal.
   */
  function irAFijado(messageId: string) {
    setFijadosExpandido(false);
    void saltarAlMensaje(messageId);
    if (fijadosLista.length > 1) {
      setFijadosIndice((previo) => (previo + 1) % fijadosLista.length);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (canWrite) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (!canWrite) return;
    const file = e.dataTransfer.files[0];
    if (file) {
      void adjuntar('chat', file);
    }
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative flex min-h-0 flex-1 flex-col w-full max-w-[100vw] overflow-x-hidden ${
        /* `max-md:` y no un `hidden md:flex` en el padre: así el mismo
           componente sirve en las dos y no hay dos árboles que mantener.
           `bg-background` es obligatorio — al salir del flujo, lo de debajo se
           vería a través. */
        pantallaCompletaEnMovil
          ? 'max-md:fixed max-md:inset-0 max-md:z-40 max-md:bg-background max-md:px-3 max-md:pb-3 max-md:w-full'
          : ''
      }`}
    >
      {salidaMovil && <div className="shrink-0 pt-2 md:hidden">{salidaMovil}</div>}
      {encabezado}

      <PinnedBar
        fijados={fijadosConCorrecciones}
        indice={fijadosIndice}
        expandido={fijadosExpandido}
        onExpandirCambiar={setFijadosExpandido}
        onIr={irAFijado}
        nombreDeAutor={nombreDeAutor}
      />

      {/**
       * El chat y el hilo, en una fila.
       *
       * Sin hilo abierto, `flex` con un único hijo equivale a `flex-col`: el
       * chat ocupa todo el ancho. Con hilo, el panel lateral se cuela a la
       * derecha desde `sm` y en móvil (max-sm) es fijo, a pantalla entera.
       */}
      <div className="flex min-h-0 min-w-0 flex-1 relative">
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl bg-primary/10 border-2 border-dashed border-primary backdrop-blur-[2px] pointer-events-none m-2">
            <div className="flex flex-col items-center gap-2 text-primary">
              <svg className="w-10 h-10 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <span className="font-sans text-sm font-semibold">
                Suelta el archivo para adjuntarlo
              </span>
            </div>
          </div>
        )}
        <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${hiloRaiz ? 'md:mr-4' : ''} `}>
          {/**
           * ⚠️ **El panel llena siempre el alto que le da su padre, y quien lo
           * monta tiene que darle uno acotado.**
           *
           * Hubo un modo con tope propio (`max-h-[58vh]`) para cuando el chat
           * compartía pantalla con las pestañas de un proyecto. Con dos modos,
           * el chat y el hilo se calculaban el alto por caminos distintos y
           * acababan **desiguales** —uno terminaba donde el otro seguía— además
           * de estirarse con cada mensaje nuevo. Desde que el chat de proyecto
           * vive en Mensajes, el único montaje es el de alto acotado, y con un
           * solo modo los dos paneles miden lo mismo por construcción.
           */}
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <div
              ref={scrollerRef}
              onScroll={alDesplazar}
              /* ⚠️ `overflow-x-hidden` explícito: `overflow-y-auto` a secas deja el
             eje horizontal en `auto`, así que **cualquier** cosa que se pase un
             píxel —una etiqueta larga, una palabra sin espacios— saca una barra
             horizontal en toda la conversación. Aquí nada debe desbordar a lo
             ancho: si algo no cabe, se parte. */
              className="scrollbar-chat flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-y-auto overflow-x-hidden px-1 pb-14 pt-3"
            >
              {hasMore && (
                <div className="mb-2 flex justify-center">
                  <button
                    type="button"
                    onClick={cargarHistorial}
                    disabled={cargandoHistorial}
                    className="cursor-pointer rounded-full border border-border px-3 py-1 font-sans text-xs text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {cargandoHistorial ? 'Cargando…' : 'Ver mensajes anteriores'}
                  </button>
                </div>
              )}

              {mensajes.length === 0 ? (
                <div className="m-auto flex max-w-xs flex-col items-center gap-2 text-center">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-full"
                    style={{ background: alpha(colors.primary, 12) }}
                    aria-hidden="true"
                  >
                    <svg
                      className="h-5 w-5"
                      style={{ color: colors.primary }}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.9 9.9 0 01-4.2-.9L3 21l1.4-4.2A7.9 7.9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                  </span>
                  <p className="font-sans text-sm text-text-secondary">{vacio}</p>
                </div>
              ) : (
                mensajes.map((mensaje, indice) => {
                  const anterior = mensajes[indice - 1];
                  const separador = etiquetaDeDia(mensaje.createdAt, anterior?.createdAt);
                  /* Un bloque es la misma persona, el mismo día y sin más de
                     `CORTE_DE_BLOQUE_MS` de silencio. La constante estaba
                     escrita y no la usaba nadie: se agrupaba sin mirar la hora.
                     Un aviso de regla nunca forma bloque —no es algo que esa
                     persona dijera— ni lo continúa. */
                  const continued =
                    !separador &&
                    anterior?.authorId === mensaje.authorId &&
                    anterior.origin !== 'AUTOMATION' &&
                    mensaje.origin !== 'AUTOMATION' &&
                    Date.parse(mensaje.createdAt) - Date.parse(anterior.createdAt) <
                      CORTE_DE_BLOQUE_MS;

                  return (
                    <div key={mensaje.id} data-msg-id={mensaje.id}>
                      {separador && (
                        <div className="my-3 flex items-center gap-4 text-text-disabled">
                          <CurvedLine />
                          <span className="font-sans text-[11px] uppercase tracking-wide font-medium text-text-secondary">
                            {separador}
                          </span>
                          <CurvedLine />
                        </div>
                      )}

                      {mensaje.origin === 'AUTOMATION' ? (
                        <AvisoDeRegla mensaje={mensaje} />
                      ) : (
                        <MessageBubble
                          message={mensaje}
                          author={directorio.perfiles.get(mensaje.authorId)}
                          /* La respuesta de PRAX va firmada por quien lo llamó,
                             pero no es suya: se pinta al otro lado. */
                          mine={
                            mensaje.authorId === currentUserId && !mensaje.originMeta?.respuesta
                          }
                          continued={continued && !mensaje.originMeta?.respuesta}
                          canDelete={mensaje.authorId === currentUserId}
                          canReact={canWrite}
                          canFijar={canWrite}
                          currentUserId={currentUserId}
                          hrefDePersona={hrefDePersona?.(mensaje.authorId) ?? null}
                          {...(hrefDeRef ? { hrefDeRef } : {})}
                          /* Mismo origen que la aplicación: el proxy de la zona pone
                       la cabecera de autorización y la cookie viaja sola. */
                          hrefDeAdjunto={(id) =>
                            `${gatewayPath}${rutaCanal}/attachments/${id}/content`
                          }
                          gatewayPath={gatewayPath}
                          scrollerRef={scrollerRef}
                          permiteMenciones={permiteMenciones}
                          sugerencias={sugerencias}
                          onPedirSugerencias={() => void pedirSugerencias()}
                          vistoPor={lectoresPorMensaje.get(mensaje.id) ?? []}
                          cuantosPuedenVer={participantes}
                          onResponder={(mensaje) => {
                            setEditando(null);
                            setRespondiendo(mensaje);
                          }}
                          onReaccionar={reaccionar}
                          onFijar={fijar}
                          onPedirEdicion={pedirEdicion}
                          editandose={editando?.id === mensaje.id}
                          onBorrar={borrar}
                          onAbrirHilo={(mensaje) => void abrirHilo(mensaje)}
                          hiloConNovedad={hiloTieneNovedad(mensaje.id, mensaje._count.replies)}
                          nombreDeAutor={nombreDeAutor}
                          isProjectChat={rutaCanal.includes('/projects')}
                          {...(acciones.previewDeLink
                            ? { previewDeLink: acciones.previewDeLink }
                            : {})}
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Solo cuando te has ido hacia arriba: pegado abajo no dice nada. */}
            {!alFinal && mensajes.length > 0 && (
              <button
                type="button"
                onClick={irAlFinal}
                aria-label="Ir al último mensaje"
                className="absolute bottom-3 right-4 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border transition-transform hover:scale-105"
                style={{
                  background: '#131312',
                  boxShadow: `0 8px 20px ${alpha(colors.overlay, 45)}`,
                }}
              >
                <svg
                  className="h-4 w-4 text-text-secondary"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7-7-7" />
                </svg>
              </button>
            )}

            {/**
             * Estado de búsqueda si no hay resultados.
             */}
            {busquedaAbierta &&
              (errorBusqueda || (resultados !== null && resultados.length === 0)) && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 bg-[#191919]/90 backdrop-blur-sm">
                  <p className="font-sans text-sm text-text-secondary">
                    {errorBusqueda ? errorBusqueda : `Nada que coincida con «${terminoBuscado}».`}
                  </p>
                  <button
                    type="button"
                    onClick={cerrarBusqueda}
                    className="mt-4 rounded-lg border border-border px-4 py-2 font-sans text-xs text-text-primary hover:bg-white/5"
                  >
                    Cerrar búsqueda
                  </button>
                </div>
              )}
          </div>

          {/**
           * ⚠️ **El envoltorio es idéntico al del hilo, y por eso están
           * alineados.** El del hilo llevaba `border-t` y `p-3` y este no
           * llevaba nada: el campo del subchat quedaba metido hacia dentro y
           * más abajo que el del chat, y las dos cajas terminaban a alturas
           * distintas. Si se toca el relleno de uno, hay que tocar el del otro
           * — o vuelven a desalinearse.
           */}
          {canWrite ? (
            <div className="relative shrink-0 p-3 pt-4 bg-[#131312] rounded-b-2xl">
              {/* Degradado suave flotante por encima del composer para fusionarse con el chat */}
              <div className="absolute left-0 right-0 top-0 h-16 -translate-y-full bg-gradient-to-t from-[#131312] to-transparent pointer-events-none z-10" />
              <Composer
                /**
                 * ⚠️ **La `key` es lo que rellena el campo al editar.**
                 * `valorInicial` solo se lee al montar, así que sin cambiar la
                 * clave el compositor no se entera de que ahora edita otro
                 * mensaje: seguiría con lo que hubiera escrito. Cambiándola, cada
                 * mensaje que se edita monta un campo limpio con su contenido, y
                 * al salir del modo vuelve el de escribir, vacío.
                 */
                key={editando ? `editar-${editando.id}` : 'nuevo'}
                onEnviar={editando ? (cuerpo) => void guardarEdicion(cuerpo) : enviar}
                enviando={enviando}
                placeholder={editando ? 'Edita tu mensaje…' : 'Escribe un mensaje…'}
                permiteMenciones={permiteMenciones}
                /* 🔴 **El menú `/`, solo en los chats de proyecto.** Es la misma
                   condición que ya usa la vista previa de adjuntos unas líneas
                   más abajo (`isProjectChat`), y por el mismo motivo: una
                   referencia necesita un proyecto que la explique. El servidor
                   ya devuelve la lista vacía en privado; esto evita además que
                   se abra un desplegable sin nada al escribir «y/o». */
                permiteReferencias={rutaCanal.includes('/projects')}
                sugerencias={sugerencias}
                onPedirSugerencias={pedirSugerencias}
                /* Editando no hay adjuntos que enseñar: lo que se cambia es el
                 texto. Los del mensaje siguen donde estaban. */
                adjuntosPendientes={editando ? [] : adjuntosPendientes.chat}
                onAdjuntar={(file) => adjuntar('chat', file)}
                onQuitarAdjunto={(id) => quitarAdjunto('chat', id)}
                subiendo={subiendo.chat}
                citaId={respondiendo?.id ?? null}
                {...(editando
                  ? {
                      valorInicial: fieldFromBody(editando.body),
                      onCancelar: () => setEditando(null),
                      etiquetaEnviar: 'Guardar',
                      ocultarAdjuntos: true,
                      autoFoco: true,
                    }
                  : {})}
                respuestaSlot={
                  /* Editando no se anuncia con una franja: el campo relleno, el
                     texto de ayuda y los botones «Guardar»/«Cancelar» ya lo dicen,
                     y una etiqueta más solo robaba alto al chat. */
                  editando
                    ? null
                    : respondiendo && (
                        <div
                          /* Sin barra lateral, igual que la cita dentro de la
                             burbuja: el tinte de fondo y el «Respondiendo a» en
                             color ya dicen lo que es. */
                          className="flex items-start gap-2 rounded-lg px-2.5 py-1.5"
                          style={{ background: alpha(colors.primary, 8) }}
                        >
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span
                              className="font-sans text-[11px] font-semibold"
                              style={{ color: colors.primary }}
                            >
                              Respondiendo a {nombreDeAutor(respondiendo.authorId)}
                            </span>
                            <span className="line-clamp-1 font-sans text-xs text-text-secondary">
                              <AttachmentPreview mensaje={respondiendo} />
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setRespondiendo(null)}
                            aria-label="Dejar de responder"
                            className="shrink-0 cursor-pointer rounded px-1 font-sans text-xs text-text-secondary hover:text-text-primary"
                          >
                            ✕
                          </button>
                        </div>
                      )
                }
              />
            </div>
          ) : (
            <p
              className="rounded-lg border border-border px-3 py-2.5 font-sans text-xs text-text-secondary"
              style={{ background: alpha(colors.overlay, 12) }}
            >
              {motivoSinEscribir ?? 'Puedes leer la conversación, pero no escribir en ella.'}
            </p>
          )}

          {/**
           * El error de la última acción, **con salida**.
           *
           * ⚠️ **Se quedaba puesto para siempre.** Nada lo borraba salvo la
           * siguiente acción que llamara a `setError(null)`, y hay varias que no
           * lo hacen: fijar, reaccionar, borrar. Así que un «Solo se pueden
           * fijar 5 mensajes» se quedaba clavado bajo el compositor el resto de
           * la sesión, contando algo que ya no era cierto y sin forma de
           * quitarlo.
           *
           * Ahora se va solo (ver el efecto de `error`) y además se puede cerrar
           * a mano: un mensaje que se desvanece sin que hayas terminado de
           * leerlo es tan malo como uno que no se va.
           */}
          {error && (
            <p
              role="alert"
              className="mt-2 flex items-start gap-2 font-sans text-xs"
              style={{ color: colors.error }}
            >
              <span className="min-w-0 flex-1">{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                aria-label="Descartar el error"
                className="shrink-0 cursor-pointer rounded px-1 leading-none opacity-70 hover:opacity-100"
              >
                ✕
              </button>
            </p>
          )}
        </div>

        {hiloRaiz && (
          <ThreadPanel
            raiz={{
              ...hiloRaiz,
              reactions: conMisReacciones(hiloRaiz),
              ...(fijadosLocales.has(hiloRaiz.id)
                ? { pinnedAt: fijadosLocales.get(hiloRaiz.id)!.pinnedAt }
                : {}),
              ...(editadosLocales.has(hiloRaiz.id)
                ? { body: editadosLocales.get(hiloRaiz.id)!.body }
                : {}),
            }}
            replies={hiloMensajes}
            cargando={hiloCargando}
            error={hiloError}
            onCerrar={cerrarHilo}
            directorio={directorio}
            currentUserId={currentUserId}
            canWrite={canWrite}
            permiteMenciones={permiteMenciones}
            motivoSinEscribir={motivoSinEscribir ?? null}
            gatewayPath={gatewayPath}
            rutaCanal={rutaCanal}
            onEnviar={enviarEnHilo}
            enviando={enviando}
            onReaccionar={reaccionar}
            onFijar={fijar}
            onEditar={editar}
            onBorrar={borrarEnHilo}
            adjuntosPendientes={adjuntosPendientes.hilo}
            onAdjuntar={(file) => adjuntar('hilo', file)}
            onQuitarAdjunto={(id) => quitarAdjunto('hilo', id)}
            subiendo={subiendo.hilo}
            sugerencias={sugerencias}
            onPedirSugerencias={() => void pedirSugerencias()}
            {...(hrefDePersona ? { hrefDePersona } : {})}
            nombreDeAutor={nombreDeAutor}
            isProjectChat={rutaCanal.includes('/projects')}
            {...(acciones.previewDeLink ? { previewDeLink: acciones.previewDeLink } : {})}
          />
        )}
      </div>
    </div>
  );
});

/**
 * «Hoy», «Ayer» o la fecha, **solo cuando cambia el día**.
 *
 * Devuelve `null` si el mensaje anterior es del mismo día, y ese `null` es
 * además lo que rompe la agrupación: dos mensajes seguidos de la misma persona a
 * uno y otro lado de la medianoche no son un bloque.
 */
function etiquetaDeDia(iso: string, anteriorIso: string | undefined): string | null {
  const fecha = new Date(iso);
  if (anteriorIso && mismoDia(fecha, new Date(anteriorIso))) return null;

  const hoy = new Date();
  if (mismoDia(fecha, hoy)) return 'Hoy';

  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (mismoDia(fecha, ayer)) return 'Ayer';

  return fecha.toLocaleDateString('es', {
    day: 'numeric',
    month: 'long',
    /* El año solo si no es este: en una conversación reciente sobra. */
    year: fecha.getFullYear() === hoy.getFullYear() ? undefined : 'numeric',
  });
}

function mismoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Lo que publicó una regla, como **divisor** y no como mensaje (D14 de
 * docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * En la base es de quien creó la regla —alguien tiene que firmarlo—, y
 * pintarlo como su burbuja decía que esa persona lo había escrito a mano: lo
 * que vio el dueño del producto al probarlo. Aquí sale centrado, entre dos
 * líneas punteadas, con el nombre de la regla, que va copiado en `originMeta`
 * y sobrevive a que la borren.
 */
function AvisoDeRegla({ mensaje }: { mensaje: ChatMessage }) {
  const regla = mensaje.originMeta?.ruleName;
  return (
    /* Una línea fina, en el amarillo de acento: es un aviso del sistema, no
       alguien hablando. El nombre de la regla y la hora van en el `title`
       para no cargar la línea; el texto, recortado a una. */
    <div
      className="my-2 flex items-center gap-2"
      data-origen="automatizacion"
      title={`${regla ? `Regla «${regla}»` : 'Automatización'} · ${horaCorta(mensaje.createdAt)}`}
    >
      <span
        className="h-px flex-1"
        style={{ background: alpha(colors.warning, 30) }}
        aria-hidden="true"
      />
      <span
        className="flex min-w-0 max-w-[75%] items-center gap-1.5 rounded-full px-2.5 py-0.5 font-sans text-[11px]"
        style={{ color: colors.warning, background: alpha(colors.warning, 10) }}
      >
        <Zap className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{mensaje.deletedAt ? 'Aviso eliminado' : mensaje.body}</span>
      </span>
      <span
        className="h-px flex-1"
        style={{ background: alpha(colors.warning, 30) }}
        aria-hidden="true"
      />
    </div>
  );
}

function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' });
}

function CurvedLine() {
  return (
    <div className="flex-1">
      <svg width="100%" height="8" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="wave" x="0" y="0" width="24" height="8" patternUnits="userSpaceOnUse">
            <path
              d="M0,4 Q6,0 12,4 T24,4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </pattern>
        </defs>
        <rect width="100%" height="8" fill="url(#wave)" />
      </svg>
    </div>
  );
}
