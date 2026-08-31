'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ASSISTANT_ATTACHMENT_ACCEPT,
  ASSISTANT_ATTACHMENT_ALLOWED_MIME,
  ASSISTANT_ATTACHMENT_MAX_BYTES,
  ASSISTANT_ATTACHMENT_MAX_PER_MESSAGE,
  type AssistantAttachment,
  type AssistantProposal,
  type AssistantQuota,
  type ConversationSummary,
  assistantAttachmentHref,
  esImagenDeAsistente,
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
  isOpenProjectProposal,
  isQuestionProposal,
  isTaskProposal,
  isTemplateProposal,
} from '../../api/assistant';
import {
  cargarConversacionAction,
  conversacionesAction,
  preguntarAction,
} from '../../assistant/actions';
import { Badge, Button, PRAX_NAME, PraxAvatar, type PraxMood } from '../../atoms';
import { alpha, colors } from '../../tokens';
import { useDock } from '../AppLayout/DockPanel';
import { usePrax } from '../AppLayout/PraxContext';
import { AmpliarPlan } from './AmpliarPlan';
import { AjustesMenu, ModeloSelector } from './ComposerControls';
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
  OpenProjectProposalCard,
  QuestionProposalCard,
  TaskProposalCard,
  TemplateProposalCard,
} from './ProposalCard';
import { ProposalGroup } from './ProposalGroup';

interface Mensaje {
  id: string;
  role: 'user' | 'model';
  text: string;
  /** Solo en los del asistente. Cada una se pinta como tarjeta debajo. */
  proposals?: AssistantProposal[];
  /**
   * Solo en los del usuario: PRAX responde texto y propuestas, nunca archivos.
   *
   * Vienen vacíos en los hilos anteriores a que los adjuntos se guardaran —
   * entonces viajaban con la pregunta y se descartaban, así que hay
   * conversaciones viejas donde PRAX comenta un documento del que no queda nada.
   */
  attachments?: AssistantAttachment[];
  /**
   * Solo en los del asistente: esta burbuja **no la escribió el modelo**.
   *
   * 🔴 **PRAX tiene que contestar siempre, también cuando no puede pensar.**
   * Antes, un fallo de Gemini borraba la pregunta del hilo, la devolvía al
   * campo de texto y dejaba una línea roja debajo del compositor. Visto desde
   * fuera eso no se lee como «el proveedor está saturado»: se lee como que
   * escribir a PRAX no hace nada — y con «Hola» de primer mensaje, como que el
   * asistente no funciona en absoluto.
   *
   * Con esta marca la pregunta se queda donde estaba, la explicación aparece
   * en su sitio —una burbuja de PRAX— y el reintento es un botón, no volver a
   * escribirlo todo. No se guarda en el hilo: al recargar no está, porque de
   * verdad no pasó nada.
   */
  degradado?: boolean;
}

export interface AssistantChatProps {
  /**
   * El nombre de pila de quien pregunta, solo para el saludo de la pantalla
   * vacía. **Opcional a propósito**: el cajón de Análisis no lo pasa, y ahí el
   * saludo no se ve nunca porque la conversación abre con el proyecto puesto.
   */
  userName?: string;
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
   * El proxy del gateway de la zona que monta esto: `/assistant/api/gateway`,
   * `/reports/api/gateway`.
   *
   * ⚠️ **Los adjuntos no pueden ir por una Server Action y por eso hace falta.**
   * Subir un archivo va por `fetch` multipart desde el navegador, y tiene que
   * salir hacia el **propio origen**: el JWT vive en una cookie `httpOnly` que
   * no se manda a `localhost:3000`, así que apuntar al gateway directo daría
   * 401. Es también de donde cuelgan las descargas de las burbujas.
   */
  gatewayPath: string;
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
  onElegirProyecto?: (
    projectId: string,
    conversationId: string | null,
    /** El slug, cuando el proyecto es tan nuevo que la pantalla no lo conoce. */
    slug?: string,
  ) => void;
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
   *   adelante cuesta más que dejarla.
   *
   * Es una prop y no tres componentes porque lo único que cambia es el
   * envoltorio: el hilo, las burbujas, las propuestas, el historial y la cuota
   * son idénticos. **Tres carcasas, un organismo** — en cuanto haya una cuarta
   * implementación del chat, empezarán a divergir y el próximo arreglo habrá que
   * hacerlo cuatro veces.
   */
  /**
   * - `panel` — tarjeta con borde, para incrustar en una página.
   * - `pantalla` — ocupa el alto, la conversación **es** la pantalla (zona
   *   `/assistant`).
   * - `cajon` — como `pantalla`, dentro de la columna lateral del armazón
   *   (Análisis).
   * - `flotante` — dentro de la ventana arrastrable de PRAX global
   *   (`PraxWindow`). Como `pantalla` en mecánica, con cabecera propia: el
   *   nombre a la izquierda con desplegable de conversaciones recientes, y a la
   *   derecha nueva conversación, cambio de modo y cerrar.
   */
  variante?: 'panel' | 'pantalla' | 'cajon' | 'flotante';
  /** Oculta el botón de historial, usado cuando no queremos que el usuario recupere conversaciones anteriores en un contexto específico. */
  sinHistorial?: boolean;
  /**
   * La organización activa. Solo la usa el menú de ajustes del compositor —el
   * submenú «Recursos» lista sus proyectos—. Ausente = se leen los recursos de
   * «sin-org».
   */
  organizacionActivaId?: string | null;
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
  gatewayPath,
  cuotaInicial,
  nombres,
  etiquetas,
  proyectos = [],
  onElegirProyecto,
  conversacionInicial = null,
  sugerenciaExterna = null,
  alAceptarGrafico,
  variante = 'panel',
  sinHistorial = false,
  userName,
  organizacionActivaId = null,
}: AssistantChatProps) {
  /* Las variantes «altas» comparten toda la mecánica de alto y scroll; lo que
     cambia es la carcasa y la cabecera. */
  const aPantalla = variante === 'pantalla' || variante === 'cajon' || variante === 'flotante';
  const enCajon = variante === 'cajon';
  const esFlotante = variante === 'flotante';
  /* `projectId` → nombre, para que el historial diga de qué iba cada
     conversación sin abrirla. Se construye aquí y no en la page porque el
     historial es de esta pantalla, no del servidor. */
  /**
   * Conversación nueva.
   *
   * ⚠️ **Vuelve a preguntar por el proyecto**, no se queda en el actual. Desde
   * que una conversación es sobre un proyecto y no cambia, «empezar otra» es
   * justo el momento —el único— en que se puede elegir otro. Quedarse en el de
   * antes obligaría a salir de la pantalla para cambiar.
   *
   * El hilo anterior no se pierde: está guardado y sale en el historial.
   */
  const empezarDeCero = useCallback(() => {
    setConversationId(null);
    setMensajes([]);
    setError(null);
    setVista('chat');
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
  /* PRAX global: solo se usa en la variante `flotante` —cambiar de modo y
     cerrar la ventana—. `null` en el resto de variantes. */
  const prax = usePrax();
  /** Las últimas conversaciones, para el desplegable del nombre (solo `flotante`). */
  const [recientes, setRecientes] = useState<ConversationSummary[]>([]);
  const [menuRecientes, setMenuRecientes] = useState(false);
  const [menuModo, setMenuModo] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  /**
   * Los archivos del mensaje que se está escribiendo.
   *
   * ## ⚠️ Se suben al elegirlos, no al enviar
   *
   * 🔴 **Antes se leían a base64 y viajaban dentro de la pregunta, y eso no
   * funcionaba.** La pregunta va por una Server Action, cuyo cuerpo está topado
   * en 1 MB: cualquier foto de teléfono moría con un «Body exceeded 1 MB limit»
   * de Next —un error sin traducir, que no dice qué archivo y que ni siquiera
   * llega a nuestro código para poder explicarlo—. Y cuando sí cabía, el archivo
   * se descartaba después del turno: PRAX citaba el documento y en el hilo no
   * quedaba ni rastro.
   *
   * Ahora cada archivo se sube en cuanto se elige, por `fetch` multipart al
   * proxy de la zona, y queda como borrador con su id. Enviar solo manda ids, y
   * es instantáneo. De paso, el error de tipo o de tamaño sale **cuando se elige
   * el archivo**, que es cuando se puede corregir.
   */
  const [adjuntos, setAdjuntos] = useState<AdjuntoElegido[]>([]);

  /** Con alguno a medio subir, enviar mandaría un mensaje sin sus archivos. */
  const subiendo = adjuntos.some((adjunto) => adjunto.id === null);

  const quitarAdjunto = useCallback(
    (localId: string) => {
      setAdjuntos((previos) => {
        const fuera = previos.find((adjunto) => adjunto.localId === localId);
        /* El borrador sube ocupando sitio en el servidor: quitarlo del chip sin
           avisar dejaría el archivo colgando para siempre. No se espera a la
           respuesta —el chip tiene que desaparecer al pulsar— y si falla, el
           borrador queda huérfano, que es basura y no un error. */
        if (fuera?.id) {
          void fetch(`${gatewayPath}/me/assistant/attachments/${fuera.id}`, { method: 'DELETE' });
        }
        return previos.filter((adjunto) => adjunto.localId !== localId);
      });
    },
    [gatewayPath],
  );

  /**
   * Elegir archivos: se validan, se pintan y se suben.
   *
   * Las tres comprobaciones son las mismas que hace el servidor, y se repiten
   * aquí por el motivo de siempre: **el mensaje llega antes y señala el
   * archivo**. La que manda sigue siendo la del backend.
   *
   * ⚠️ El chip aparece **antes** de que la subida termine, con su indicador de
   * progreso. Esperar a la respuesta para pintarlo dejaría un par de segundos en
   * los que elegir un archivo no hace nada visible, que es como se acaba
   * pulsando el clip tres veces.
   */
  const alElegirArchivos = useCallback(
    async (evento: React.ChangeEvent<HTMLInputElement>) => {
      const elegidos = Array.from(evento.target.files ?? []);
      /* El input se vacía siempre: si no, volver a elegir el mismo archivo no
         dispara `change` y parece que el clip se hubiera roto. */
      evento.target.value = '';
      if (elegidos.length === 0) return;

      const problemas: string[] = [];
      const nuevos: { local: AdjuntoElegido; archivo: File }[] = [];

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
        if (archivo.size === 0) {
          problemas.push(`«${archivo.name}» está vacío.`);
          continue;
        }

        nuevos.push({
          local: {
            localId: crypto.randomUUID(),
            id: null,
            name: archivo.name,
            mime,
            bytes: archivo.size,
          },
          archivo,
        });
      }

      setError(problemas.length > 0 ? problemas.join(' ') : null);
      if (nuevos.length === 0) return;

      setAdjuntos((previos) => [...previos, ...nuevos.map((nuevo) => nuevo.local)]);

      await Promise.all(
        nuevos.map(async ({ local, archivo }) => {
          const subido = await subirAdjunto(gatewayPath, archivo);
          if (subido.id) {
            setAdjuntos((previos) =>
              previos.map((adjunto) =>
                adjunto.localId === local.localId ? { ...adjunto, id: subido.id } : adjunto,
              ),
            );
            return;
          }

          /* Sin id no hay archivo, así que el chip se va: dejarlo puesto en rojo
             invitaría a enviar creyendo que algo va dentro. El motivo se dice
             arriba, junto al compositor. */
          setAdjuntos((previos) => previos.filter((adjunto) => adjunto.localId !== local.localId));
          setError(`«${local.name}»: ${subido.error}`);
        }),
      );
    },
    [adjuntos.length, gatewayPath],
  );
  /**
   * La conversación abierta. `null` significa «la siguiente pregunta abre una».
   *
   * No se guarda en `localStorage`: al recargar se empieza limpio y las de antes
   * están en la lista. Recuperar sola la última convertiría cada visita a
   * Reportes en la continuación de algo que a lo mejor ya estaba cerrado.
   *
   * ⚠️ Lo que **sí** se recupera es la de la URL, y con sus mensajes: ver el
   * efecto que hay junto a `cargar`.
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
  /**
   * ¿Todavía no se ha dicho nada en esta conversación?
   *
   * Es lo que decide si el foco se puede soltar: sin turnos no hay contexto que
   * mezclar, así que cambiar de proyecto no cuesta nada. Mira **las dos cosas**
   * a propósito — un hilo recuperado de la URL tiene `conversationId` antes de
   * que sus mensajes lleguen, y con solo `mensajes.length` el aspa parpadearía
   * durante esa carga.
   */
  const enBlanco = mensajes.length === 0 && conversationId === null;
  const [texto, setTexto] = useState('');
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * El turno que se puede volver a mandar tal cual, si el último falló.
   *
   * Guarda **los tres datos que hacen falta para que reintentar no duplique
   * nada**: el texto, la burbuja de la pregunta y la del aviso. Al reintentar se
   * quitan las dos y se vuelve a enviar, así que el hilo queda como si el fallo
   * no hubiera ocurrido — que es justo lo que la persona espera de un botón que
   * dice «Reintentar».
   */
  const [reintento, setReintento] = useState<{
    texto: string;
    preguntaId: string;
    avisoId: string;
  } | null>(null);
  const [cuota, setCuota] = useState<AssistantQuota | null>(cuotaInicial);

  const hiloRef = useRef<HTMLDivElement>(null);
  const seccionRef = useRef<HTMLElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const campoId = useId();

  /** Abre el selector de archivos, con `accept` de imagen o el general. */
  const abrirSelector = useCallback((soloImagenes: boolean) => {
    const el = archivoRef.current;
    if (!el) return;
    el.accept = soloImagenes
      ? 'image/png,image/jpeg,image/webp,image/gif'
      : ASSISTANT_ATTACHMENT_ACCEPT;
    el.click();
  }, []);

  /** Mete un fragmento en el cursor del campo y devuelve el foco. */
  const insertarEnCampo = useCallback((fragmento: string) => {
    const el = campoRef.current;
    if (!el) return;
    const inicio = el.selectionStart ?? el.value.length;
    const fin = el.selectionEnd ?? el.value.length;
    const nuevo = `${el.value.slice(0, inicio)}${fragmento}${el.value.slice(fin)}`;
    setTexto(nuevo);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = inicio + fragmento.length;
      el.setSelectionRange(cursor, cursor);
    });
  }, []);

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

  useEffect(() => {
    function onPraxSugerencia(e: CustomEvent<string>) {
      setVista('chat');
      setTexto(e.detail);
      seccionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      campoRef.current?.focus();
    }
    window.addEventListener('prax-sugerencia', onPraxSugerencia as EventListener);
    return () => window.removeEventListener('prax-sugerencia', onPraxSugerencia as EventListener);
  }, []);

  const agotada = cuota !== null && cuota.usados >= cuota.limite;

  /**
   * Al fondo: en un hilo, lo último es lo que importa.
   *
   * Suelto de su `useEffect` porque tiene **dos disparadores** y ninguno sabe
   * del otro: cada turno, y cada paso que descubre `FlujoDePensamiento`. Los
   * pasos crecen hacia abajo mientras el hilo está quieto, así que sin esto el
   * tercero acaba escrito por debajo del borde y parece que no pasa nada.
   */
  const irAlFondo = useCallback(() => {
    hiloRef.current?.scrollTo({ top: hiloRef.current.scrollHeight, behavior: 'smooth' });
  }, []);

  /**
   * Depende de la **longitud** y no del array: las tarjetas de propuesta guardan
   * su propio estado, y reaccionar al contenido volvería a bajar el hilo cada
   * vez que alguien acepta una, justo cuando está leyendo el resultado.
   */
  useEffect(() => {
    irAlFondo();
  }, [mensajes.length, pendiente, irAlFondo]);

  /* Las recientes para el desplegable del nombre (variante `flotante`). Se
     refrescan al montar y cada vez que cambia la conversación abierta, así una
     nueva sube a la lista. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: `conversationId` es disparador, no se usa en el cuerpo.
  useEffect(() => {
    if (!esFlotante) return;
    let vivo = true;
    conversacionesAction().then((lista) => {
      if (vivo) setRecientes(lista);
    });
    return () => {
      vivo = false;
    };
  }, [esFlotante, conversationId]);

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
        /* Condicional y no `?? []`: con `exactOptionalPropertyTypes`, asignar
           `undefined` a un campo opcional es un error de tipos. */
        ...(mensaje.attachments ? { attachments: mensaje.attachments } : {}),
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

  /**
   * 🔴 **La conversación de la URL, al montar.**
   *
   * Sin esto, recargar sobre `?c=<id>` dejaba la pantalla **mintiendo entera**:
   * la URL seguía siendo la de la conversación, la insignia seguía diciendo de
   * qué proyecto se hablaba… y el hilo salía vacío, con el recibimiento de una
   * conversación nueva. No se pedían los mensajes: `conversacionInicial` solo
   * sembraba el `conversationId`, así que el estado decía «estás dentro de esta
   * conversación» y la pantalla enseñaba «no has empezado ninguna». Escribir
   * entonces continuaba el hilo de verdad, y la respuesta aparecía encima de un
   * historial invisible.
   *
   * Es el precio de tener el hilo en la URL y en la base a la vez: navegar lo
   * traía porque el clic del historial llamaba a `cargar`, pero **recargar no
   * pasa por ningún clic**.
   *
   * Se dispara una sola vez, contra el valor con el que se montó: `cargar` deja
   * el `conversationId` puesto, así que depender de él lo repetiría en bucle. Y
   * no se toca si ya hay mensajes en pantalla —el caso del cajón de Análisis,
   * que se cierra y se abre sin desmontar.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: se corre al montar y solo con el id de la URL; `cargar` cambia en cada render y `conversationId` lo escribe ella misma.
  useEffect(() => {
    if (!conversacionInicial) return;
    void cargar(conversacionInicial);
  }, [conversacionInicial]);

  /**
   * Volver a mandar el turno que falló, sin que quede rastro del intento.
   *
   * Se quitan la pregunta y el aviso antes de reenviar: `enviar` vuelve a
   * pintar la pregunta, y dejar las de antes las duplicaría. Los archivos ya
   * están de vuelta en el compositor desde el fallo, así que van solos.
   */
  function reintentar() {
    if (!reintento || pendiente) return;
    const { texto: pregunta, preguntaId, avisoId } = reintento;
    setReintento(null);
    setMensajes((previos) =>
      previos.filter((mensaje) => mensaje.id !== preguntaId && mensaje.id !== avisoId),
    );
    void enviar(pregunta);
  }

  async function enviar(pregunta: string) {
    const limpio = pregunta.trim();
    /**
     * ⚠️ **Un archivo solo no basta: hay que decir qué se quiere de él.**
     *
     * Se probó al revés —adjuntar y enviar como «mira esto»— y el backend lo
     * rechazaba con un «Validation failed» que no dice nada: el DTO exige
     * `message`, y con razón. Un PDF sin pregunta obliga a PRAX a adivinar si lo
     * resume, lo critica o saca tareas de él, y acierta poco.
     *
     * El aviso se da aquí, con el nombre de lo que falta, en vez de dejar que
     * salga el 400.
     */
    if (!limpio && adjuntos.length > 0) {
      setError('Escribe qué quieres que haga PRAX con el archivo.');
      campoRef.current?.focus();
      return;
    }
    if (!limpio || pendiente || agotada) return;
    /* Con una subida en vuelo, el turno saldría sin ese archivo y PRAX
       respondería a medias sobre algo que la burbuja sí enseña. */
    if (subiendo) return;

    /**
     * Los que llegaron a subirse.
     *
     * ⚠️ Aquí ya no hay ninguno a medio subir: el botón está deshabilitado
     * mientras los haya. El filtro es por el estrechamiento de tipos —y por si
     * alguien llega por `Enter` en una carrera perdida—, no por costumbre.
     */
    const enviados = adjuntos.filter(
      (adjunto): adjunto is AdjuntoElegido & { id: string } => adjunto.id !== null,
    );

    /* La burbuja ya no necesita inventarse un texto cuando solo hay archivos:
       los archivos **son** la burbuja. Antes ponía sus nombres como texto porque
       no había forma de pintarlos, y se leía como un mensaje raro. */
    const mio: Mensaje = {
      id: crypto.randomUUID(),
      role: 'user',
      text: limpio,
      attachments: enviados.map((adjunto) => ({
        id: adjunto.id,
        filename: adjunto.name,
        mimeType: adjunto.mime,
        size: adjunto.bytes,
      })),
    };

    setMensajes((previos) => [...previos, mio]);
    setTexto('');
    setAdjuntos([]);
    setError(null);
    setPendiente(true);

    /**
     * ⚠️ **El `try` no es por si acaso: sin él la cara se queda pensando para
     * siempre.**
     *
     * `preguntarAction` traduce a `{ error }` todo lo que pasa **dentro** del
     * servidor, y por eso parecía que no hacía falta. Pero una Server Action
     * también puede fallar **antes de llegar ahí** —`UnrecognizedActionError`
     * cuando el servidor de desarrollo se recarga y el id de la acción deja de
     * existir, o la petición que no sale—, y eso llega aquí como una excepción,
     * no como un valor. La promesa se rechazaba, `setPendiente(false)` no se
     * ejecutaba nunca y el chat se quedaba con el girador puesto y el ánimo en
     * `thinking`: ni respuesta, ni `oops`, ni forma de reintentar sin recargar.
     */
    let respuesta: Awaited<ReturnType<typeof preguntarAction>>;
    try {
      respuesta = await preguntarAction(
        projectId,
        limpio,
        conversationId ?? undefined,
        enviados.map((adjunto) => adjunto.id),
      );
    } catch {
      respuesta = {
        reply: null,
        proposals: [],
        cuota: null,
        /* Una conexión perdida sí se reintenta: no es una cuota. */
        topeAgotado: null,
        conversationId: null,
        error: 'Se ha perdido la conexión con el servidor. Inténtalo otra vez.',
      };
    }

    setPendiente(false);
    if (respuesta.cuota) setCuota(respuesta.cuota);
    /* Aunque el turno falle: si el servidor llegó a abrir la conversación, el
       siguiente intento tiene que caer dentro y no abrir otra. */
    if (respuesta.conversationId) setConversationId(respuesta.conversationId);

    if (respuesta.error || !respuesta.reply) {
      /**
       * 🔴 **El fallo se cuenta en la conversación, no fuera de ella.**
       *
       * Esto quitaba la pregunta del hilo, la devolvía al campo y pintaba una
       * línea roja bajo el compositor. Tres cosas mal a la vez: la persona
       * perdía de vista lo que había preguntado, el hilo quedaba mudo como si
       * no hubiera pasado nada, y el aviso aparecía lejos de donde estaba
       * mirando.
       *
       * Ahora la pregunta se queda, PRAX responde en su burbuja lo que de
       * verdad ha ocurrido —el backend ya manda el motivo bueno desde que
       * `GeminiError` sale como 502— y el reintento es un botón ahí mismo.
       *
       * Los archivos sí vuelven al compositor: siguen subidos y sin reclamar,
       * así que reintentar no los sube otra vez.
       */
      setAdjuntos(enviados);
      const idDegradado = crypto.randomUUID();
      setMensajes((previos) => [
        ...previos,
        {
          id: idDegradado,
          role: 'model',
          text: respuesta.error ?? 'No he podido responder a esto. Vuelve a intentarlo.',
          degradado: true,
        },
      ]);
      /**
       * ⚠️ **Una cuota agotada no ofrece reintento, y es la única excepción.**
       * El botón no puede funcionar hasta el día 1: quien lo ve lo pulsa tres o
       * cuatro veces antes de entender que el problema no es de red. La salida
       * de este caso ya está montada y es otra —`AmpliarPlan`, que aparece sola
       * en cuanto el contador llega al tope—, así que aquí basta con no poner un
       * botón que compite con ella y no lleva a ninguna parte.
       */
      if (!respuesta.topeAgotado) {
        setReintento({ texto: limpio, preguntaId: mio.id, avisoId: idDegradado });
      }
      return;
    }

    setReintento(null);

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
    : /* Un turno fallido ya no pinta una línea roja, así que la cara es lo único
         que queda para reconocer que algo ha ido mal. */
      error || reintento
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
              `flex min-h-0 flex-1 flex-col gap-4 ${enCajon || esFlotante ? 'p-4' : ''}`
            : 'flex flex-col gap-4 rounded-sm border p-5'
        }
        style={
          esFlotante
            ? /* El minichat va sobre negro puro. */
              { background: '#191919' }
            : aPantalla
              ? undefined
              : { borderColor: alpha(colors.primary, 25), background: colors.surface }
        }
        aria-label={`${PRAX_NAME}, el asistente`}
      >
        {/* ⚠️ `shrink-0`: en una columna flex, un hijo se encoge por defecto
            cuando falta sitio — y con una conversación larga la cabecera perdía
            altura hasta recortar el nombre. Fija arriba, siempre. */}
        <header className="flex shrink-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {/* La cara, a la izquierda del título: es lo que convierte esto en
              «hablar con alguien» y no en «usar un cuadro de texto». En la
              ventana flotante no cabe y el nombre-desplegable ya ancla la
              esquina, así que ahí no se pinta. */}
            {!esFlotante && <PraxAvatar mood={animo} size="lg" />}

            <div className="flex min-w-0 flex-col gap-1">
              {esFlotante && vista === 'chat' ? (
                /* Nombre a la izquierda, recortado, con desplegable de las 5
                   conversaciones más recientes. */
                <NombreConRecientes
                  titulo={
                    recientes.find((c) => c.id === conversationId)?.title ??
                    (conversationId ? 'Conversación' : 'Nueva conversación')
                  }
                  abierto={menuRecientes}
                  onAlternar={() => setMenuRecientes((v) => !v)}
                  onCerrar={() => setMenuRecientes(false)}
                  recientes={recientes.slice(0, 5)}
                  activaId={conversationId}
                  onElegir={(id) => {
                    setMenuRecientes(false);
                    if (id !== conversationId) void cargar(id);
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-xl text-text-primary">
                    {vista === 'historial' ? 'Historial' : PRAX_NAME}
                  </h3>
                  {!esFlotante && (
                    <Badge
                      variant="accent"
                      className="inline-flex items-center gap-1 uppercase text-sm"
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
                  )}
                </div>
              )}
              {/**
               * El proyecto, como insignia. Y **con aspa solo mientras se pueda**.
               *
               * ⚠️ Sustituye a la frase que había aquí —«Lee los datos del
               * proyecto y responde con sus números…»— que era un pie de manual:
               * decía lo mismo en cada visita y ocupaba el sitio más visible de
               * la cabecera. Lo que hace falta ahí es **de qué se está hablando**.
               *
               * ## El aspa aparece y desaparece, y ese es el diseño entero
               *
               * Fue un botón para cambiar de proyecto en cualquier momento, y se
               * retiró: el hilo se reenvía entero al modelo en cada turno, así
               * que empezar en un proyecto y seguir en otro le mete los dos
               * contextos —tareas, columnas, gente— en la misma ventana, y las
               * propuestas salen apuntando a ids del proyecto equivocado.
               *
               * Pero **antes del primer mensaje no hay ningún contexto que
               * mezclar**, y ahí quitarlo era una trampa: elegías mal de la lista
               * de botones y no había vuelta atrás salvo editando la URL. Así que
               * el aspa está mientras la conversación esté en blanco y se va con
               * el primer turno, que es justo cuando el foco pasa a significar
               * algo.
               *
               * Con hilo empezado esto es un rótulo, y para hablar de otro
               * proyecto se empieza otra conversación — el botón de al lado.
               */}
              {vista === 'chat' &&
                projectId &&
                (enBlanco && !enCajon ? (
                  <button
                    type="button"
                    onClick={() => onElegirProyecto?.('', null)}
                    title="Elegir otro proyecto"
                    className="group flex max-w-full items-center gap-1 self-start rounded-full px-2.5 py-1 font-sans text-xs font-medium transition-colors"
                    style={{
                      background: alpha(colors.primary, 12),
                      color: colors.primary,
                      boxShadow: `inset 0 0 0 1px ${alpha(colors.primary, 25)}`,
                    }}
                  >
                    <span className="truncate">
                      {nombresDeProyecto[projectId] ?? 'Este proyecto'}
                    </span>
                    <svg
                      className="h-3 w-3 shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ) : (
                  <span
                    className="flex max-w-full items-center self-start rounded-full px-2.5 py-1 font-sans text-xs font-medium"
                    style={{
                      background: alpha(colors.primary, 12),
                      color: colors.primary,
                      boxShadow: `inset 0 0 0 1px ${alpha(colors.primary, 25)}`,
                    }}
                  >
                    <span className="truncate">
                      {nombresDeProyecto[projectId] ?? 'Este proyecto'}
                    </span>
                  </span>
                ))}

              {vista === 'historial' && (
                <p className="font-sans text-sm text-white">
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
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  esFlotante
                    ? 'text-white enabled:hover:bg-white/5 enabled:hover:text-white'
                    : 'h-10 w-10 rounded-sm border text-white enabled:hover:bg-surface-elevated enabled:hover:text-text-primary'
                }`}
                style={esFlotante ? undefined : { borderColor: colors.border }}
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
            {/* En la ventana flotante no hay botón de historial: el desplegable
                del nombre ya lleva a las conversaciones recientes. */}
            {!esFlotante && (
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
                className={`flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  vista === 'historial'
                    ? 'bg-surface-elevated text-text-primary'
                    : 'text-white hover:bg-surface-elevated hover:text-text-primary'
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
            )}

            {/* Solo en la ventana flotante de PRAX global: cambiar de modo y
                cerrar. El resto de variantes no tienen ventana que gobernar. */}
            {esFlotante && prax && (
              <ModoYCerrar
                modo={prax.modo}
                menuAbierto={menuModo}
                onAlternarMenu={() => setMenuModo((v) => !v)}
                onCerrarMenu={() => setMenuModo(false)}
                onAcoplar={() => {
                  setMenuModo(false);
                  prax.ponerModo('acoplado');
                }}
                onFlotante={() => {
                  setMenuModo(false);
                  prax.ponerModo('flotante');
                }}
                onPantallaCompleta={() => {
                  setMenuModo(false);
                  prax.aPantallaCompleta();
                }}
                onCerrar={prax.cerrar}
              />
            )}
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
            filtroProyectoId={enCajon ? projectId : null}
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
                    <Burbuja
                      mensaje={mensaje}
                      gatewayPath={gatewayPath}
                      onReintentar={
                        mensaje.degradado && reintento?.avisoId === mensaje.id
                          ? reintentar
                          : undefined
                      }
                      reintentando={pendiente}
                    />

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
                          /**
                           * Las dos de una conversación **sin proyecto**.
                           *
                           * Van antes que las demás porque son las únicas que
                           * pueden llegar sin foco, y las dos acaban en el mismo
                           * gesto: cargar un proyecto en esta misma conversación
                           * —uno que ya existía, o el que se acaba de crear— sin
                           * perder lo que se lleva hablado.
                           */
                          if (isOpenProjectProposal(propuesta)) {
                            return (
                              <OpenProjectProposalCard
                                key={propuesta.id ?? `${mensaje.id}-${indice}`}
                                projectId={projectId}
                                proposalId={propuesta.id}
                                estadoGuardado={propuesta.status}
                                propuesta={propuesta.args}
                                onAbrir={(elegido) => onElegirProyecto?.(elegido, conversationId)}
                              />
                            );
                          }
                          if (isTemplateProposal(propuesta)) {
                            return (
                              <TemplateProposalCard
                                key={propuesta.id ?? `${mensaje.id}-${indice}`}
                                projectId={projectId}
                                proposalId={propuesta.id}
                                estadoGuardado={propuesta.status}
                                propuesta={propuesta.args}
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

                {pendiente && <FlujoDePensamiento alAvanzar={irAlFondo} />}
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
                  <PraxAvatar mood="idle" size="xl" />

                  <div className="flex max-w-lg flex-col gap-2">
                    <p className="font-display text-2xl text-text-primary">
                      {projectId
                        ? 'Pregúntame por este proyecto'
                        : userName
                          ? `Hola ${userName}, ¿qué tal todo?`
                          : 'Hola, ¿qué tal todo?'}
                    </p>
                    {/**
                     * ⚠️ **Sin foco esto decía «elige un proyecto», y era una
                     * puerta cerrada.** Con el compositor detrás de esa
                     * elección, el saludo no daba la bienvenida: daba un
                     * requisito. Ahora dice lo que de verdad se puede hacer
                     * aquí, que es hablar — y elegir proyecto pasa a ser una de
                     * las opciones, no el peaje.
                     */}
                    <p className="font-serif text-base italic text-white">
                      {projectId
                        ? 'Dime lo que necesitas de este proyecto y yo te lo facilito.'
                        : 'Pregúntame lo que quieras, o empecemos hablando de alguno de tus proyectos.'}
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
                            className="rounded-full border border-border px-4 py-2 font-sans text-sm text-white transition-colors hover:border-primary hover:bg-surface-elevated hover:text-text-primary"
                          >
                            {proyecto.name}
                          </button>
                        ))}
                  </div>

                  {/**
                   * Sin proyectos que ofrecer, decirlo.
                   *
                   * ⚠️ Y decir **otra cosa** que antes: la frase era «todavía no
                   * tengo datos de los que hablar», que con el compositor
                   * apagado describía una pantalla inútil. Ahora se puede
                   * escribir, así que lo que falta no es con quién hablar sino
                   * qué mirar — y montar el primer proyecto es justo lo que PRAX
                   * sabe hacer sin ninguno.
                   */}
                  {!projectId && proyectos.length === 0 && (
                    <p className="max-w-md font-sans text-sm text-white">
                      No tienes ningún proyecto cuyo análisis puedas abrir. Cuéntame en qué estás
                      trabajando y te propongo cómo montarlo.
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
             * ⚠️ **Antes esto era `!projectId ? null : …` y esa era la reja.**
             *
             * El argumento de entonces era correcto para lo que había: el turno
             * iba a `POST /projects/:id/assistant/chat`, así que sin proyecto el
             * campo no podía mandar nada e invitaba a escribir para después
             * decir que no.
             *
             * Lo que cambió no es el criterio, es que **ahora sí hay dónde
             * mandarlo**: `POST /me/assistant/chat`, sin proyecto y sin permisos
             * de proyecto que comprobar. Una conversación sin foco dejó de ser
             * una sala de espera y pasó a ser un sitio donde se trabaja: se le
             * cuenta un proyecto que todavía no existe, se le adjunta lo que hay
             * escrito, y de ahí sale la propuesta de montarlo.
             */}
            {agotada && cuota ? (
              /* Quedarse sin mensajes deja de ser un callejón: `AmpliarPlan`
                 decide si ofrece PRO o si enseña el aviso de siempre — no lo
                 ofrece a quien ya lo tiene ni donde no hay pasarela. */
              <AmpliarPlan cuota={cuota} />
            ) : (
              <form
                /* `shrink-0` y `mt-auto`: el compositor se queda pegado abajo
                   aunque la conversación sea corta, y no se encoge cuando es
                   larga. Es la otra mitad de que solo desplacen los mensajes. */
                className="mt-auto flex shrink-0 flex-col gap-2"
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
                        key={adjunto.localId}
                        className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5"
                        style={{ background: colors.surfaceElevated }}
                      >
                        {/* Mientras sube, el giro ocupa el sitio del icono: el
                            chip no cambia de tamaño al terminar. */}
                        {adjunto.id === null ? (
                          <span
                            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent text-white"
                            aria-label="Subiendo"
                          />
                        ) : (
                          <IconoDeArchivo mime={adjunto.mime} className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="max-w-48 truncate font-sans text-xs text-text-primary">
                          {adjunto.name}
                        </span>
                        <span className="shrink-0 font-sans text-[11px] text-white">
                          {enKilobytes(adjunto.bytes)}
                        </span>
                        <button
                          type="button"
                          onClick={() => quitarAdjunto(adjunto.localId)}
                          aria-label={`Quitar ${adjunto.name}`}
                          className="shrink-0 rounded text-white transition-colors hover:text-error"
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
                  className="flex flex-col gap-1.5 rounded-2xl border p-2.5 transition-colors focus-within:border-white/25"
                  style={{ borderColor: alpha(colors.border, 90), background: '#191919' }}
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
                    className="max-h-40 w-full resize-none bg-transparent px-1.5 py-1 font-sans text-sm text-text-primary outline-none placeholder:text-white disabled:cursor-not-allowed"
                  />

                  {/* La fila de acciones, debajo del campo: a la izquierda el
                      «+» y los ajustes; a la derecha el modelo y Enviar. */}
                  <div className="flex items-center gap-1">
                    <ComposerMasMenu
                      disabled={pendiente}
                      alTope={adjuntos.length >= ASSISTANT_ATTACHMENT_MAX_PER_MESSAGE}
                      onAdjuntarImagen={() => abrirSelector(true)}
                      onAdjuntarArchivo={() => abrirSelector(false)}
                      onEtiquetarProyecto={() => insertarEnCampo('#')}
                      onEtiquetarPersona={() => insertarEnCampo('@')}
                    />

                    <AjustesMenu
                      gatewayPath={gatewayPath}
                      organizacionActivaId={organizacionActivaId ?? null}
                    />

                    {/* Escondido: lo abre el menú «+». Las extensiones además de
                        los tipos, porque algunos selectores no reconocen
                        `text/markdown` y dejan los `.md` en gris. `accept` se
                        ajusta al vuelo según se pida imagen o archivo. */}
                    <input
                      ref={archivoRef}
                      type="file"
                      multiple
                      accept={ASSISTANT_ATTACHMENT_ACCEPT}
                      onChange={alElegirArchivos}
                      className="hidden"
                    />

                    <div className="flex-1" />

                    <ModeloSelector />

                    <button
                      type="submit"
                      /* El texto es obligatorio aunque haya archivos: ver
                         `enviar`. Así el botón dice lo mismo que la regla. */
                      disabled={pendiente || subiendo || texto.trim().length === 0}
                      aria-label="Enviar"
                      title={subiendo ? 'Esperando a que suban los archivos' : 'Enviar'}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ background: alpha(colors.primary, 22), color: colors.primary }}
                    >
                      {pendiente || subiendo ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : (
                        <svg
                          className="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.25}
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 19V5M5 12l7-7 7 7"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <p className="font-sans text-xs text-white">
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
      <span className="font-sans text-[11px] uppercase tracking-wider text-white">
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
      className="rounded-full border border-border px-3.5 py-2 font-sans text-sm text-white transition-colors hover:border-border-strong hover:bg-surface-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
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
function Burbuja({
  mensaje,
  gatewayPath,
  onReintentar,
  reintentando,
}: {
  mensaje: Mensaje;
  gatewayPath: string;
  /** Solo en la burbuja de un turno que falló, y solo si es el último. */
  onReintentar?: (() => void) | undefined;
  reintentando?: boolean | undefined;
}) {
  const mio = mensaje.role === 'user';
  const adjuntos = mensaje.attachments ?? [];
  /* Hoy todo turno lleva texto —ver `enviar`—, pero los hilos de antes de esa
     regla tienen burbujas que son solo archivos, y siguen teniendo que pintarse.
     Un `<p>` vacío debajo de la miniatura se ve como un hueco raro. */
  const conTexto = mensaje.text.trim().length > 0;

  return (
    <div className={`flex flex-col gap-1 ${mio ? 'items-end' : 'items-start'}`}>
      <div
        className={[
          /* `flex flex-col gap-2` y no `whitespace-pre-wrap`: desde que
             `ModelText` devuelve bloques —párrafos, listas, código— el salto de
             línea lo pone el propio bloque. Manteniendo los dos, cada párrafo
             quedaba separado dos veces. */
          'flex max-w-[85%] min-w-0 flex-col gap-2 rounded-sm px-3.5 py-2 font-sans text-sm leading-relaxed text-text-primary',
          /* La esquina de dentro, cuadrada: es lo que da el pico hacia quien
             habla sin necesidad de dibujar ninguno. Igual que en Mensajes. */
          mio ? 'rounded-br-md' : 'rounded-bl-md',
        ].join(' ')}
        style={{
          /* La degradada no es del modelo, así que no puede parecerlo: el tinte
             de aviso la separa de una respuesta de verdad sin sacarla del hilo. */
          background: mensaje.degradado
            ? `color-mix(in srgb, ${colors.warning} 14%, ${colors.background})`
            : mio
              ? `color-mix(in srgb, ${colors.primary} 16%, ${colors.background})`
              : colors.surfaceElevated,
        }}
      >
        {adjuntos.map((adjunto) => (
          <AdjuntoEnLaBurbuja key={adjunto.id} adjunto={adjunto} gatewayPath={gatewayPath} />
        ))}
        {conTexto && <ModelText texto={mensaje.text} />}
        {onReintentar && (
          <button
            type="button"
            onClick={onReintentar}
            disabled={reintentando}
            className="self-start rounded-lg px-2.5 py-1 font-sans text-xs font-semibold text-warning transition-colors hover:bg-warning-muted disabled:opacity-50"
          >
            {reintentando ? 'Reintentando…' : 'Reintentar'}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Un archivo dentro de una burbuja.
 *
 * ## Una sola forma para todos, y a propósito
 *
 * Miniatura cuadrada, nombre y tamaño, siempre del mismo alto: un PDF, un `.md`
 * y un PNG ocupan exactamente lo mismo. La alternativa —la imagen grande y el
 * resto como una línea de texto— hace que una conversación con tres archivos
 * mezclados se lea como tres cosas distintas, y obliga a que el hilo salte de
 * altura cada vez que carga una imagen.
 *
 * Lo único que cambia entre tipos es **qué hay dentro del cuadrado**: la vista
 * previa si es una imagen, el icono del tipo si no.
 *
 * ## Y es un enlace, no un botón
 *
 * Descargar es navegar a un recurso, así que `<a download>` con la URL real: se
 * puede abrir en otra pestaña, copiar el enlace y el navegador enseña a dónde
 * lleva. Un `<button>` con un `fetch` dentro no da ninguna de las tres cosas.
 *
 * ⚠️ La URL pasa por el **proxy de la zona** y no por el gateway: el JWT vive en
 * una cookie `httpOnly` del propio origen. Ver `assistantAttachmentHref`.
 */
function AdjuntoEnLaBurbuja({
  adjunto,
  gatewayPath,
}: {
  adjunto: AssistantAttachment;
  gatewayPath: string;
}) {
  const href = assistantAttachmentHref(gatewayPath, adjunto.id);
  const esImagen = esImagenDeAsistente(adjunto.mimeType);

  return (
    <a
      href={href}
      download={adjunto.filename}
      className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border px-2 py-1.5 transition-colors hover:border-border-strong"
      style={{ background: alpha(colors.background, 45) }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md"
        style={{ background: alpha(colors.textDisabled, 14) }}
      >
        {esImagen ? (
          /* Sin `next/image`: la fuente es una ruta autenticada de este mismo
             origen, no un archivo del proyecto, y el optimizador tendría que
             pedirla sin la cookie. */
          // biome-ignore lint/performance/noImgElement: ruta autenticada, no un asset
          <img
            src={href}
            alt={adjunto.filename}
            /* `object-cover`: recorta en vez de deformar. Es una miniatura para
               reconocer el archivo, no para verlo. */
            className="h-full w-full object-cover"
          />
        ) : (
          <IconoDeArchivo mime={adjunto.mimeType} className="h-4 w-4 text-white" />
        )}
      </span>

      <span className="flex min-w-0 flex-col">
        <span className="truncate font-sans text-xs text-text-primary">{adjunto.filename}</span>
        <span className="font-sans text-[11px] text-white">
          {enKilobytes(adjunto.size)}
        </span>
      </span>
    </a>
  );
}

/* ─── Adjuntos ────────────────────────────────────────────────────────────── */

/** Un archivo del compositor: subiéndose (`id` nulo) o ya listo para enviarse. */
interface AdjuntoElegido {
  /** Clave de React desde el primer instante, cuando todavía no hay id. */
  localId: string;
  /** El del servidor. `null` mientras sube; es lo que viaja con el turno. */
  id: string | null;
  name: string;
  mime: string;
  /** Tamaño real del archivo, para enseñarlo y para comprobar el tope. */
  bytes: number;
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
 * Sube un archivo y devuelve su id, o el motivo por el que no.
 *
 * ## ⚠️ `fetch` desde el navegador, y **no** una Server Action
 *
 * 🔴 Es el arreglo del fallo entero. Una Server Action de Next tiene el cuerpo
 * topado en 1 MB, así que subir por ahí mataba cualquier foto de teléfono con un
 * «Body exceeded 1 MB limit» que no se traduce, no dice qué archivo y ni siquiera
 * llega a nuestro código. Subir el tope en `next.config` lo habría tapado, pero
 * a costa de leer el archivo entero a base64 —un tercio más de bytes— y de
 * pasarlo por la serialización de React. Multipart no tiene ninguno de los dos
 * problemas.
 *
 * ## Al proxy de la zona, no al gateway
 *
 * El JWT vive en una cookie `httpOnly` que el navegador solo manda al **propio
 * origen**. Apuntando a `localhost:3000` la petición saldría sin sesión y
 * devolvería 401. Ver CLAUDE.md §Auth.
 *
 * ⚠️ Y **no se pone `Content-Type` a mano**: lo pone el navegador con el
 * `boundary` del multipart, que es lo único que sabe generar. Ponerlo a pelo deja
 * el cuerpo sin separador y el servidor no encuentra ningún campo.
 */
async function subirAdjunto(
  gatewayPath: string,
  archivo: File,
): Promise<{ id: string | null; error: string }> {
  const cuerpo = new FormData();
  cuerpo.append('file', archivo);

  try {
    const respuesta = await fetch(`${gatewayPath}/me/assistant/attachments`, {
      method: 'POST',
      body: cuerpo,
    });

    /* El sobre de siempre: `{ success, data }` o `{ success:false, error }`. Se
       mira el `data`, no el status — es la regla de la casa, y aquí además el
       413 de un cuerpo demasiado grande puede no traer JSON. */
    const sobre = (await respuesta.json().catch(() => null)) as {
      data?: { id?: string };
      error?: { message?: string };
    } | null;

    const id = sobre?.data?.id;
    if (!id) {
      return {
        id: null,
        error:
          sobre?.error?.message ??
          (respuesta.status === 413
            ? `pasa de ${enKilobytes(ASSISTANT_ATTACHMENT_MAX_BYTES)}.`
            : 'no se pudo subir.'),
      };
    }

    return { id, error: '' };
  } catch {
    return { id: null, error: 'no se pudo subir. ¿Sigues conectado?' };
  }
}

/**
 * El icono del tipo de archivo. Tres formas, no una por extensión.
 *
 * Documento, imagen y texto es toda la distinción que hace falta para reconocer
 * un archivo en una lista de tres: el nombre, que está justo al lado, dice el
 * resto. Un catálogo de iconos por extensión sería más bonito y no ayudaría a
 * nadie a encontrar nada más rápido.
 */
function IconoDeArchivo({ mime, className }: { mime: string; className?: string }) {
  const trazo =
    mime === 'application/pdf'
      ? /* Documento con una esquina doblada. */
        'M14 3v5h5M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z'
      : esImagenDeAsistente(mime)
        ? /* Marco con montaña y sol. */
          'M4 5h16v14H4zM4 16l4-4 3 3 4-5 5 6M9 9.5a1 1 0 11-2 0 1 1 0 012 0z'
        : /* Tres renglones: texto y Markdown. */
          'M5 5h14M5 10h14M5 15h9';

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={trazo} />
    </svg>
  );
}

/** `1536` → `1,5 kB`. Para que el tamaño de un adjunto se lea de un vistazo. */
function enKilobytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

// ─── Cabecera de la variante `flotante` ──────────────────────────────────────

/** Un instante ISO, corto: hoy la hora; otro día, el día y el mes. */
function cuandoCorto(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hoy = new Date();
  const mismoDia =
    d.getDate() === hoy.getDate() &&
    d.getMonth() === hoy.getMonth() &&
    d.getFullYear() === hoy.getFullYear();
  return mismoDia
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}

/**
 * El nombre de la conversación, arriba a la izquierda del minichat flotante, con
 * recorte y un desplegable de las cinco más recientes.
 */
function NombreConRecientes({
  titulo,
  abierto,
  onAlternar,
  onCerrar,
  recientes,
  activaId,
  onElegir,
}: {
  titulo: string;
  abierto: boolean;
  onAlternar: () => void;
  onCerrar: () => void;
  recientes: ConversationSummary[];
  activaId: string | null;
  onElegir: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onCerrar();
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto, onCerrar]);

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierto}
        aria-haspopup="menu"
        className="flex max-w-full items-center gap-1.5 rounded-md py-0.5 pr-1 font-sans text-sm font-semibold text-white transition-colors hover:text-white"
      >
        <span className="truncate">{titulo}</span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-white transition-transform ${abierto ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1.5 w-64 overflow-hidden rounded-xl border border-white/10 bg-[#0f0f0e] p-1 shadow-2xl"
        >
          {recientes.length === 0 ? (
            <p className="px-3 py-3 font-sans text-xs text-white">
              Todavía no hay conversaciones.
            </p>
          ) : (
            recientes.map((c) => (
              <button
                key={c.id}
                type="button"
                role="menuitem"
                onClick={() => onElegir(c.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                  c.id === activaId
                    ? 'bg-white/10 text-white'
                    : 'text-white hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="min-w-0 flex-1 truncate font-sans text-[13px]">
                  {c.title || 'Sin título'}
                </span>
                <span className="shrink-0 font-sans text-[10px] text-white">
                  {cuandoCorto(c.updatedAt)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * El cambio de modo (acoplado / flotante / pantalla completa) y el aspa de
 * cerrar, para la esquina superior derecha del minichat flotante.
 */
function ModoYCerrar({
  modo,
  menuAbierto,
  onAlternarMenu,
  onCerrarMenu,
  onAcoplar,
  onFlotante,
  onPantallaCompleta,
  onCerrar,
}: {
  modo: 'flotante' | 'acoplado';
  menuAbierto: boolean;
  onAlternarMenu: () => void;
  onCerrarMenu: () => void;
  onAcoplar: () => void;
  onFlotante: () => void;
  onPantallaCompleta: () => void;
  onCerrar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuAbierto) return;
    function fuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onCerrarMenu();
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [menuAbierto, onCerrarMenu]);

  const claseBoton =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/5 hover:text-white';

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <button
        type="button"
        onClick={onAlternarMenu}
        aria-expanded={menuAbierto}
        aria-haspopup="menu"
        title="Modo de la ventana"
        aria-label="Cambiar el modo de la ventana"
        className={claseBoton}
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path strokeLinecap="round" d="M15 4v16" />
        </svg>
      </button>

      <button
        type="button"
        onClick={onCerrar}
        title="Cerrar"
        aria-label="Cerrar PRAX"
        className={claseBoton}
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {menuAbierto && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1.5 w-52 overflow-hidden rounded-xl border border-white/10 bg-[#0f0f0e] p-1 shadow-2xl"
        >
          <OpcionModo
            activa={modo === 'flotante'}
            onClick={onFlotante}
            etiqueta="Ventana flotante"
          />
          <OpcionModo
            activa={modo === 'acoplado'}
            onClick={onAcoplar}
            etiqueta="Acoplado al lateral"
          />
          <OpcionModo activa={false} onClick={onPantallaCompleta} etiqueta="Pantalla completa" />
        </div>
      )}
    </div>
  );
}

function OpcionModo({
  activa,
  onClick,
  etiqueta,
}: {
  activa: boolean;
  onClick: () => void;
  etiqueta: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left font-sans text-[13px] transition-colors ${
        activa ? 'bg-white/10 text-white' : 'text-white hover:bg-white/5 hover:text-white'
      }`}
    >
      {etiqueta}
      {activa && (
        <svg
          className="h-3.5 w-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}

// ─── El «+» del compositor ──────────────────────────────────────────────────

/**
 * El botón «+» del compositor y su desplegable: adjuntar imagen o archivo, y
 * etiquetar un proyecto o una persona (que de momento solo mete `#` o `@` en el
 * campo — el picker con resolución real es más adelante).
 *
 * El menú se abre **hacia arriba**: el compositor vive pegado al fondo.
 */
function ComposerMasMenu({
  disabled,
  alTope,
  onAdjuntarImagen,
  onAdjuntarArchivo,
  onEtiquetarProyecto,
  onEtiquetarPersona,
}: {
  disabled: boolean;
  alTope: boolean;
  onAdjuntarImagen: () => void;
  onAdjuntarArchivo: () => void;
  onEtiquetarProyecto: () => void;
  onEtiquetarPersona: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [abierto]);

  function elegir(accion: () => void) {
    setAbierto(false);
    accion();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label="Añadir al mensaje"
        title="Añadir"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white transition-colors enabled:hover:bg-white/5 enabled:hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        <svg
          className={`h-5 w-5 transition-transform ${abierto ? 'rotate-45' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-30 mb-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#0f0f0e] p-1 shadow-2xl"
        >
          <ItemMas
            etiqueta="Adjuntar imagen"
            disabled={alTope}
            onClick={() => elegir(onAdjuntarImagen)}
            d="M4 5h16v14H4zM4 16l4-4 3 3 4-5 5 6M9 9.5a1 1 0 11-2 0 1 1 0 012 0z"
          />
          <ItemMas
            etiqueta="Adjuntar archivo"
            disabled={alTope}
            onClick={() => elegir(onAdjuntarArchivo)}
            d="M14 3v5h5M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z"
          />
          <div className="my-1 border-t border-white/5" />
          <ItemMas
            etiqueta="Etiquetar proyecto"
            onClick={() => elegir(onEtiquetarProyecto)}
            d="M3 7h18M3 12h18M3 17h18"
          />
          <ItemMas
            etiqueta="Etiquetar persona"
            onClick={() => elegir(onEtiquetarPersona)}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21a8 8 0 0116 0"
          />
        </div>
      )}
    </div>
  );
}

function ItemMas({
  etiqueta,
  d,
  onClick,
  disabled = false,
}: {
  etiqueta: string;
  d: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-sans text-[13px] text-white transition-colors enabled:hover:bg-white/5 enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg
        className="h-4 w-4 shrink-0 text-white"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
      </svg>
      {etiqueta}
    </button>
  );
}
