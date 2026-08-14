/**
 * Las formas que devuelve `assistant-service` a través del gateway.
 *
 * Se declaran aquí y no se importan de `@praxis/contracts` por lo mismo que las
 * de `reports.ts`: ese paquete es de backend —arrastra `class-validator` y los
 * decoradores de Swagger— y el frontend solo necesita la forma.
 *
 * ⚠️ Los límites de cuota **no** se copian aquí. El backend los manda dentro de
 * `AssistantQuota.limite` en cada respuesta, y un segundo sitio donde apuntar
 * «50» sería un sitio donde discrepar: un contador que diga «quedan 12» mientras
 * el servidor rechaza el siguiente es peor que no enseñar contador.
 */

export interface AssistantQuota {
  plan: 'FREE' | 'PRO';
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
 * Se estrecha con `esPropuestaDeTarea` / `esPropuestaDeAsignacion` justo antes
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
export interface PropuestaTarea {
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
export interface PropuestaAsignacion {
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
export interface PropuestaEdicion extends SobreTarea {
  title?: string;
  description?: string;
  priority?: string;
  dueDate?: string;
  /** La lista completa que queda, no las que se añaden. */
  labelIds?: string[];
}

/** `proponer_movimiento`. */
export interface PropuestaMovimiento extends SobreTarea {
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
export interface PropuestaChecklist extends SobreTarea {
  items: string[];
}

/** `proponer_comentario`. Se publica a nombre de quien acepta. */
export interface PropuestaComentario extends SobreTarea {
  body: string;
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
export interface PropuestaMensaje {
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
export interface PropuestaMarcarPasos extends SobreTarea {
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
export interface PropuestaGrafico {
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

export type EstadoPropuesta = 'PENDING' | 'ACCEPTED' | 'DISCARDED';

/** Una conversación en la lista lateral, sin sus mensajes. */
export interface ConversacionResumen {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  mensajes: number;
}

/** Un turno tal y como vuelve de la base al releer una conversación. */
export interface MensajeGuardado {
  id: string;
  role: 'user' | 'model';
  text: string;
  createdAt: string;
  proposals: AssistantProposal[];
}

export interface ConversacionCompleta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  mensajes: MensajeGuardado[];
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

export function esPropuestaDeTarea(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: PropuestaTarea } {
  return propuesta.tool === 'proponer_tarea' && typeof propuesta.args.title === 'string';
}

export function esPropuestaDeAsignacion(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: PropuestaAsignacion } {
  return propuesta.tool === 'proponer_asignacion' && typeof propuesta.args.taskId === 'string';
}

export function esPropuestaDeEdicion(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: PropuestaEdicion } {
  return propuesta.tool === 'proponer_edicion' && typeof propuesta.args.taskId === 'string';
}

export function esPropuestaDeMovimiento(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: PropuestaMovimiento } {
  return propuesta.tool === 'proponer_movimiento' && typeof propuesta.args.columnId === 'string';
}

export function esPropuestaDeChecklist(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: PropuestaChecklist } {
  return propuesta.tool === 'proponer_checklist' && Array.isArray(propuesta.args.items);
}

export function esPropuestaDeComentario(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: PropuestaComentario } {
  return propuesta.tool === 'proponer_comentario' && typeof propuesta.args.body === 'string';
}

export function esPropuestaDeMarcarPasos(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: PropuestaMarcarPasos } {
  return propuesta.tool === 'proponer_marcar_pasos' && Array.isArray(propuesta.args.itemIds);
}

export function esPropuestaDeGrafico(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: PropuestaGrafico } {
  return (
    propuesta.tool === 'proponer_grafico' &&
    typeof propuesta.args.grafico === 'object' &&
    propuesta.args.grafico !== null
  );
}

export function esPropuestaDeMensaje(
  propuesta: AssistantProposal,
): propuesta is AssistantProposal & { args: PropuestaMensaje } {
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
