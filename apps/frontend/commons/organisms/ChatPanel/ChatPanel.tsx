'use client';

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
import { createApiClient } from '../../api/client';
import type { ChatAttachment, ChatMessage, ChatMessagePage, UserProfile } from '../../api/domain';
import { personLabel } from '../../api/domain';
import type { LinkPreview } from '../../api/link-preview';
import { hrefDeAvatar } from '../../api/presence';
import { Avatar } from '../../atoms/Avatar';
import { alpha, colors } from '../../tokens';
import { AdjuntoPreview } from './AdjuntoPreview';
import { Composer, type Sugerencia } from './Composer';
import { MessageBubble } from './MessageBubble';
import { PinnedBar } from './PinnedBar';
import { ThreadPanel } from './ThreadPanel';
import { campoDesdeCuerpo } from './etiquetado';

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

export interface ChatAcciones {
  /**
   * `enHilo` separa «responder» de «hilo»: los dos citan con `replyToId`,
   * pero solo un envío desde el panel del hilo (`enHilo: true`) se guarda
   * fuera de la conversación general. El compositor principal siempre manda
   * `false`, aunque lleve una cita puesta.
   */
  enviar: (
    cuerpo: string,
    replyToId: string | null,
    attachmentIds: string[],
    enHilo: boolean,
  ) => Promise<{ error: string | null }>;
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
  usersById: Map<string, UserProfile>;
  currentUserId: string;
  acciones: ChatAcciones;

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
}

/**
 * Una conversación completa: cabecera, historial y redactor.
 *
 * ## Cómo llegan los mensajes nuevos
 *
 * **No abre ninguna conexión.** `AvisosEnVivo` ya mantiene un flujo SSE por
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
    usersById,
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
  /** Los borradores que esperan al envío del mensaje. */
  const [adjuntosPendientes, setAdjuntosPendientes] = useState<ChatAttachment[]>([]);
  const [subiendo, setSubiendo] = useState(false);

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
   * Aplica tu delta pendiente sobre las reacciones que trae el servidor.
   *
   * Idempotente a propósito: poner un emoji que el servidor ya devuelve no lo
   * duplica, y quitar uno que ya no está no hace nada. Es lo que permite dejar
   * el delta puesto sin tener que adivinar cuándo el servidor «ya se enteró».
   */
  const conMisReacciones = useCallback(
    (mensaje: ChatMessage): ChatMessage['reactions'] => {
      const mias = reaccionesLocales.get(mensaje.id);
      if (!mias || mias.size === 0) return mensaje.reactions;

      let salida = mensaje.reactions;
      for (const [emoji, puesta] of mias) {
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
    [reaccionesLocales, currentUserId],
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

  const mensajes = [...older, ...page.items].map((mensaje) => {
    const reacciones = conMisReacciones(mensaje);
    const fijado = fijadosLocales.get(mensaje.id);
    const editado = editadosLocales.get(mensaje.id);
    return {
      ...mensaje,
      reactions: reacciones,
      ...(fijado ? { pinnedAt: fijado.pinnedAt, pinnedById: fijado.pinnedById } : {}),
      ...(editado ? { body: editado.body, editedAt: editado.editedAt } : {}),
    };
  });
  const ultimoId = mensajes.at(-1)?.id;

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

  /** Los fijados con las mismas correcciones locales que el historial. */
  const fijadosConCorrecciones = fijadosLista.map((mensaje) => {
    const editado = editadosLocales.get(mensaje.id);
    return editado ? { ...mensaje, body: editado.body, editedAt: editado.editedAt } : mensaje;
  });

  /** Las respuestas del hilo con las mismas correcciones locales que el historial. */
  const hiloMensajes = hiloReplies.map((mensaje) => {
    const reacciones = conMisReacciones(mensaje);
    const fijado = fijadosLocales.get(mensaje.id);
    const editado = editadosLocales.get(mensaje.id);
    return {
      ...mensaje,
      reactions: reacciones,
      ...(fijado ? { pinnedAt: fijado.pinnedAt, pinnedById: fijado.pinnedById } : {}),
      ...(editado ? { body: editado.body, editedAt: editado.editedAt } : {}),
    };
  });

  const nombreDeAutor = useCallback(
    (userId: string) => {
      const perfil = usersById.get(userId);
      if (userId === currentUserId) return 'Tú';
      return perfil ? personLabel(perfil) : 'Alguien que ya no está';
    },
    [usersById, currentUserId],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: `ultimoId` es el disparador — al llegar un mensaje con el chat abierto hay que volver a marcarlo leído o el contador reaparecería
  useEffect(() => {
    void acciones.marcarLeido();
  }, [acciones.marcarLeido, ultimoId]);

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
          const perfil = usersById.get(id);
          return {
            kind: 'user' as const,
            id,
            label: perfil ? personLabel(perfil) : id.slice(0, 8),
            contexto: perfil?.credential.email ?? '',
          };
        });

      setSugerencias([...personas, ...(catalogo.refs as Sugerencia[])]);
    } catch {
      /* Sin catálogo el desplegable simplemente no ofrece nada. No se avisa: no
         se puede escribir una etiqueta a mano, así que no hay nada que hacer al
         respecto y un error aquí solo estorbaría. */
    }
  }, [gatewayPath, rutaCanal, usersById, currentUserId]);

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

  async function enviar(cuerpo: string, attachmentIds: string[]) {
    setEnviando(true);
    setError(null);
    /* `enHilo: false` siempre desde aquí: es el compositor principal, y su
       resultado tiene que fluir en la conversación general aunque lleve una
       cita puesta. */
    const resultado = await acciones.enviar(cuerpo, respondiendo?.id ?? null, attachmentIds, false);
    if (resultado.error) setError(resultado.error);
    else {
      setRespondiendo(null);
      setAdjuntosPendientes([]);
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
  async function adjuntar(file: File) {
    setSubiendo(true);
    setError(null);
    try {
      const resultado = await acciones.adjuntar(file);
      if (resultado.error) setError(resultado.error);
      else if (resultado.attachment) {
        setAdjuntosPendientes((previos) => [...previos, resultado.attachment as ChatAttachment]);
      }
    } catch {
      setError('No se pudo subir el archivo. Si es muy grande, prueba con uno más ligero.');
    } finally {
      setSubiendo(false);
    }
  }

  async function quitarAdjunto(attachmentId: string) {
    setError(null);
    try {
      const resultado = await acciones.quitarAdjunto(attachmentId);
      if (resultado.error) setError(resultado.error);
      else {
        setAdjuntosPendientes((previos) => previos.filter((a) => a.id !== attachmentId));
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

  async function borrar(messageId: string) {
    const resultado = await acciones.borrar(messageId);
    if (resultado.error) setError(resultado.error);
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
    } catch {
      setFijadosLocales((previos) => new Map(previos).set(messageId, previo));
      setError('No se pudo guardar el fijado.');
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
  async function enviarEnHilo(cuerpo: string, attachmentIds: string[]) {
    if (!hiloRaiz) return;
    setEnviando(true);
    setError(null);
    /* `enHilo: true`: nace en el panel del hilo, así que se guarda fuera de
       la conversación general — aparece aquí y solo aquí. */
    const resultado = await acciones.enviar(cuerpo, hiloRaiz.id, attachmentIds, true);
    if (resultado.error) setError(resultado.error);
    else setAdjuntosPendientes([]);
    setEnviando(false);
    await abrirHilo(hiloRaiz);
  }

  /**
   * Borrar una respuesta del hilo, o cerrarlo si el borrado es el raíz.
   *
   * El servidor no devuelve el mensaje, así que la respuesta se quita de la
   * lista local — si se borrara el raíz, no queda hilo que mostrar.
   */
  async function borrarEnHilo(messageId: string) {
    const resultado = await acciones.borrar(messageId);
    if (resultado.error) setError(resultado.error);
    else if (messageId === hiloRaiz?.id) cerrarHilo();
    else setHiloReplies((actuales) => actuales.filter((mensaje) => mensaje.id !== messageId));
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

  function cerrarBusqueda() {
    setBusquedaAbierta(false);
    setTermino('');
    setResultados(null);
    setErrorBusqueda(null);
    setTerminoBuscado('');
  }

  useImperativeHandle(ref, () => ({ abrirBusqueda }));

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

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col w-full max-w-[100vw] overflow-x-hidden ${
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
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
              className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-y-auto overflow-x-hidden px-1 pb-1 pt-3"
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

                  return (
                    <div key={mensaje.id} data-msg-id={mensaje.id}>
                      {separador && (
                        <div className="my-3 flex items-center gap-3">
                          <span className="h-px flex-1" style={{ background: colors.border }} />
                          <span className="font-sans text-[11px] uppercase tracking-wide text-text-disabled">
                            {separador}
                          </span>
                          <span className="h-px flex-1" style={{ background: colors.border }} />
                        </div>
                      )}

                      <MessageBubble
                        message={mensaje}
                        author={usersById.get(mensaje.authorId)}
                        mine={mensaje.authorId === currentUserId}
                        continued={
                          !separador &&
                          anterior?.authorId === mensaje.authorId &&
                          new Date(mensaje.createdAt).getTime() -
                            new Date(anterior.createdAt).getTime() <
                            CORTE_DE_BLOQUE_MS
                        }
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
                        nombreDeAutor={nombreDeAutor}
                        isProjectChat={rutaCanal.includes('/projects')}
                        {...(acciones.previewDeLink
                          ? { previewDeLink: acciones.previewDeLink }
                          : {})}
                      />
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
                  background: colors.surfaceElevated,
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
             * La vista de búsqueda, encima del historial.
             *
             * Ocupa el área del scroll en lugar de empujarlo: así quien buscó y
             * cierra vuelve a donde estaba, sin que la conversación se mueva un
             * píxel por haber consultado otra cosa.
             */}
            {busquedaAbierta && (
              <div
                className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-xl border border-border p-3"
                style={{ background: colors.background }}
              >
                <div className="flex shrink-0 items-center gap-2">
                  <div
                    className="flex flex-1 items-center gap-2 rounded-lg border border-border px-3 py-2"
                    style={{ background: colors.surface }}
                  >
                    <svg
                      className="h-4 w-4 shrink-0 text-text-secondary"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
                      />
                    </svg>
                    <input
                      value={termino}
                      onChange={(e) => setTermino(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void buscar();
                        if (e.key === 'Escape') cerrarBusqueda();
                      }}
                      placeholder="Busca en esta conversación…"
                      className="min-w-0 flex-1 bg-transparent font-sans text-sm text-text-primary outline-none placeholder:text-text-disabled"
                      aria-label="Buscar en la conversación"
                    />
                    {buscando && (
                      <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-text-disabled border-t-transparent" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={cerrarBusqueda}
                    aria-label="Cerrar búsqueda"
                    className="shrink-0 cursor-pointer rounded-lg border border-border px-3 py-2 font-sans text-xs text-text-secondary transition-colors hover:text-text-primary"
                  >
                    Cerrar
                  </button>
                </div>

                {errorBusqueda ? (
                  <p className="mt-3 font-sans text-xs" style={{ color: colors.error }}>
                    {errorBusqueda}
                  </p>
                ) : resultados === null ? (
                  <p className="mt-3 font-sans text-sm text-text-secondary">
                    {terminoBuscado ? 'Sin resultados.' : 'Escribe algo y pulsa Enter para buscar.'}
                  </p>
                ) : resultados.length === 0 ? (
                  <p className="mt-3 font-sans text-sm text-text-secondary">
                    Nada que coincida con «{terminoBuscado}».
                  </p>
                ) : (
                  <ul className="mt-3 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                    {resultados.map((mensaje) => (
                      <li key={mensaje.id}>
                        <button
                          type="button"
                          onClick={() => void saltarAlMensaje(mensaje.id)}
                          className="w-full cursor-pointer rounded-lg px-2 py-2 text-left transition-colors hover:bg-overlay/5"
                        >
                          <span className="flex items-center gap-2 font-sans text-xs">
                            <span className="font-semibold text-text-primary">
                              {nombreDeAutor(mensaje.authorId)}
                            </span>
                            <span className="text-text-disabled">
                              {new Date(mensaje.createdAt).toLocaleString('es', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {mensaje.pinnedAt && <span className="text-text-disabled">📌</span>}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block font-sans text-sm text-text-secondary">
                            <AdjuntoPreview mensaje={mensaje} />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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
            <div className="shrink-0 border-t border-border p-3">
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
                sugerencias={sugerencias}
                onPedirSugerencias={pedirSugerencias}
                /* Editando no hay adjuntos que enseñar: lo que se cambia es el
                 texto. Los del mensaje siguen donde estaban. */
                adjuntosPendientes={editando ? [] : adjuntosPendientes}
                onAdjuntar={adjuntar}
                onQuitarAdjunto={quitarAdjunto}
                subiendo={subiendo}
                citaId={respondiendo?.id ?? null}
                {...(editando
                  ? {
                      valorInicial: campoDesdeCuerpo(editando.body),
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
                          className="flex items-start gap-2 rounded-lg border-l-2 py-1.5 pl-2.5 pr-2"
                          style={{
                            borderColor: colors.primary,
                            background: alpha(colors.primary, 8),
                          }}
                        >
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span
                              className="font-sans text-[11px] font-semibold"
                              style={{ color: colors.primary }}
                            >
                              Respondiendo a {nombreDeAutor(respondiendo.authorId)}
                            </span>
                            <span className="line-clamp-1 font-sans text-xs text-text-secondary">
                              <AdjuntoPreview mensaje={respondiendo} />
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setRespondiendo(null)}
                            aria-label="Dejar de responder"
                            className="shrink-0 cursor-pointer rounded px-1 font-sans text-xs text-text-disabled hover:text-text-primary"
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

          {error && (
            <p role="alert" className="mt-2 font-sans text-xs" style={{ color: colors.error }}>
              {error}
            </p>
          )}
        </div>

        {hiloRaiz && (
          <ThreadPanel
            raiz={hiloRaiz}
            replies={hiloMensajes}
            cargando={hiloCargando}
            error={hiloError}
            onCerrar={cerrarHilo}
            usersById={usersById}
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
            adjuntosPendientes={adjuntosPendientes}
            onAdjuntar={adjuntar}
            onQuitarAdjunto={quitarAdjunto}
            subiendo={subiendo}
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
