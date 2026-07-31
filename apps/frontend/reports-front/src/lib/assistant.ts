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
  tool: string;
  args: Record<string, unknown>;
}

/** `proponer_tarea`, ya validada contra el proyecto por el servicio. */
export interface PropuestaTarea {
  title: string;
  description?: string;
  columnId: string;
  /** El nombre de la columna destino. Viaja en la propuesta: `status` lo iguala. */
  columnName: string;
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

export interface AssistantChatResult {
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
