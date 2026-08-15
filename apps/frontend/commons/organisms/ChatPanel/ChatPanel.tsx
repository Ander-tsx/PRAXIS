'use client';

import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChatRefKind } from '../../api/chat-refs';
import { textoPlano } from '../../api/chat-refs';
import { createApiClient } from '../../api/client';
import type { ChatMessage, ChatMessagePage, UserProfile } from '../../api/domain';
import { personLabel } from '../../api/domain';
import { alpha, colors } from '../../tokens';
import { Composer, type Sugerencia } from './Composer';
import { MessageBubble } from './MessageBubble';

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
  enviar: (cuerpo: string, replyToId: string | null) => Promise<{ error: string | null }>;
  borrar: (messageId: string) => Promise<{ error: string | null }>;
  reaccionar: (messageId: string, emoji: string, on: boolean) => Promise<void>;
  /** Sin argumentos: la zona ya sabe de qué canal habla. */
  marcarLeido: () => Promise<void>;
}

export interface ChatPanelProps {
  /**
   * Que el panel ocupe todo el alto que le dé su padre.
   *
   * Falso por defecto —el chat de un proyecto convive con pestañas y ahí un
   * tope de 58vh evita que la conversación empuje el resto fuera de la vista—
   * y verdadero en la pantalla dedicada de mensajes, donde no compite con nada
   * y el tope solo dejaba una franja vacía contra el borde inferior.
   */
  llenarAlto?: boolean;
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
  canModerate: boolean;
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
export function ChatPanel({
  llenarAlto = false,
  pantallaCompletaEnMovil = false,
  salidaMovil,
  page,
  usersById,
  currentUserId,
  acciones,
  gatewayPath,
  rutaCanal,
  canWrite,
  canModerate,
  permiteMenciones,
  vacio,
  motivoSinEscribir,
  encabezado,
  hrefDePersona,
  hrefDeRef,
}: ChatPanelProps) {
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(page.hasMore);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [respondiendo, setRespondiendo] = useState<ChatMessage | null>(null);
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [alFinal, setAlFinal] = useState(true);

  /**
   * Las reacciones que este navegador ya ha aplicado, encima de lo que trajo el
   * servidor.
   *
   * ⚠️ Sin esto, reaccionar no se ve hasta que la página se vuelve a renderizar:
   * la lista viene del servidor y la acción no revalida —revalidar en cada
   * reacción repintaría la conversación entera—. Se corrige con lo que devuelve
   * el servidor, no con lo que se pidió.
   */
  const [reaccionesLocales, setReaccionesLocales] = useState<Map<string, ChatMessage['reactions']>>(
    new Map(),
  );

  const mensajes = [...older, ...page.items].map((mensaje) =>
    reaccionesLocales.has(mensaje.id)
      ? { ...mensaje, reactions: reaccionesLocales.get(mensaje.id) as ChatMessage['reactions'] }
      : mensaje,
  );
  const ultimoId = mensajes.at(-1)?.id;

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

  async function enviar(cuerpo: string) {
    setEnviando(true);
    setError(null);
    const resultado = await acciones.enviar(cuerpo, respondiendo?.id ?? null);
    if (resultado.error) setError(resultado.error);
    else setRespondiendo(null);
    setEnviando(false);
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
  async function reaccionar(messageId: string, emoji: string, on: boolean) {
    const actual =
      reaccionesLocales.get(messageId) ??
      mensajes.find((mensaje) => mensaje.id === messageId)?.reactions ??
      [];

    const siguiente = on
      ? [...actual, { messageId, emoji, userId: currentUserId }]
      : actual.filter(
          (reaccion) => !(reaccion.emoji === emoji && reaccion.userId === currentUserId),
        );

    setReaccionesLocales((previas) => new Map(previas).set(messageId, siguiente));

    try {
      await acciones.reaccionar(messageId, emoji, on);
    } catch {
      /* Vuelta atrás: dejar la reacción puesta cuando el servidor la rechazó
         sería mentir sobre lo que ven los demás. */
      setReaccionesLocales((previas) => new Map(previas).set(messageId, actual));
      setError('No se pudo guardar la reacción.');
    }
  }

  async function borrar(messageId: string) {
    const resultado = await acciones.borrar(messageId);
    if (resultado.error) setError(resultado.error);
  }

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col ${
        /* `max-sm:` y no un `hidden sm:flex` en el padre: así el mismo
           componente sirve en las dos y no hay dos árboles que mantener.
           `bg-background` es obligatorio — al salir del flujo, lo de debajo se
           vería a través. */
        pantallaCompletaEnMovil
          ? 'max-sm:fixed max-sm:inset-0 max-sm:z-40 max-sm:bg-background max-sm:px-3 max-sm:pb-3'
          : ''
      }`}
    >
      {salidaMovil && <div className="shrink-0 pt-2 sm:hidden">{salidaMovil}</div>}
      {encabezado}

      {/**
       * ⚠️ **El tope de altura vive aquí, no en el scroller de dentro.**
       *
       * Estaba en el scroller (`max-h-[58vh]`) mientras este contenedor era
       * `flex-1`. En cuanto el tope se aplicaba, el contenedor seguía creciendo
       * hasta llenar lo que le daba el padre y el scroller se quedaba corto: todo
       * ese sobrante quedaba como **hueco muerto entre el último mensaje y el
       * compositor**.
       *
       * ⚠️ Y el tope **solo se pone cuando el chat comparte pantalla con otra
       * cosa** (`llenarAlto` en falso), que es el caso de la pestaña de un
       * proyecto: ahí 58vh evita que la conversación empuje el resto fuera de la
       * vista. En la pantalla dedicada de mensajes no hay nada más con lo que
       * competir, así que el tope solo dejaba una franja vacía contra el borde
       * inferior — que es lo que se veía.
       */}
      <div
        className={`relative flex flex-col ${
          llenarAlto ? 'min-h-0 flex-1' : 'max-h-[58vh] min-h-72 flex-1'
        }`}
      >
        <div
          ref={scrollerRef}
          onScroll={alDesplazar}
          /* ⚠️ `overflow-x-hidden` explícito: `overflow-y-auto` a secas deja el
             eje horizontal en `auto`, así que **cualquier** cosa que se pase un
             píxel —una etiqueta larga, una palabra sin espacios— saca una barra
             horizontal en toda la conversación. Aquí nada debe desbordar a lo
             ancho: si algo no cabe, se parte. */
          className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto overflow-x-hidden px-1 pb-1 pt-3"
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
                <div key={mensaje.id}>
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
                    canDelete={mensaje.authorId === currentUserId || canModerate}
                    canReact={canWrite}
                    currentUserId={currentUserId}
                    hrefDePersona={hrefDePersona?.(mensaje.authorId) ?? null}
                    hrefDeRef={hrefDeRef}
                    onResponder={setRespondiendo}
                    onReaccionar={reaccionar}
                    onBorrar={borrar}
                    nombreDeAutor={nombreDeAutor}
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
      </div>

      {canWrite ? (
        <Composer
          onEnviar={enviar}
          enviando={enviando}
          placeholder="Escribe un mensaje…"
          permiteMenciones={permiteMenciones}
          sugerencias={sugerencias}
          onPedirSugerencias={pedirSugerencias}
          respuestaSlot={
            respondiendo && (
              <div
                className="flex items-start gap-2 rounded-lg border-l-2 py-1.5 pl-2.5 pr-2"
                style={{ borderColor: colors.primary, background: alpha(colors.primary, 8) }}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className="font-sans text-[11px] font-semibold"
                    style={{ color: colors.primary }}
                  >
                    Respondiendo a {nombreDeAutor(respondiendo.authorId)}
                  </span>
                  <span className="line-clamp-1 font-sans text-xs text-text-secondary">
                    {textoPlano(respondiendo.body)}
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
  );
}

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
