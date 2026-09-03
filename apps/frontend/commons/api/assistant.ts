/**
 * Las formas que devuelve `assistant-service` a través del gateway.
 *
 * Se declaran aquí y no se importan de `@praxis/contracts` por lo mismo que las
 * de `reports.ts` en `reports-front`: ese paquete es de backend —arrastra
 * `class-validator` y los decoradores de Swagger— y el frontend solo necesita la
 * forma.
 *
 * ⚠️ **Vive en `commons` y no en una zona** desde que PRAX tiene pantalla
 * propia: lo consumen `assistant-front` y `reports-front`, y las formas de una
 * respuesta no pueden estar declaradas dos veces.
 *
 * ⚠️ Los límites de cuota **no** se copian aquí. El backend los manda dentro de
 * `AssistantQuota.limite` en cada respuesta, y un segundo sitio donde apuntar
 * «50» sería un sitio donde discrepar: un contador que diga «quedan 12» mientras
 * el servidor rechaza el siguiente es peor que no enseñar contador.
 */

import type { ProjectTemplate } from './domain';

export interface AssistantQuota {
  /*
   * 🕳️ Aquí iba `plan: 'FREE' | 'PRO'`, del catálogo viejo por persona.
   *
   * Se retiró con él: el plan que importa es el de la organización y la pantalla
   * lo tiene por su cuenta. Tenerlo aquí además era la vía por la que este
   * objeto podía contradecirse — «PRO» junto a un límite de 13.
   */
  usados: number;
  limite: number;
  /** `YYYY-MM`. El periodo que se está consumiendo. */
  periodo: string;
  /** ISO 8601 del día 1 del mes que viene: cuándo vuelve a cero. */
  reinicia: string;
}

/**
 * Lo que el asistente **propone**, nunca lo que hace.
 *
 * `args` llega como diccionario suelto porque cada herramienta trae los suyos.
 * Se estrecha con `isTaskProposal` / `isAssignmentProposal` justo antes
 * de pintarla, que es el único sitio donde importa la forma concreta.
 */
export interface AssistantProposal {
  /**
   * Id de la propuesta guardada. Con él se marca como aceptada o descartada,
   * para que al releer el hilo días después no ofrezca un botón ya pulsado.
   */
  id?: string;
  tool: string;
  args: Record<string, unknown>;
  /** Solo las `PENDING` conservan sus botones al releer una conversación. */
  status?: EstadoPropuesta;
}

/** `proponer_tarea`, ya validada contra el proyecto por el servicio. */
export interface TaskProposal {
  title: string;
  description?: string;
  columnId: string;
  /** El nombre de la columna destino. Viaja en la propuesta: `status` lo iguala. */
  columnName: string;
  /**
   * En qué tablero cae.
   *
   * ⚠️ Sin esto la tarjeta decía «columna Por hacer» y no identificaba ningún
   * sitio: un proyecto con cuatro tableros tiene cuatro columnas con ese nombre.
   * Opcional porque un assistant-service sin actualizar no lo manda.
   */
  boardName?: string;
  priority: string;
  dueDate?: string;
  assigneeIds?: string[];
  labelIds?: string[];
  /** Por qué se propone. Es un parámetro obligatorio de la herramienta. */
  porQue?: string;
}

/** `proponer_asignacion`. `taskId` lo da la persona: no está en el contexto. */
export interface AssignmentProposal {
  taskId: string;
  /**
   * El título de la tarea, resuelto por el servicio contra su inventario.
   *
   * Opcional porque la propuesta se validó en el servidor y la tarjeta tiene
   * que poder pintarse igual si algún día llega sin él. Cuando está, es lo que
   * se enseña: un id recortado a ocho caracteres no identifica nada para quien
   * está decidiendo si acepta.
   */
  taskTitle?: string;
  assigneeIds: string[];
  porQue?: string;
}

/**
 * Lo que comparten las propuestas que actúan sobre una tarea que ya existe.
 *
 * `taskTitle` lo resuelve el servicio contra su inventario. Es opcional por lo
 * mismo en las cuatro: la tarjeta tiene que poder pintarse aunque llegue sin él.
 */
interface SobreTarea {
  taskId: string;
  taskTitle?: string;
  porQue?: string;
}

/** `proponer_edicion`. Solo trae los campos que cambian. */
export interface EditProposal extends SobreTarea {
  title?: string;
  description?: string;
  priority?: string;
  dueDate?: string;
  /** La lista completa que queda, no las que se añaden. */
  labelIds?: string[];
}

/** `proponer_movimiento`. */
export interface MoveProposal extends SobreTarea {
  columnId: string;
  columnName: string;
  /** De dónde sale, para que la tarjeta pueda decir «de X a Y». */
  columnaActual?: string;
  /** Tablero destino y tablero de origen. Mover entre tableros es válido, y es
      un cambio mayor que cambiar de columna: la tarjeta tiene que enseñarlo. */
  boardName?: string;
  tableroActual?: string;
}

/** `proponer_checklist`. Los pasos se suman a los que ya hubiera. */
export interface ChecklistProposal extends SobreTarea {
  items: string[];
}

/** `proponer_comentario`. Se publica a nombre de quien acepta. */
export interface CommentProposal extends SobreTarea {
  body: string;
}

/**
 * `proponer_borrado`. **La única propuesta que no se deshace.**
 *
 * ## Por qué existe, si durante meses estuvo prohibida
 *
 * Porque el argumento que la vetaba no era la regla de la casa. La regla es «el
 * asistente propone; ejecuta el código que ya existe», y borrar la cumple igual
 * que crear: esto no borra nada. Aceptar llama a `DELETE /tasks/:id` desde el
 * frontend, con la sesión y los permisos de quien pulsa — lo mismo, exactamente,
 * que borrarla desde el tablero. Sin `canDeleteTask` la herramienta ni se le
 * declara al modelo, y aun así el gateway lo rechazaría.
 *
 * ## Lo que sí la hace distinta, y por eso trae tanto contexto
 *
 * Que **no se deshace**. Una tarea propuesta de más se borra; una borrada de más
 * no vuelve, y se lleva sus subtareas, su checklist, sus comentarios y sus
 * adjuntos. Así que la tarjeta tiene que poder decir **qué** se va a perder sin
 * ir a buscarlo, y de ahí los campos de abajo.
 *
 * ⚠️ **No hay recuento de comentarios ni de adjuntos, a propósito.** El briefing
 * que ve el asistente no los trae, y un número inventado en una tarjeta de
 * borrado sería la peor clase de mentira posible. La tarjeta lo dice en
 * genérico, que es cierto.
 */
export interface DeleteProposal extends SobreTarea {
  /** Dónde está ahora. Un título suelto no identifica una tarea de un vistazo. */
  columna?: string;
  tablero?: string;
  /** Cuántos pasos de checklist se van con ella. */
  pasos?: number;
  /** Ya estaba cerrada: no es lo mismo tirar trabajo pendiente que archivo. */
  cerrada?: boolean;
}

/**
 * `proponer_mensaje`. Se envía al chat del equipo, a nombre de quien acepta.
 *
 * ⚠️ **No extiende `SobreTarea`**: es la única propuesta que no apunta a una
 * tarea. Va al chat del proyecto entero.
 *
 * El cuerpo puede traer menciones en el formato `@[Nombre](user:id)`. No se
 * resuelven aquí: el nombre ya está escrito dentro, así que la tarjeta lo pinta
 * tal cual y el chat lo convierte en etiqueta al mostrarlo.
 */
export interface MessageProposal {
  body: string;
  porQue?: string;
}

/**
 * `proponer_marcar_pasos`. Marca pasos del checklist como hechos.
 *
 * ⚠️ **Solo marca.** No desmarca ni borra: el asistente no deshace trabajo.
 * `items` son los textos, para que la tarjeta pueda decir QUÉ se marca sin ir a
 * buscarlo; `itemIds` es lo que se manda al aceptar.
 */
export interface CheckStepsProposal extends SobreTarea {
  itemIds: string[];
  items: string[];
}

/**
 * `proponer_grafico`. Un gráfico para **el lienzo de quien acepta**.
 *
 * ⚠️ **La única propuesta que no toca el proyecto.** Aceptarla no cambia
 * ninguna tarea, ningún comentario y nada de lo que ve el resto del equipo: el
 * lienzo de Análisis es de cada persona. La tarjeta lo dice, porque «el
 * asistente quiere añadir algo» se lee peor de lo que es.
 *
 * `grafico` viene **ya validado contra el conjunto cerrado** por el servicio, y
 * se vuelve a validar en el gateway al guardarlo. El modelo eligió la forma y la
 * métrica; los números salen de los agregados de siempre.
 */
export interface ChartProposal {
  grafico: {
    forma: string;
    metrica: string;
    dias?: number;
    soloVencidas?: boolean;
    topN?: number;
    titulo: string;
  };
  porQue?: string;
}

/**
 * `proponer_pregunta`. **La única propuesta que no propone ningún cambio.**
 *
 * Las otras diez preparan algo que se acepta o se descarta; esta es una
 * pregunta con las respuestas ya enumeradas, para poder contestar con un clic.
 *
 * ## Por qué es una propuesta y no texto
 *
 * Porque lo que gana no es comodidad, es **precisión**: una respuesta elegida de
 * una lista no se puede escribir mal, así que el turno siguiente no empieza por
 * «no te he entendido». Cuando el modelo pregunta escribiendo, la
 * desambiguación que él ya tiene enumerada hay que teclearla otra vez.
 *
 * ⚠️ **Al responder no se llama a ningún endpoint nuevo**: las respuestas se
 * componen en una frase y se mandan como **un turno más** de la conversación.
 * Eso es lo que hace que el modelo las entienda sin ninguna maquinaria extra —
 * ve una respuesta en español, no un formulario serializado— y lo que mantiene
 * el hilo legible al releerlo días después.
 */
export interface QuestionProposal {
  preguntas: {
    id: string;
    texto: string;
    /** `una` se pinta como opciones excluyentes; `varias`, como casillas. */
    tipo: 'una' | 'varias';
    opciones: { id: string; texto: string }[];
  }[];
  porQue?: string;
}

/**
 * `proponer_tablero`. Un tablero con sus columnas, listo para crear.
 *
 * ## Por qué el asistente puede proponer esto
 *
 * Porque ya podía, en otro sitio: la plantilla de proyecto nuevo genera el árbol
 * entero —espacios, tableros, columnas, etiquetas y roles— y nunca fue una vía
 * de escritura nueva, por lo mismo que ninguna lo es: **propone, y ejecuta quien
 * acepta, con sus permisos**. Que esa capacidad viviera solo en el modal de
 * creación era un accidente de dónde se implementó, y se notaba — en un proyecto
 * vacío, a «créame una tarea» solo se podía contestar que primero hacía falta un
 * tablero, sabiendo perfectamente cuál proponer.
 *
 * ⚠️ **`espacio` es un nombre, no un id.** El asistente no ve los ids de los
 * espacios de trabajo, así que propone por nombre y la acción de aceptar lo
 * resuelve contra el proyecto de verdad: si existe uno que se llame así lo usa, y
 * si no, lo crea. Es el mismo criterio que ya aplica la tarea con su columna —
 * nada de lo que llega del chat se toma por bueno sin volver a mirarlo.
 */
/**
 * Abrir uno de los proyectos de quien habla, desde una conversación sin foco.
 *
 * ⚠️ **`nombre` viaja con la propuesta y no se busca en una lista.** Al releer
 * el hilo dentro de una semana la tarjeta tiene que seguir diciendo de qué
 * proyecto hablaba, y la pantalla que la pinta puede no tener cargada ninguna
 * lista de proyectos — el cajón de Análisis, por ejemplo, solo conoce el suyo.
 */
export interface OpenProjectProposal {
  projectId: string;
  nombre: string;
  porQue?: string;
}

/**
 * La estructura de arranque de un proyecto que **todavía no existe**.
 *
 * Es `ProjectTemplate` tal cual —el mismo objeto que devuelve
 * `POST /me/assistant/project-draft` y que sabe aplicar `commons/template`— y
 * por eso no se redeclara aquí: la tarjeta del chat y el diálogo de proyecto
 * nuevo enseñan y crean exactamente lo mismo.
 */
export type TemplateProposal = ProjectTemplate;

export interface BoardProposal {
  /** Nombre del espacio de trabajo. Se resuelve o se crea al aceptar. */
  espacio: string;
  nombre: string;
  /** En orden, de lo que está por empezar a lo terminado. */
  columnas: { nombre: string; color?: string }[];
  porQue?: string;
}

/**
 * Lo que se puede adjuntar a una pregunta, y sus cuatro límites.
 *
 * ⚠️ **Espejo de `@praxis/contracts`**, redeclarado aquí por lo mismo que el
 * resto de este archivo: aquel paquete es de backend —arrastra `class-validator`
 * y los decoradores de Swagger— y el frontend solo necesita los valores.
 *
 * Un archivo entra **entero en el prompt** de cada turno, así que un tope
 * generoso no cuesta disco: cuesta cuota, latencia y —lo peor— atención del
 * modelo. Un PDF de trescientas páginas empuja las reglas y el inventario del
 * proyecto fuera de la ventana, y eso no sale como un error sino como un
 * asistente que de pronto responde peor sin que nadie sepa por qué.
 */
export const ASSISTANT_ATTACHMENT_MAX_PER_MESSAGE = 3;

/** 5 MB. Se mide sobre los bytes del archivo, no sobre su base64. */
export const ASSISTANT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Lo que el modelo sabe leer y nosotros sabemos mandarle.
 *
 * ⚠️ **Markdown va con sus dos tipos, y no sobra ninguno.** Chrome declara un
 * `.md` como `text/markdown`; Safari y algunos Linux lo mandan como
 * `text/x-markdown`, y hay sistemas donde llega vacío. Con solo el primero, el
 * mismo archivo entraba en un navegador y lo rechazaba otro.
 */
export const ASSISTANT_ATTACHMENT_ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
] as const;

/**
 * Lo que se pone en el `accept` del `<input type="file">`.
 *
 * Las extensiones **además** de los tipos: hay sistemas donde un `.md` llega sin
 * `Content-Type`, y con solo la lista de MIME el selector de archivos lo pinta
 * en gris y no deja elegirlo.
 */
export const ASSISTANT_ATTACHMENT_ACCEPT = `${ASSISTANT_ATTACHMENT_ALLOWED_MIME.join(',')},.md,.markdown,.txt`;

/**
 * Un archivo ya subido, tal y como lo ve el chat.
 *
 * 🔴 **Antes esto llevaba los bytes en base64 y era el fallo.** Viajaba dentro
 * de la pregunta, que va por una Server Action —cuerpo topado en 1 MB—, así que
 * cualquier foto de teléfono moría con un «Body exceeded 1 MB limit» de Next:
 * un error sin traducir, que no dice qué archivo, y que ni siquiera llegaba a
 * nuestro código para poder explicarlo. Y cuando sí entraba, PRAX citaba el
 * documento y en el hilo no quedaba ni rastro de él.
 *
 * Ahora el archivo se sube aparte —multipart, por el proxy de la zona— y de él
 * solo viaja el id. Los bytes se piden con `assistantAttachmentHref` y solo si
 * alguien abre el archivo.
 */
export interface AssistantAttachment {
  id: string;
  filename: string;
  mimeType: string;
  /** Bytes reales. Lo pinta la burbuja junto al nombre. */
  size: number;
}

/** Los que la burbuja previsualiza en vez de ofrecer solo la descarga. */
export function esImagenDeAsistente(mimeType: string): boolean {
  return mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp';
}

/**
 * De dónde se bajan los bytes de un adjunto.
 *
 * ⚠️ **Pasa por el proxy de la zona, no por el gateway.** El JWT vive en una
 * cookie `httpOnly` que solo se manda al propio origen: un `src` apuntando a
 * `localhost:3000` saldría sin sesión y devolvería 401. Ver CLAUDE.md §Auth.
 */
export function assistantAttachmentHref(gatewayPath: string, attachmentId: string): string {
  return `${gatewayPath}/me/assistant/attachments/${attachmentId}/content`;
}

/** «1,4 MB», «812 kB», «390 B». Lo que va debajo del nombre en la burbuja. */
export function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export type EstadoPropuesta = 'PENDING' | 'ACCEPTED' | 'DISCARDED';

/**
 * Una conversación en el historial, sin sus mensajes.
 *
 * ⚠️ `projectId` es el **último** proyecto del que se habló, y es `null` en las
 * que nunca llegaron a elegir uno. Viaja para que la lista pueda decir de qué iba
 * cada conversación sin abrirla — que es lo que hace usable un historial que ya
 * no está partido por proyecto.
 */
export interface ConversationSummary {
  id: string;
  title: string;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  mensajes: number;
}

/** Un turno tal y como vuelve de la base al releer una conversación. */
export interface StoredMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  createdAt: string;
  proposals: AssistantProposal[];
  /**
   * Los archivos que iban con este turno.
   *
   * Solo los del usuario los tienen: PRAX responde texto y propuestas, nunca
   * archivos. Y vienen vacíos en todo lo anterior a que se guardaran — entonces
   * viajaban con la pregunta y se descartaban, así que hay hilos viejos que
   * citan documentos de los que ya no queda nada.
   */
  attachments?: AssistantAttachment[];
}

export interface FullConversation {
  id: string;
  title: string;
  /**
   * El proyecto del que iba. `null` si nunca llegó a elegir uno.
   *
   * ⚠️ **Sin esto no se podía seguir una conversación vieja.** Al abrirla desde
   * el historial, la pantalla se quedaba sin foco —y por tanto sin compositor—
   * así que el hilo se podía leer y no continuar. Abrir una conversación
   * recupera ahora también su proyecto.
   */
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  mensajes: StoredMessage[];
}

export interface AssistantChatResult {
  /** La conversación en la que cayó el turno. Sin `conversationId` en la
      petición, el servidor abre una y devuelve su id aquí. */
  conversationId: string;
  reply: string;
  proposals: AssistantProposal[];
  cuota: AssistantQuota;
}

/** Un turno del hilo. Lo reenvía el cliente en cada mensaje; nadie lo guarda. */
export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

/** Tantos turnos como acepta el DTO del gateway. Más da 400. */
export const MAX_HISTORIAL = 12;

export function isTaskProposal(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: TaskProposal } {
  return propuesta.tool === 'proponer_tarea' && typeof propuesta.args.title === 'string';
}

export function isAssignmentProposal(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: AssignmentProposal } {
  return propuesta.tool === 'proponer_asignacion' && typeof propuesta.args.taskId === 'string';
}

export function isEditProposal(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: EditProposal } {
  return propuesta.tool === 'proponer_edicion' && typeof propuesta.args.taskId === 'string';
}

export function isMoveProposal(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: MoveProposal } {
  return propuesta.tool === 'proponer_movimiento' && typeof propuesta.args.columnId === 'string';
}

export function isChecklistProposal(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: ChecklistProposal } {
  return propuesta.tool === 'proponer_checklist' && Array.isArray(propuesta.args.items);
}

export function isCommentProposal(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: CommentProposal } {
  return propuesta.tool === 'proponer_comentario' && typeof propuesta.args.body === 'string';
}

export function isBoardProposal(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: BoardProposal } {
  return propuesta.tool === 'proponer_tablero' && Array.isArray(propuesta.args.columnas);
}

export function isOpenProjectProposal(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: OpenProjectProposal } {
  return (
    propuesta.tool === 'proponer_abrir_proyecto' && typeof propuesta.args.projectId === 'string'
  );
}

export function isTemplateProposal(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: TemplateProposal } {
  return propuesta.tool === 'proponer_plantilla' && Array.isArray(propuesta.args.espacios);
}

export function isQuestionProposal(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: QuestionProposal } {
  return propuesta.tool === 'proponer_pregunta' && Array.isArray(propuesta.args.preguntas);
}

export function isDeleteProposal(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: DeleteProposal } {
  return propuesta.tool === 'proponer_borrado' && typeof propuesta.args.taskId === 'string';
}

export function isCheckStepsProposal(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: CheckStepsProposal } {
  return propuesta.tool === 'proponer_marcar_pasos' && Array.isArray(propuesta.args.itemIds);
}

export function isChartProposal(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: ChartProposal } {
  return (
    propuesta.tool === 'proponer_grafico' &&
    typeof propuesta.args.grafico === 'object' &&
    propuesta.args.grafico !== null
  );
}

export function isMessageProposal(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: MessageProposal } {
  return propuesta.tool === 'proponer_mensaje' && typeof propuesta.args.body === 'string';
}

/**
 * `2026-08-01T00:00:00.000Z` → `1 de agosto`.
 *
 * Al agotar la cuota hay que decir **cuándo vuelve**. Un límite sin fecha es un
 * muro; con fecha es una espera.
 */
export function formatoReinicio(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return 'el día 1 del mes que viene';
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long' }).format(fecha);
}
