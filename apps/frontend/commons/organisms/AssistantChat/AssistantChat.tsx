'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ASSISTANT_ATTACHMENT_ALLOWED_MIME,
  ASSISTANT_ATTACHMENT_MAX_BYTES,
  ASSISTANT_ATTACHMENT_MAX_PER_MESSAGE,
  type AssistantProposal,
  type AssistantQuota,
  formatoReinicio,
  isAssignmentProposal,
  isBoardProposal,
  isChartProposal,
  isCheckStepsProposal,
  isChecklistProposal,
  isCommentProposal,
  isDeleteProposal,
  isEditProposal,
  isMessageProposal,
  isMoveProposal,
  isQuestionProposal,
  isTaskProposal,
} from '../../api/assistant';
import { cargarConversacionAction, preguntarAction } from '../../assistant/actions';
import { Badge, Button, PRAX_NAME, PraxAvatar, type PraxMood } from '../../atoms';
import { alpha, colors } from '../../tokens';
import { useDock } from '../AppLayout/DockPanel';
import { ConversationHistory } from './ConversationHistory';
import { FlujoDePensamiento } from './FlujoDePensamiento';
import { ModelText } from './ModelText';
import {
  AccionDelLienzo,
  type AceptarGrafico,
  AssignProposalCard,
  BoardProposalCard,
  ChartProposalCard,
  ChecklistProposalCard,
  CommentProposalCard,
  DeleteProposalCard,
  EditProposalCard,
  MarkStepsProposalCard,
  MessageProposalCard,
  MoveProposalCard,
  QuestionProposalCard,
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
  /**
   * El proyecto del que se está hablando. **`null` mientras no se ha elegido.**
   *
   * ⚠️ Sin foco no se puede preguntar nada: el turno va a
   * `POST /projects/:id/assistant/chat`, que es donde el gateway comprueba
   * `canViewReports` y de donde sale el contexto. Así que con `null` la pantalla
   * no enseña compositor: enseña el recibimiento y los proyectos para elegir.
   */
  projectId: string | null;
  /**
   * Los proyectos entre los que se puede cambiar, ya filtrados por permiso.
   *
   * Hacen dos cosas: son los botones del recibimiento, y son los nombres con los
   * que el historial dice de qué iba cada conversación.
   */
  proyectos?: { id: string; name: string }[];
  /**
   * Cambiar de foco.
   *
   * ⚠️ **Lo gobierna quien monta esto, y navega.** Podría cambiarse aquí en
   * estado de cliente, y sería peor: el contexto que ve el modelo —miembros,
   * etiquetas, cuota— lo resuelve el servidor por proyecto, así que un cambio en
   * cliente dejaría la conversación hablando de un proyecto con los nombres del
   * otro. Navegando, el Server Component lo recalcula entero.
   *
   * Y el hilo **no se pierde al navegar** porque vive en la base: se recupera con
   * el `conversationId`, que por eso viaja de vuelta.
   */
  onElegirProyecto?: (projectId: string, conversationId: string | null) => void;
  /** La conversación a recuperar al montar. Viene de la URL. */
  conversacionInicial?: string | null;
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
   * - `pantalla` — sin tarjeta, ocupando el alto disponible, con el hilo
   *   desplazándose por dentro y el compositor abajo del todo. Es la de su propia
   *   zona, donde **la conversación es la pantalla**.
   * - `cajon` — como `pantalla` pero dentro de la columna lateral del armazón,
   *   con su propia aspa de cerrar. Es la de Análisis, desde que el chat dejó de
   *   ocupar sitio en una página cuyo trabajo es analizar.
   * - `panel` — una tarjeta con borde y alto acotado. **Ya no la usa nadie**: se
   *   queda porque es lo que hay que poner si algún día el chat vuelve a
   *   incrustarse en el cuerpo de una página, y borrarla y reescribirla más
   *   adelante cuesta más que dejarla.
   *
   * Es una prop y no tres componentes porque lo único que cambia es el
   * envoltorio: el hilo, las burbujas, las propuestas, el historial y la cuota
   * son idénticos. **Tres carcasas, un organismo** — en cuanto haya una cuarta
   * implementación del chat, empezarán a divergir y el próximo arreglo habrá que
   * hacerlo cuatro veces.
   */
  variante?: 'panel' | 'pantalla' | 'cajon';
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
  proyectos = [],
  onElegirProyecto,
  conversacionInicial = null,
  sugerenciaExterna = null,
  alAceptarGrafico,
  variante = 'panel',
}: AssistantChatProps) {
  /* Las dos variantes «altas» comparten toda la mecánica de alto y scroll; lo
     único propio del cajón es su cabecera con el aspa. */
  const aPantalla = variante === 'pantalla' || variante === 'cajon';
  const enCajon = variante === 'cajon';
  /* `projectId` → nombre, para que el historial diga de qué iba cada
     conversación sin abrirla. Se construye aquí y no en la page porque el
     historial es de esta pantalla, no del servidor. */
  /**
   * Empezar de cero: mismo proyecto, conversación nueva.
   *
   * No navega —el foco no cambia— así que basta con vaciar el estado. El hilo
   * anterior no se pierde: está guardado y sale en el historial.
   */
  const empezarDeCero = useCallback(() => {
    setConversationId(null);
    setMensajes([]);
    setError(null);
    setVista('chat');
  }, []);

  /**
   * Volver a elegir proyecto.
   *
   * Deja la pantalla como al entrar —sin foco, con los proyectos como botones—
   * navegando a la ruta sin `?p=`. Es lo que hace que la insignia del proyecto
   * sea un control y no un rótulo, y lo que hace verdad lo que PRAX responde
   * cuando le piden hablar de otro.
   *
   * ⚠️ Empieza conversación nueva a propósito: **no se arrastra el hilo**. Un
   * hilo que hablaba de un proyecto, continuado sobre otro, mezcla dos contextos
   * en la ventana del modelo — que es justo lo que el foco de uno en uno evita.
   * El anterior sigue en el historial.
   */
  const volverAElegirProyecto = useCallback(() => {
    onElegirProyecto?.('', null);
  }, [onElegirProyecto]);

  const nombresDeProyecto = useMemo(
    () => Object.fromEntries(proyectos.map((proyecto) => [proyecto.id, proyecto.name])),
    [proyectos],
  );
  /* El cajón lo gobierna el armazón, así que cerrar no es estado de este
     componente: se le pide a quien lo abrió. Fuera del armazón —o en las otras
     variantes— `dock` es `null` y el aspa ni se pinta. */
  const dock = useDock();
  const cerrarCajon = dock?.cerrar;
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  /**
   * Los archivos elegidos, ya leídos a base64.
   *
   * ⚠️ **Se leen al elegirlos y no al enviar.** Leer un fichero es asíncrono, y
   * hacerlo dentro del envío convertiría «pulsar enviar» en una espera muda de
   * medio segundo con un tamaño de 5 MB. Leídos antes, enviar es inmediato y los
   * errores de tamaño o de tipo salen **cuando se elige el archivo**, que es
   * cuando se puede corregir.
   *
   * No se guardan en ninguna parte: viajan con el turno y se descartan.
   */
  const [adjuntos, setAdjuntos] = useState<AdjuntoElegido[]>([]);

  const quitarAdjunto = useCallback((id: string) => {
    setAdjuntos((previos) => previos.filter((adjunto) => adjunto.id !== id));
  }, []);

  /**
   * Elegir archivos: se validan y se leen aquí mismo.
   *
   * Las tres comprobaciones son las mismas que hace el servidor, y se repiten
   * aquí por el motivo de siempre: **el mensaje llega antes y señala el
   * archivo**. La que manda sigue siendo la del backend.
   */
  const alElegirArchivos = useCallback(
    async (evento: React.ChangeEvent<HTMLInputElement>) => {
      const elegidos = Array.from(evento.target.files ?? []);
      /* El input se vacía siempre: si no, volver a elegir el mismo archivo no
         dispara `change` y parece que el clip se hubiera roto. */
      evento.target.value = '';
      if (elegidos.length === 0) return;

      const problemas: string[] = [];
      const nuevos: AdjuntoElegido[] = [];

      for (const archivo of elegidos) {
        if (adjuntos.length + nuevos.length >= ASSISTANT_ATTACHMENT_MAX_PER_MESSAGE) {
          problemas.push(
            `Solo caben ${ASSISTANT_ATTACHMENT_MAX_PER_MESSAGE} archivos por mensaje.`,
          );
          break;
        }

        const mime = mimeDeArchivo(archivo);
        if (!mime) {
          problemas.push(`«${archivo.name}»: PRAX solo lee PDF, imágenes, texto y Markdown.`);
          continue;
        }
        if (archivo.size > ASSISTANT_ATTACHMENT_MAX_BYTES) {
          problemas.push(
            `«${archivo.name}» pasa de ${enKilobytes(ASSISTANT_ATTACHMENT_MAX_BYTES)}.`,
          );
          continue;
        }

        try {
          nuevos.push({
            id: crypto.randomUUID(),
            name: archivo.name,
            mime,
            bytes: archivo.size,
            data: await aBase64(archivo),
          });
        } catch {
          problemas.push(`«${archivo.name}» no se pudo leer.`);
        }
      }

      if (nuevos.length > 0) setAdjuntos((previos) => [...previos, ...nuevos]);
      setError(problemas.length > 0 ? problemas.join(' ') : null);
    },
    [adjuntos.length],
  );
  /**
   * La conversación abierta. `null` significa «la siguiente pregunta abre una».
   *
   * No se guarda en `localStorage`: al recargar se empieza limpio y las de antes
   * están en la lista. Recuperar sola la última convertiría cada visita a
   * Reportes en la continuación de algo que a lo mejor ya estaba cerrado.
   */
  const [conversationId, setConversationId] = useState<string | null>(conversacionInicial ?? null);
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
  const archivoRef = useRef<HTMLInputElement>(null);
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
    const conversacion = await cargarConversacionAction(id);
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

    /**
     * 🔴 **Recuperar el foco, o el hilo se abre y no se puede continuar.**
     *
     * Sin esto, abrir una conversación vieja desde el historial dejaba la
     * pantalla sin proyecto —y por tanto **sin compositor**: se leía el hilo y no
     * había dónde escribir. Parecía que el historial fuera de solo lectura.
     *
     * Solo se navega si el proyecto **cambia**: si ya se estaba en el suyo, una
     * navegación de más recargaría la página para dejarla igual, y de paso
     * perdería el hilo que se acaba de pintar aquí.
     */
    if (conversacion.projectId && conversacion.projectId !== projectId) {
      onElegirProyecto?.(conversacion.projectId, conversacion.id);
    }
  }

  async function enviar(pregunta: string) {
    const limpio = pregunta.trim();
    /* ⚠️ Con archivos, un mensaje vacío es legítimo: adjuntar y enviar es
       «mira esto». Sin ellos sigue haciendo falta texto. */
    if ((!limpio && adjuntos.length === 0) || pendiente || agotada) return;

    /* Sin foco no hay a dónde mandar el turno. No debería llegar aquí —sin él no
       se pinta el compositor— pero el estrechamiento de tipos lo pide. Va antes
       de tocar el estado: salir después dejaría el mensaje pintado en el hilo y
       el campo vacío, o sea la pregunta perdida. */
    if (!projectId) return;

    /* Lo que se pinta en la burbuja: el texto, y si no lo hay, los nombres de
       los archivos — una burbuja vacía se lee como un fallo. */
    const enviados = adjuntos;
    const textoDeLaBurbuja =
      limpio || enviados.map((adjunto) => adjunto.name).join(', ') || '(archivo)';

    const mio: Mensaje = { id: crypto.randomUUID(), role: 'user', text: textoDeLaBurbuja };

    setMensajes((previos) => [...previos, mio]);
    setTexto('');
    setAdjuntos([]);
    setError(null);
    setPendiente(true);

    const respuesta = await preguntarAction(
      projectId,
      limpio,
      conversationId ?? undefined,
      enviados.map((adjunto) => ({
        name: adjunto.name,
        mime: adjunto.mime,
        data: adjunto.data,
      })),
    );

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
      /* Los archivos vuelven también: obligar a volver a elegirlos tras un fallo
         de red es el peor momento para pedirle nada a nadie. */
      setAdjuntos(enviados);
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
              `flex min-h-0 flex-1 flex-col gap-4 ${enCajon ? 'p-4' : ''}`
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
              {/**
               * El proyecto en foco, como insignia **y como botón**.
               *
               * ⚠️ Sustituye a la frase que había aquí —«Lee los datos del
               * proyecto y responde con sus números…»— que era un pie de manual:
               * decía lo mismo en cada visita y nunca cambiaba, así que se dejaba
               * de leer a la segunda vez y ocupaba el sitio más visible de la
               * cabecera.
               *
               * Lo que sí hace falta ahí es **de qué se está hablando**, porque
               * en una conversación con foco cambiable eso no puede depender de
               * acordarse. Y como se puede cambiar, la insignia es el propio
               * control: pulsarla vuelve al recibimiento, donde están los
               * proyectos. Es además lo que hace verdad lo que PRAX dice cuando
               * le piden otro proyecto — ver la regla del prompt.
               */}
              {vista === 'chat' && projectId && (
                <button
                  type="button"
                  onClick={volverAElegirProyecto}
                  title="Cambiar de proyecto"
                  className="flex max-w-full items-center gap-1.5 self-start rounded-full py-1 pl-2.5 pr-2 font-sans text-xs transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  style={{
                    background: alpha(colors.primary, 12),
                    color: colors.primary,
                    boxShadow: `inset 0 0 0 1px ${alpha(colors.primary, 25)}`,
                  }}
                >
                  <span className="truncate font-medium">
                    {nombresDeProyecto[projectId] ?? 'Este proyecto'}
                  </span>
                  <svg
                    className="h-3 w-3 shrink-0 opacity-70"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}

              {vista === 'historial' && (
                <p className="font-sans text-sm text-text-secondary">
                  Tus conversaciones. Abre una para seguir donde la dejaste.
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/**
             * ⚠️ **El contador de mensajes se ha quitado de aquí.**
             *
             * Estaba en la esquina, permanente, contando «13 / 250». Y aunque el
             * número sea generoso, un contador siempre visible convierte cada
             * pregunta en un gasto: se piensa dos veces antes de escribir, que es
             * exactamente lo contrario de lo que se quiere de un asistente con el
             * que hay que conversar para que sirva.
             *
             * El límite **no desaparece**: cuando de verdad se agota, el aviso
             * sustituye al compositor y dice cuándo vuelve. Es el momento en que
             * esa información sirve para algo, y el único.
             */}
            {/**
             * Iconos y no texto: la cabecera ya lleva el nombre, la insignia «AI»
             * y la del proyecto, y dos palabras más la volvían una fila de cosas
             * que leer. Lo que se pierde —saber a qué lleva sin pasar por encima—
             * se recupera con el `title`, y el nombre accesible va completo.
             */}
            {/* Conversación nueva. Solo en el chat: en el historial ya hay un
                botón para lo mismo, con su texto y sin competir por sitio. */}
            {vista === 'chat' && (
              <button
                type="button"
                onClick={empezarDeCero}
                aria-label="Empezar una conversación nueva"
                title="Conversación nueva"
                disabled={mensajes.length === 0}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-text-secondary transition-colors enabled:hover:bg-surface-elevated enabled:hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                style={{ borderColor: colors.border }}
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20 11.5c0 3.9-3.6 7-8 7-.9 0-1.8-.1-2.6-.4L5 19.5l1.2-3.1A6.6 6.6 0 014 11.5c0-3.9 3.6-7 8-7s8 3.1 8 7z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.8v5.4M9.3 11.5h5.4" />
                </svg>
              </button>
            )}
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
            nombresDeProyecto={nombresDeProyecto}
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
                                projectId={projectId ?? ''}
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
                                projectId={projectId ?? ''}
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
                                projectId={projectId ?? ''}
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
                                projectId={projectId ?? ''}
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
                                projectId={projectId ?? ''}
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
                                projectId={projectId ?? ''}
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
                                projectId={projectId ?? ''}
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
                                projectId={projectId ?? ''}
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
                          /* Preguntar no propone ningún cambio, así que ninguna
                           de las guardas de abajo la reclama: el orden aquí solo
                           ahorra recorrerlas. */
                          if (isBoardProposal(propuesta)) {
                            return (
                              <BoardProposalCard
                                key={propuesta.id ?? `${mensaje.id}-${indice}`}
                                projectId={projectId ?? ''}
                                proposalId={propuesta.id}
                                estadoGuardado={propuesta.status}
                                propuesta={propuesta.args}
                                nombres={nombres}
                                etiquetas={etiquetas}
                              />
                            );
                          }
                          if (isQuestionProposal(propuesta)) {
                            return (
                              <QuestionProposalCard
                                key={propuesta.id ?? `${mensaje.id}-${indice}`}
                                projectId={projectId ?? ''}
                                proposalId={propuesta.id}
                                estadoGuardado={propuesta.status}
                                propuesta={propuesta.args}
                                nombres={nombres}
                                etiquetas={etiquetas}
                                /* Responder es mandar un turno más, no llamar a
                                 ningún endpoint. Ver `QuestionProposalCard`. */
                                onResponder={enviar}
                              />
                            );
                          }
                          if (isDeleteProposal(propuesta)) {
                            return (
                              <DeleteProposalCard
                                key={propuesta.id ?? `${mensaje.id}-${indice}`}
                                projectId={projectId ?? ''}
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
                                projectId={projectId ?? ''}
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
                      {projectId ? 'Pregúntame por este proyecto' : `Hola, soy ${PRAX_NAME}`}
                    </p>
                    <p className="font-serif text-base italic text-text-secondary">
                      {projectId
                        ? 'Sé qué hay en cada tablero, quién lleva qué y cómo va el ritmo. Puedo responder con esos números, y también preparar el trabajo que salga de hablarlo.'
                        : '¿Hay algún proyecto en concreto sobre el que quieras que miremos? Elige uno y te cuento cómo va.'}
                    </p>
                  </div>

                  {/**
                   * Con foco, preguntas de arranque. Sin foco, **los proyectos**.
                   *
                   * Es el mismo gesto —pulsar en vez de escribir— y por eso
                   * comparten sitio: lo primero que hace falta decidir no es qué
                   * preguntar, es de qué proyecto. Elegir aquí navega, y el
                   * contexto lo recalcula el servidor (ver `onElegirProyecto`).
                   */}
                  <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                    {projectId
                      ? SUGERENCIAS.map((sugerencia) => (
                          <Sugerencia
                            key={sugerencia}
                            texto={sugerencia}
                            agotada={agotada}
                            onElegir={enviar}
                          />
                        ))
                      : proyectos.map((proyecto) => (
                          <button
                            key={proyecto.id}
                            type="button"
                            onClick={() => onElegirProyecto?.(proyecto.id, conversationId)}
                            className="rounded-full border border-border px-4 py-2 font-sans text-sm text-text-secondary transition-colors hover:border-primary hover:bg-surface-elevated hover:text-text-primary"
                          >
                            {proyecto.name}
                          </button>
                        ))}
                  </div>

                  {/* Sin proyectos que ofrecer, decirlo: unos botones que no
                      salen dejan la pantalla con un saludo y nada debajo. */}
                  {!projectId && proyectos.length === 0 && (
                    <p className="max-w-md font-sans text-sm text-text-disabled">
                      No hay ningún proyecto cuyo análisis puedas abrir, así que todavía no tengo
                      datos de los que hablar.
                    </p>
                  )}
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

            {/**
             * ⚠️ **Sin foco no hay compositor**, y no es una restricción
             * cosmética: el turno va a `POST /projects/:id/assistant/chat`, que
             * es donde el gateway comprueba el permiso y de donde sale el
             * contexto. Un campo de texto que no puede mandar nada es peor que
             * ninguno — invita a escribir para después decir que no.
             */}
            {!projectId ? null : agotada && cuota ? (
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

                {/* Los adjuntos elegidos, encima del campo. Cada uno con su aspa:
                    equivocarse de archivo es lo más fácil que hay, y volver a
                    abrir el selector para corregirlo sería absurdo. */}
                {adjuntos.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {adjuntos.map((adjunto) => (
                      <li
                        key={adjunto.id}
                        className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5"
                        style={{ background: colors.surfaceElevated }}
                      >
                        <span className="max-w-48 truncate font-sans text-xs text-text-primary">
                          {adjunto.name}
                        </span>
                        <span className="shrink-0 font-sans text-[11px] text-text-disabled">
                          {enKilobytes(adjunto.bytes)}
                        </span>
                        <button
                          type="button"
                          onClick={() => quitarAdjunto(adjunto.id)}
                          aria-label={`Quitar ${adjunto.name}`}
                          className="shrink-0 rounded text-text-disabled transition-colors hover:text-error"
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/**
                 * El compositor, con la misma forma que el de Mensajes.
                 *
                 * ⚠️ **Los botones van DENTRO del campo**, no al lado. Estaba
                 * fuera, con un «Preguntar» de 70 px de alto pegado a la derecha,
                 * y eso hacía dos cosas mal: se comía el ancho del campo —que es
                 * lo que de verdad se usa— y no se parecía en nada al compositor
                 * del chat de equipo, aunque el gesto sea idéntico.
                 *
                 * `items-end` para que, al crecer el textarea, los botones se
                 * queden abajo con el cursor en vez de subir con el borde.
                 */}
                <div
                  className="flex items-end gap-2 rounded-xl border border-border-strong p-2 shadow-sm transition-colors focus-within:border-primary"
                  style={{ background: colors.surfaceElevated }}
                >
                  <textarea
                    ref={campoRef}
                    id={campoId}
                    rows={1}
                    maxLength={2000}
                    value={texto}
                    disabled={pendiente}
                    placeholder="Pregúntale a PRAX…"
                    onChange={(evento) => setTexto(evento.target.value)}
                    onKeyDown={(evento) => {
                      /* Enter envía, Mayús+Enter parte la línea: es lo que hace
                         cualquier chat, y `requestSubmit` respeta la validación
                         del formulario en vez de saltársela. */
                      if (evento.key === 'Enter' && !evento.shiftKey) {
                        evento.preventDefault();
                        evento.currentTarget.form?.requestSubmit();
                      }
                    }}
                    /* Crece con el contenido hasta un tope, como el de Mensajes:
                       una línea para una pregunta corta, y sitio si hace falta. */
                    onInput={(evento) => {
                      const area = evento.currentTarget;
                      area.style.height = 'auto';
                      area.style.height = `${Math.min(area.scrollHeight, 160)}px`;
                    }}
                    className="max-h-40 min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 font-sans text-sm text-text-primary outline-none placeholder:text-text-disabled disabled:cursor-not-allowed"
                  />

                  <button
                    type="button"
                    onClick={() => archivoRef.current?.click()}
                    disabled={pendiente || adjuntos.length >= ASSISTANT_ATTACHMENT_MAX_PER_MESSAGE}
                    aria-label="Adjuntar un archivo"
                    title={
                      adjuntos.length >= ASSISTANT_ATTACHMENT_MAX_PER_MESSAGE
                        ? `Máximo ${ASSISTANT_ATTACHMENT_MAX_PER_MESSAGE} archivos`
                        : 'Adjuntar archivo'
                    }
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors enabled:hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
                      />
                    </svg>
                  </button>

                  {/* Escondido: lo abre el clip. Las extensiones además de los
                      tipos, porque el selector de algunos sistemas no reconoce
                      `text/markdown` y dejaba los `.md` en gris. */}
                  <input
                    ref={archivoRef}
                    type="file"
                    multiple
                    accept={`${ASSISTANT_ATTACHMENT_ALLOWED_MIME.join(',')},.md,.markdown,.txt`}
                    onChange={alElegirArchivos}
                    className="hidden"
                  />

                  <button
                    type="submit"
                    disabled={pendiente || (texto.trim().length === 0 && adjuntos.length === 0)}
                    aria-label="Enviar"
                    title="Enviar"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: alpha(colors.primary, 22), color: colors.primary }}
                  >
                    {pendiente ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 12h14M13 6l6 6-6 6"
                        />
                      </svg>
                    )}
                  </button>
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
 * ⚠️ **Y tampoco lleva hora.** La llevó, y estaba mal: se calculaba al pintar
 * (`new Date()`), así que en un mensaje recién enviado era exacta y al releer una
 * conversación de hace tres días **enseñaba la hora de ahora** en todas las
 * burbujas. Un dato que miente es peor que ningún dato.
 *
 * Ponerla bien es posible —`createdAt` existe en la base— pero no llega hasta
 * aquí: `StoredMessage` lo trae y el estado del chat lo descarta al construir sus
 * `Mensaje`. Cuando haga falta, el arreglo es propagarlo; mientras tanto, nada.
 */
function Burbuja({ mensaje }: { mensaje: Mensaje }) {
  const mio = mensaje.role === 'user';

  return (
    <div className={`flex flex-col gap-1 ${mio ? 'items-end' : 'items-start'}`}>
      <div
        className={[
          /* `flex flex-col gap-2` y no `whitespace-pre-wrap`: desde que
             `ModelText` devuelve bloques —párrafos, listas, código— el salto de
             línea lo pone el propio bloque. Manteniendo los dos, cada párrafo
             quedaba separado dos veces. */
          'flex max-w-[85%] min-w-0 flex-col gap-2 rounded-2xl px-3.5 py-2 font-sans text-sm leading-relaxed text-text-primary',
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
    </div>
  );
}

/* ─── Adjuntos ────────────────────────────────────────────────────────────── */

/** Un archivo ya elegido y leído, esperando a enviarse. */
interface AdjuntoElegido {
  id: string;
  name: string;
  mime: string;
  /** Tamaño real del archivo, para enseñarlo y para comprobar el tope. */
  bytes: number;
  /** Contenido en base64, sin el prefijo `data:`. */
  data: string;
}

/**
 * El tipo del archivo, o `null` si PRAX no sabe leerlo.
 *
 * ⚠️ **No basta con `file.type`.** El navegador lo deduce de la extensión con una
 * tabla que varía entre sistemas, y para `.md` devuelve cadena vacía en Windows y
 * `text/markdown` en macOS. Sin la caída por extensión, un `.md` se rechazaba en
 * unas máquinas y en otras no — el peor tipo de fallo, porque no se reproduce.
 */
function mimeDeArchivo(archivo: File): string | null {
  const declarado = archivo.type;
  if ((ASSISTANT_ATTACHMENT_ALLOWED_MIME as readonly string[]).includes(declarado)) {
    return declarado;
  }

  const nombre = archivo.name.toLowerCase();
  if (nombre.endsWith('.md') || nombre.endsWith('.markdown')) return 'text/markdown';
  if (nombre.endsWith('.txt')) return 'text/plain';
  return null;
}

/**
 * De `File` a base64, sin el prefijo `data:`.
 *
 * `FileReader` y no `arrayBuffer()` + `btoa`: aquel recorre el búfer byte a byte
 * en JavaScript y con 5 MB bloquea el hilo principal medio segundo. Este lo hace
 * el navegador, fuera del hilo.
 */
function aBase64(archivo: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onerror = () => rechazar(lector.error);
    lector.onload = () => {
      const resultado = String(lector.result);
      /* `readAsDataURL` devuelve `data:<mime>;base64,<datos>`; el servidor espera
         solo la última parte. */
      resolver(resultado.slice(resultado.indexOf(',') + 1));
    };
    lector.readAsDataURL(archivo);
  });
}

/** `1536` → `1,5 kB`. Para que el tamaño de un adjunto se lea de un vistazo. */
function enKilobytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
