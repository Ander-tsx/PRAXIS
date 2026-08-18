'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  type AssistantProposal,
  type AssistantQuota,
  formatoReinicio,
  isAssignmentProposal,
  isChartProposal,
  isCheckStepsProposal,
  isChecklistProposal,
  isCommentProposal,
  isDeleteProposal,
  isEditProposal,
  isMessageProposal,
  isMoveProposal,
  isTaskProposal,
} from '../../api/assistant';
import { cargarConversacionAction, preguntarAction } from '../../assistant/actions';
import { Badge, Button, PRAX_NAME, PraxAvatar, type PraxMood } from '../../atoms';
import { alpha, colors } from '../../tokens';
import { ConversationHistory } from './ConversationHistory';
import { FlujoDePensamiento } from './FlujoDePensamiento';
import { ModelText } from './ModelText';
import {
  AccionDelLienzo,
  type AceptarGrafico,
  AssignProposalCard,
  ChartProposalCard,
  ChecklistProposalCard,
  CommentProposalCard,
  DeleteProposalCard,
  EditProposalCard,
  MarkStepsProposalCard,
  MessageProposalCard,
  MoveProposalCard,
  TaskProposalCard,
} from './ProposalCard';
import { ProposalGroup } from './ProposalGroup';

interface Mensaje {
  id: string;
  role: 'user' | 'model';
  text: string;
  /** Solo en los del asistente. Cada una se pinta como tarjeta debajo. */
  proposals?: AssistantProposal[];
}

export interface AssistantChatProps {
  projectId: string;
  /** La cuota al cargar la página, antes de escribir nada. */
  cuotaInicial: AssistantQuota | null;
  nombres: Record<string, string>;
  etiquetas: Record<string, string>;
  /**
   * Un texto que otro sitio de la pantalla deja escrito en el compositor.
   *
   * Lo usa el botón «Generar» del lienzo: lleva aquí, deja la frase puesta y
   * enfoca el campo — **sin enviarla**. Enviar por su cuenta gastaría un turno
   * de cuota que nadie pidió y, peor, daría un gráfico que quien pulsó todavía
   * no ha decidido cómo quiere.
   *
   * `sello` es lo que hace que pulsar dos veces vuelva a funcionar: sin él, el
   * segundo clic trae el mismo texto, React no ve ningún cambio y el campo se
   * queda como estaba, como si el botón se hubiera roto.
   */
  sugerenciaExterna?: { texto: string; sello: number } | null;
  /**
   * Qué hacer cuando alguien acepta un **gráfico** propuesto.
   *
   * ⚠️ **Es la única acción que llega por props**, y merece la pena entender por
   * qué las otras nueve no. Aquellas —crear una tarea, comentar, mover, borrar—
   * valen en cualquier zona y viven en `commons/assistant/actions`. Aceptar un
   * gráfico escribe en el **lienzo**, que dibuja `reports-front`: necesita su
   * catálogo de widgets para saber de qué tamaño nace la tarjeta, y revalida
   * *aquella* página.
   *
   * Sin ella —el caso de `assistant-front`, donde no hay ningún gráfico a la
   * vista— la tarjeta enseña qué se propone y remite a Análisis, en vez de
   * ofrecer un botón que no podría cumplir lo que promete.
   */
  alAceptarGrafico?: AceptarGrafico;
  /**
   * Qué forma toma la conversación.
   *
   * - `panel` — una tarjeta con borde, alto acotado, entre otras cosas. Es la de
   *   Análisis, donde el chat comparte pantalla con los gráficos y no puede
   *   quedárselo todo.
   * - `pantalla` — sin tarjeta, ocupando el alto disponible, con el hilo
   *   desplazándose por dentro y el compositor abajo del todo. Es la de su propia
   *   zona, donde **la conversación es la pantalla**.
   *
   * Es una prop y no dos componentes porque lo único que cambia es el envoltorio:
   * el hilo, las burbujas, las propuestas, el historial y la cuota son idénticos,
   * y duplicarlos sería duplicar el sitio donde se arregla el próximo fallo.
   */
  variante?: 'panel' | 'pantalla';
}

/**
 * Las preguntas de arranque.
 *
 * ⚠️ **No son ejemplos de sintaxis, son puertas de entrada.** Las tres primeras
 * piden un dato y las dos últimas abren una conversación —«qué debería mirar»,
 * «ayúdame a repartir»— que es donde el asistente aporta algo que un informe no
 * puede: no solo decir cómo va, sino qué hacer con ello.
 *
 * Cinco y no más: una rejilla de nueve sugerencias se lee como un menú y quita
 * las ganas de escribir la propia, que es lo que de verdad se quiere.
 */
const SUGERENCIAS = [
  '¿Cómo va el proyecto?',
  '¿Dónde se está acumulando el trabajo?',
  '¿Qué debería mirar hoy?',
  'Ayúdame a repartir lo que está sin encargado',
  '¿Hay algo que lleve parado demasiado tiempo?',
];

/**
 * El asistente del proyecto, dentro de la propia página de reportes.
 *
 * Está aquí y no en una pantalla aparte porque **lee exactamente lo que se está
 * viendo**: los mismos percentiles, la misma predicción, el mismo reparto. Un
 * chat en otra pestaña obligaría a recordar el gráfico mientras se pregunta por
 * él, que es justo lo que esta sección existe para evitar.
 *
 * ### Lo que hace y lo que no
 *
 * Responde y **propone**. No crea nada: cada propuesta sale como una tarjeta con
 * su «Aceptar», y aceptar llama al mismo endpoint que el formulario del tablero,
 * con los mismos permisos. Ver `ProposalCard`.
 *
 * ### Sin streaming, a propósito
 *
 * Gemini lo soporta, pero atravesar SSE por una Server Action complica el bucle
 * entero y las respuestas de aquí son cortas. Un estado de carga honesto basta.
 *
 * ### El hilo lo guarda el servidor
 *
 * Hubo un tiempo en que el historial vivía en este estado y se reenviaba en cada
 * turno, porque no había tabla de conversaciones: recargar la página lo borraba.
 * Ahora solo viaja `conversationId` y el hilo sale de la base, así que el modelo
 * ve exactamente el mismo que la pantalla.
 *
 * Al montar se empieza **limpio**, con la conversación anterior a un clic en el
 * historial. Recuperar sola la última convertiría cada visita a Reportes en la
 * continuación de algo que a lo mejor ya estaba cerrado.
 *
 * ### Dos vistas, una sección
 *
 * «Historial» **sustituye** al chat en la misma tarjeta en vez de abrirse
 * encima. Un desplegable sobre el hilo se probó y no servía: esto vive entre
 * los gráficos del informe, así que el panel salía estrecho y tapaba lo que
 * estabas leyendo para enseñar cuatro títulos recortados. Del historial solo
 * se sale eligiendo —abrir una conversación o empezar otra—, y las dos llevan
 * al chat, que es donde se puede hacer algo.
 */
export function AssistantChat({
  projectId,
  cuotaInicial,
  nombres,
  etiquetas,
  sugerenciaExterna = null,
  alAceptarGrafico,
  variante = 'panel',
}: AssistantChatProps) {
  const aPantalla = variante === 'pantalla';
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  /**
   * La conversación abierta. `null` significa «la siguiente pregunta abre una».
   *
   * No se guarda en `localStorage`: al recargar se empieza limpio y las de antes
   * están en la lista. Recuperar sola la última convertiría cada visita a
   * Reportes en la continuación de algo que a lo mejor ya estaba cerrado.
   */
  const [conversationId, setConversationId] = useState<string | null>(null);
  /**
   * Qué enseña la tarjeta: el chat o el historial.
   *
   * Son **la misma sección en dos modos**, no un panel encima del otro. El chat
   * vive entre los gráficos del informe, así que un desplegable salía estrecho y
   * tapaba el hilo que estabas leyendo para enseñar cuatro títulos. En el
   * historial hay sitio para lo que hace falta al elegir.
   */
  const [vista, setVista] = useState<'chat' | 'historial'>('chat');
  const [texto, setTexto] = useState('');
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cuota, setCuota] = useState<AssistantQuota | null>(cuotaInicial);

  const hiloRef = useRef<HTMLDivElement>(null);
  const seccionRef = useRef<HTMLElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const campoId = useId();

  /**
   * Lo que deja escrito el botón «Generar» del lienzo.
   *
   * Vuelve al chat y al modo conversación —si estabas en el historial, ahí no
   * hay dónde escribir—, deja la frase y enfoca. La pregunta la termina de
   * escribir quien la va a hacer.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: el sello es el disparador; el texto viaja con él y añadirlo repetiría el gesto al reenfocar.
  useEffect(() => {
    if (!sugerenciaExterna) return;
    setVista('chat');
    setTexto(sugerenciaExterna.texto);
    seccionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    campoRef.current?.focus();
  }, [sugerenciaExterna?.sello]);

  const agotada = cuota !== null && cuota.usados >= cuota.limite;

  /**
   * Al fondo con cada turno: en un hilo, lo último es lo que importa.
   *
   * Depende de la **longitud** y no del array: las tarjetas de propuesta guardan
   * su propio estado, y reaccionar al contenido volvería a bajar el hilo cada
   * vez que alguien acepta una, justo cuando está leyendo el resultado.
   */
  useEffect(() => {
    hiloRef.current?.scrollTo({ top: hiloRef.current.scrollHeight, behavior: 'smooth' });
  }, [mensajes.length, pendiente]);

  /**
   * Abre una conversación guardada, con sus propuestas y su estado.
   *
   * Las tarjetas vuelven a pintarse tal cual, pero solo las `PENDING` conservan
   * sus botones: ver `ProposalCard`.
   */
  async function cargar(id: string) {
    setError(null);
    setVista('chat');
    setPendiente(true);
    const conversacion = await cargarConversacionAction(projectId, id);
    setPendiente(false);

    if (!conversacion) {
      setError('No se pudo abrir esa conversación.');
      return;
    }

    setConversationId(conversacion.id);
    setMensajes(
      conversacion.mensajes.map((mensaje) => ({
        id: mensaje.id,
        role: mensaje.role,
        text: mensaje.text,
        proposals: mensaje.proposals,
      })),
    );
  }

  async function enviar(pregunta: string) {
    const limpio = pregunta.trim();
    if (!limpio || pendiente || agotada) return;

    const mio: Mensaje = { id: crypto.randomUUID(), role: 'user', text: limpio };

    setMensajes((previos) => [...previos, mio]);
    setTexto('');
    setError(null);
    setPendiente(true);

    const respuesta = await preguntarAction(projectId, limpio, conversationId ?? undefined);

    setPendiente(false);
    if (respuesta.cuota) setCuota(respuesta.cuota);
    /* Aunque el turno falle: si el servidor llegó a abrir la conversación, el
       siguiente intento tiene que caer dentro y no abrir otra. */
    if (respuesta.conversationId) setConversationId(respuesta.conversationId);

    if (respuesta.error || !respuesta.reply) {
      setError(respuesta.error ?? 'El asistente no ha respondido nada.');
      /* El mensaje se queda escrito en el hilo pero vuelve al campo: si el fallo
         fue de red, reintentarlo no debería obligar a escribirlo otra vez. */
      setTexto(limpio);
      setMensajes((previos) => previos.filter((mensaje) => mensaje.id !== mio.id));
      return;
    }

    setMensajes((previos) => [
      ...previos,
      {
        id: crypto.randomUUID(),
        role: 'model',
        text: respuesta.reply as string,
        proposals: respuesta.proposals,
      },
    ]);
  }

  /**
   * El estado de la cara, deducido de lo que está pasando.
   *
   * No hay un `useState` para esto y no debería haberlo: sería un segundo sitio
   * donde apuntar en qué anda el asistente, y los dos podrían discrepar. La cara
   * es una **función** de lo que ya se sabe.
   */
  const animo: PraxMood = pendiente
    ? 'thinking'
    : error
      ? 'oops'
      : mensajes.length > 0
        ? 'happy'
        : 'idle';

  return (
    /**
     * ⚠️ El proveedor envuelve la sección **entera**, no solo la lista de
     * propuestas: `ChartProposalCard` cuelga tres componentes por debajo y el
     * contexto tiene que alcanzarla también cuando el hilo se repinta desde el
     * historial.
     */
    <AccionDelLienzo.Provider value={alAceptarGrafico ?? null}>
      <section
        ref={seccionRef}
        className={
          aPantalla
            ? /* Sin tarjeta y sin borde: aquí no hay nada de lo que separarse,
                 porque la conversación **es** la pantalla. `min-h-0` es lo que
                 permite que el hilo de dentro se desplace en vez de estirar el
                 contenedor — sin él, un `flex-1` con contenido largo crece y el
                 scroll se lo queda la página entera, que es justo lo que se
                 quiere evitar en un chat. */
              'flex min-h-0 flex-1 flex-col gap-4'
            : 'flex flex-col gap-4 rounded-2xl border p-5'
        }
        style={
          aPantalla
            ? undefined
            : { borderColor: alpha(colors.primary, 25), background: colors.surface }
        }
        aria-label={`${PRAX_NAME}, el asistente`}
      >
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {/* La cara, a la izquierda del título: es lo que convierte esto en
              «hablar con alguien» y no en «usar un cuadro de texto». Y mientras
              el modelo tarda es la única señal de que sigue vivo. */}
            <PraxAvatar mood={animo} size="md" />

            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-xl text-text-primary">
                  {vista === 'historial' ? 'Historial' : PRAX_NAME}
                </h3>
                <Badge
                  variant="accent"
                  className="inline-flex items-center gap-1 uppercase"
                  style={{
                    borderRadius: 4,
                    background: alpha(colors.accent, 15),
                    border: `1px solid ${alpha(colors.accent, 40)}`,
                    color: colors.accent,
                    fontWeight: 700,
                  }}
                >
                  AI
                </Badge>
              </div>
              <p className="font-sans text-sm text-text-secondary">
                {vista === 'historial'
                  ? 'Tus conversaciones en este proyecto. Abre una para seguir donde la dejaste.'
                  : 'Lee los datos del proyecto y responde con sus números. Cuando propone algo, no lo hace: lo deja para que lo revises.'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {/* El contador solo en el chat: en el historial no se gasta nada, y un
              número de cuota sobre una lista de títulos solo distrae. */}
            {vista === 'chat' && cuota && <ContadorCuota cuota={cuota} />}
            {/**
             * Icono y no texto: la cabecera ya lleva el título, la insignia «AI» y
             * el contador de cuota, y una palabra más la volvía una fila de cosas
             * que leer. Lo que se pierde —saber a qué lleva sin pasar por encima—
             * se recupera con el `title`, y el nombre accesible va completo.
             */}
            <button
              type="button"
              onClick={() => setVista(vista === 'historial' ? 'chat' : 'historial')}
              aria-label={vista === 'historial' ? 'Volver al chat' : 'Ver el historial'}
              aria-pressed={vista === 'historial'}
              title={vista === 'historial' ? 'Volver al chat' : 'Historial'}
              /* 40×40 con borde: el contador de cuota que tiene al lado son dos
               líneas (~32 px de alto) y un icono suelto de 16 px quedaba
               diminuto y descolgado. Con este tamaño los dos bloques pesan lo
               mismo y la cabecera se lee simétrica. */
              className={`flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                vista === 'historial'
                  ? 'bg-surface-elevated text-text-primary'
                  : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
              }`}
              style={{ borderColor: colors.border }}
            >
              {vista === 'historial' ? (
                /* De vuelta: una flecha, que es lo que se espera de «salir de
                 aquí» y no se confunde con otra sección. */
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              ) : (
                /* Un reloj con la flecha de retroceso: el icono estándar de
                 «historial», que se reconoce sin leer nada. */
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l2.5 2.5" />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.05 11a9 9 0 111.5 6M3 20v-5h5"
                  />
                </svg>
              )}
            </button>
          </div>
        </header>

        {vista === 'historial' ? (
          <ConversationHistory
            projectId={projectId}
            activaId={conversationId}
            onElegir={cargar}
            onNueva={() => {
              setConversationId(null);
              setMensajes([]);
              setError(null);
              setVista('chat');
            }}
            onBorrarActiva={() => {
              setConversationId(null);
              setMensajes([]);
            }}
          />
        ) : (
          /* En pantalla completa esto tiene que ser una columna que crezca: el
             hilo se lleva el alto sobrante y el compositor se queda abajo. Un
             fragmento no puede llevar clases, así que aquí sí hace falta un
             `div` — en modo panel es transparente porque no lleva ninguna. */
          <div className={aPantalla ? 'flex min-h-0 flex-1 flex-col gap-4' : 'contents'}>
            {mensajes.length > 0 && (
              <div
                ref={hiloRef}
                className={`scrollbar-slim flex flex-col gap-4 overflow-y-auto pr-1 ${
                  aPantalla ? 'min-h-0 flex-1' : 'max-h-[28rem]'
                }`}
                aria-live="polite"
              >
                {mensajes.map((mensaje) => (
                  <div key={mensaje.id} className="flex flex-col gap-3">
                    <Burbuja mensaje={mensaje} />

                    {(mensaje.proposals ?? []).length > 0 && (
                      /* Cuántas quedan sin decidir lo lleva el propio grupo: cada
                       tarjeta le informa de su estado, así que también cuenta
                       las que se acepten o descarten aquí mismo, no solo las que
                       ya vinieran decididas de una conversación vieja. */
                      <ProposalGroup>
                        {(mensaje.proposals ?? []).map((propuesta, indice) => {
                          if (isTaskProposal(propuesta)) {
                            return (
                              <TaskProposalCard
                                key={propuesta.id ?? `${mensaje.id}-${indice}`}
                                projectId={projectId}
                                proposalId={propuesta.id}
                                estadoGuardado={propuesta.status}
                                propuesta={propuesta.args}
                                nombres={nombres}
                                etiquetas={etiquetas}
                              />
                            );
                          }
                          if (isAssignmentProposal(propuesta)) {
                            return (
                              <AssignProposalCard
                                key={propuesta.id ?? `${mensaje.id}-${indice}`}
                                projectId={projectId}
                                proposalId={propuesta.id}
                                estadoGuardado={propuesta.status}
                                propuesta={propuesta.args}
                                nombres={nombres}
                                etiquetas={etiquetas}
                              />
                            );
                          }
                          if (isEditProposal(propuesta)) {
                            return (
                              <EditProposalCard
                                key={propuesta.id ?? `${mensaje.id}-${indice}`}
                                projectId={projectId}
                                proposalId={propuesta.id}
                                estadoGuardado={propuesta.status}
                                propuesta={propuesta.args}
                                nombres={nombres}
                                etiquetas={etiquetas}
                              />
                            );
                          }
                          if (isMoveProposal(propuesta)) {
                            return (
                              <MoveProposalCard
                                key={propuesta.id ?? `${mensaje.id}-${indice}`}
                                projectId={projectId}
                                proposalId={propuesta.id}
                                estadoGuardado={propuesta.status}
                                propuesta={propuesta.args}
                                nombres={nombres}
                                etiquetas={etiquetas}
                              />
                            );
                          }
                          if (isChecklistProposal(propuesta)) {
                            return (
                              <ChecklistProposalCard
                                key={propuesta.id ?? `${mensaje.id}-${indice}`}
                                projectId={projectId}
                                proposalId={propuesta.id}
                                estadoGuardado={propuesta.status}
                                propuesta={propuesta.args}
                                nombres={nombres}
                                etiquetas={etiquetas}
                              />
                            );
                          }
                          if (isCommentProposal(propuesta)) {
                            return (
                              <CommentProposalCard
                                key={propuesta.id ?? `${mensaje.id}-${indice}`}
                                projectId={projectId}
                                proposalId={propuesta.id}
                                estadoGuardado={propuesta.status}
                                propuesta={propuesta.args}
                                nombres={nombres}
                                etiquetas={etiquetas}
                              />
                            );
                          }
                          if (isCheckStepsProposal(propuesta)) {
                            return (
                              <MarkStepsProposalCard
                                key={propuesta.id ?? `${mensaje.id}-${indice}`}
                                projectId={projectId}
                                proposalId={propuesta.id}
                                estadoGuardado={propuesta.status}
                                propuesta={propuesta.args}
                                nombres={nombres}
                                etiquetas={etiquetas}
                              />
                            );
                          }
                          if (isMessageProposal(propuesta)) {
                            return (
                              <MessageProposalCard
                                key={propuesta.id ?? `${mensaje.id}-${indice}`}
                                projectId={projectId}
                                proposalId={propuesta.id}
                                estadoGuardado={propuesta.status}
                                propuesta={propuesta.args}
                                nombres={nombres}
                                etiquetas={etiquetas}
                              />
                            );
                          }
                          /* El borrado es el único destructivo, así que su guarda
                           es la más estrecha de la cadena: `proponer_borrado`
                           **y** un `taskId` de verdad. Lo que no puede pasar
                           nunca es lo contrario —que una guarda ancha se coma un
                           borrado y lo pinte como un cambio inocuo—, y ninguna
                           de las de arriba mira este `tool`. */
                          if (isDeleteProposal(propuesta)) {
                            return (
                              <DeleteProposalCard
                                key={propuesta.id ?? `${mensaje.id}-${indice}`}
                                projectId={projectId}
                                proposalId={propuesta.id}
                                estadoGuardado={propuesta.status}
                                propuesta={propuesta.args}
                                nombres={nombres}
                                etiquetas={etiquetas}
                              />
                            );
                          }
                          if (isChartProposal(propuesta)) {
                            return (
                              <ChartProposalCard
                                key={propuesta.id ?? `${mensaje.id}-${indice}`}
                                projectId={projectId}
                                proposalId={propuesta.id}
                                estadoGuardado={propuesta.status}
                                propuesta={propuesta.args}
                                nombres={nombres}
                                etiquetas={etiquetas}
                              />
                            );
                          }
                          /* Una herramienta que el servicio conozca y esta pantalla no.
                   Se ignora en silencio: la burbuja de texto ya está pintada. */
                          return null;
                        })}
                      </ProposalGroup>
                    )}
                  </div>
                ))}

                {pendiente && <FlujoDePensamiento />}
              </div>
            )}

            {mensajes.length === 0 &&
              (aPantalla ? (
                /**
                 * El recibimiento, **dentro del hilo y en el sitio donde va a
                 * aparecer la primera respuesta**.
                 *
                 * Antes esto era una portada aparte encima del chat: la cara
                 * grande, cuatro tarjetas de capacidades y un aviso. Ocupaba
                 * media pantalla para decir algo que solo hace falta leer una
                 * vez, y empujaba la conversación —que es a lo que se viene—
                 * hacia abajo.
                 *
                 * Ahora vive donde estaba el vacío: se lee al entrar, y en
                 * cuanto se escribe la primera pregunta desaparece solo, sin
                 * dejar hueco. Es la diferencia entre una pantalla con un chat
                 * dentro y una pantalla que **es** un chat.
                 */
                <div className="flex flex-1 flex-col items-center justify-center gap-5 py-8 text-center">
                  <PraxAvatar mood="idle" size="lg" />

                  <div className="flex max-w-lg flex-col gap-2">
                    <p className="font-display text-2xl text-text-primary">
                      Pregúntame por este proyecto
                    </p>
                    <p className="font-serif text-base italic text-text-secondary">
                      Sé qué hay en cada tablero, quién lleva qué y cómo va el ritmo. Puedo
                      responder con esos números, y también preparar el trabajo que salga de
                      hablarlo.
                    </p>
                  </div>

                  <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                    {SUGERENCIAS.map((sugerencia) => (
                      <Sugerencia
                        key={sugerencia}
                        texto={sugerencia}
                        agotada={agotada}
                        onElegir={enviar}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                /* En el panel de Análisis no hay sitio para un recibimiento: el
                   chat comparte pantalla con los gráficos y su cabecera ya dice
                   qué es. Solo las sugerencias, que son lo accionable. */
                <div className="flex flex-wrap gap-2">
                  {SUGERENCIAS.map((sugerencia) => (
                    <Sugerencia
                      key={sugerencia}
                      texto={sugerencia}
                      agotada={agotada}
                      onElegir={enviar}
                    />
                  ))}
                </div>
              ))}

            {agotada && cuota ? (
              <p
                role="note"
                className="rounded-xl border px-4 py-3 font-sans text-sm text-warning"
                style={{
                  background: alpha(colors.warning, 8),
                  borderColor: alpha(colors.warning, 30),
                }}
              >
                Has gastado los <strong>{cuota.limite}</strong> mensajes de este mes. Vuelven el{' '}
                <strong>{formatoReinicio(cuota.reinicia)}</strong>.
              </p>
            ) : (
              <form
                className="flex flex-col gap-2"
                onSubmit={(evento) => {
                  evento.preventDefault();
                  enviar(texto);
                }}
              >
                <label htmlFor={campoId} className="sr-only">
                  Pregunta al asistente
                </label>
                <div className="flex items-stretch gap-2">
                  <textarea
                    ref={campoRef}
                    id={campoId}
                    rows={2}
                    maxLength={2000}
                    value={texto}
                    disabled={pendiente}
                    placeholder="¿Quién puede llevar el formulario de login?"
                    onChange={(evento) => setTexto(evento.target.value)}
                    onKeyDown={(evento) => {
                      /* Enter envía, Mayús+Enter parte la línea: es lo que hace
                   cualquier chat, y `requestSubmit` respeta la validación del
                   formulario en vez de saltársela. */
                      if (evento.key === 'Enter' && !evento.shiftKey) {
                        evento.preventDefault();
                        evento.currentTarget.form?.requestSubmit();
                      }
                    }}
                    className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 font-sans text-sm text-text-primary placeholder:text-text-disabled focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  />
                  {/* `items-stretch` + `style.height` en vez de `items-end`: con dos
                filas el botón por defecto mide una (`size="md"`, 40px) y quedaba
                anclado abajo, con un hueco encima que rompía la simetría con el
                campo. Va por `style` y no por una clase `h-full`: la clase
                compite con el `h-10` de `sizeClasses.md` en la misma
                especificidad, y quién gana depende del orden en que Tailwind
                generó el CSS, no del orden en el `className` — un `style` en
                línea no tiene esa ambigüedad. */}
                  <Button
                    type="submit"
                    isLoading={pendiente}
                    disabled={texto.trim().length === 0}
                    style={{ height: 70 }}
                  >
                    Preguntar
                  </Button>
                </div>

                <p className="font-sans text-xs text-text-disabled">
                  {PRAX_NAME} puede equivocarse. Revisa cada propuesta antes de aceptarla.
                </p>

                {error && <p className="font-sans text-sm text-error">{error}</p>}
              </form>
            )}
          </div>
        )}
      </section>
    </AccionDelLienzo.Provider>
  );
}

function ContadorCuota({ cuota }: { cuota: AssistantQuota }) {
  const quedan = Math.max(0, cuota.limite - cuota.usados);
  const apurado = quedan <= Math.max(3, Math.round(cuota.limite * 0.1));

  return (
    <div className="flex shrink-0 flex-col items-end">
      <span
        className="font-display text-lg leading-none tabular-nums"
        style={{ color: apurado ? colors.warning : colors.textSecondary }}
      >
        {cuota.usados} / {cuota.limite}
      </span>
      <span className="font-sans text-[11px] uppercase tracking-wider text-text-disabled">
        mensajes este mes
      </span>
    </div>
  );
}

/**
 * Una pregunta de arranque.
 *
 * Existe como componente porque se pinta en los dos modos y con el mismo
 * aspecto: tenerlo dos veces en línea era el sitio perfecto para que uno se
 * quedara sin el `disabled` al agotarse la cuota.
 */
function Sugerencia({
  texto,
  agotada,
  onElegir,
}: { texto: string; agotada: boolean; onElegir: (texto: string) => void }) {
  return (
    <button
      type="button"
      disabled={agotada}
      onClick={() => onElegir(texto)}
      className="rounded-full border border-border px-3.5 py-2 font-sans text-sm text-text-secondary transition-colors hover:border-border-strong hover:bg-surface-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      {texto}
    </button>
  );
}

/** `14:07`. Solo la hora: la conversación es de hoy o no importa cuándo fue. */
const HORA = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

/**
 * Un turno de la conversación.
 *
 * ## Se parece a las burbujas de Mensajes, y es a propósito
 *
 * Mismo radio, mismo relleno, mismo tinte —`color-mix` del primario contra el
 * fondo para lo tuyo, `surface-elevated` para lo suyo— y la esquina de dentro
 * cuadrada. Hablar con PRAX y hablar con una persona son la misma clase de gesto,
 * y dos lenguajes visuales para lo mismo se aprenden dos veces.
 *
 * ## ⚠️ Y **deliberadamente** no se parece en nada más
 *
 * La burbuja del chat de equipo lleva menú de tres puntos, copiar, responder,
 * citar, abrir hilo, fijar, reacciones, marcas de leído y deslizamiento táctil.
 * Aquí no hay nada de eso, y no por falta de tiempo:
 *
 * - **Responder, citar y abrir hilo** no significan nada en una conversación de
 *   dos donde cada mensaje ya responde al anterior.
 * - **Fijar y reaccionar** existen para que otros lo vean, y aquí no hay otros:
 *   esta conversación es tuya y de nadie más.
 * - **Las marcas de leído** contestarían a «¿lo ha visto?» sobre alguien que
 *   siempre lo ve.
 *
 * Lo único que se queda es **la hora**, que sí sirve: al releer un hilo de hace
 * días, dice cuándo se dijo cada cosa.
 *
 * ⚠️ La hora se calcula al pintar y no viene del servidor. En un mensaje recién
 * enviado eso es exacto; al releer una conversación guardada, `createdAt` no
 * viaja hasta esta burbuja y se enseña la del momento en que se cargó. Es la
 * razón por la que la hora va tenue y pequeña, y no como un dato del que fiarse
 * para nada que importe.
 */
function Burbuja({ mensaje }: { mensaje: Mensaje }) {
  const mio = mensaje.role === 'user';

  return (
    <div className={`flex flex-col gap-1 ${mio ? 'items-end' : 'items-start'}`}>
      <div
        className={[
          'max-w-[85%] min-w-0 whitespace-pre-wrap rounded-2xl px-3.5 py-2 font-sans text-sm leading-relaxed text-text-primary',
          /* La esquina de dentro, cuadrada: es lo que da el pico hacia quien
             habla sin necesidad de dibujar ninguno. Igual que en Mensajes. */
          mio ? 'rounded-br-md' : 'rounded-bl-md',
        ].join(' ')}
        style={{
          background: mio
            ? `color-mix(in srgb, ${colors.primary} 16%, ${colors.background})`
            : colors.surfaceElevated,
        }}
      >
        <ModelText texto={mensaje.text} />
      </div>

      <span className="px-1 font-sans text-[11px] tabular-nums text-text-disabled">
        {HORA.format(new Date())}
      </span>
    </div>
  );
}
