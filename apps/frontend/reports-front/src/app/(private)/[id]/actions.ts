'use server';

import { ApiError, type ProjectDetail, type Task } from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import {
  type AssistantChatResult,
  type AssistantQuota,
  type ChatTurn,
  MAX_HISTORIAL,
  type PropuestaAsignacion,
  type PropuestaTarea,
} from '@/lib/assistant';

/**
 * Las acciones del asistente.
 *
 * ## La regla que gobierna este archivo
 *
 * **La IA propone; ejecuta el código que ya existe.** `preguntarAction` solo
 * habla con el asistente y devuelve texto y propuestas. Escribir es otra cosa y
 * pasa por `aceptarTareaAction` / `aceptarAsignacionAction`, que llaman a los
 * **mismos endpoints que el formulario del tablero** —`POST /boards/:id/tasks`,
 * `POST /tasks/:id/assign`— con los mismos permisos, la misma validación y los
 * mismos 400 y 403 que ya están probados. No se abre ninguna vía de escritura
 * nueva: sin `canCreateTask`, aceptar falla igual que le fallaría a esa persona
 * pulsando el botón a mano.
 *
 * ⚠️ **Nada de lo que llega aquí desde el chat es de fiar**, y no hace falta que
 * lo sea: la propuesta viaja por el navegador, así que el `columnId` se vuelve a
 * resolver contra el proyecto de verdad y el permiso lo comprueba el gateway.
 *
 * Comprueban la sesión por su cuenta, como las del tablero: una Server Function
 * viaja como POST a la ruta donde se usa y un cambio de `matcher` en `proxy.ts`
 * podría dejarla fuera del guard.
 *
 * ⚠️ **Ninguna llama a `revalidatePath`, y es a propósito.** Lo que cambia al
 * aceptar es el tablero, que vive en otra zona y no comparte caché con esta;
 * revalidar aquí solo conseguiría volver a renderizar la página de reportes
 * —cinco informes, dos de ellos recorriendo el historial— para no cambiar ni un
 * píxel de lo que se está viendo.
 */

async function requireApi() {
  const session = await getSession();
  if (!session) return null;
  return createServerApiClient();
}

/**
 * Traduce el fallo a algo que se pueda leer en una burbuja de chat.
 *
 * El 429 es el único con un mensaje propio del backend que merece salir tal
 * cual: lleva el límite y la fecha de reinicio.
 */
function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'No tienes permiso para hacer esto en este proyecto.';
    if (error.status === 404) return 'Eso ya no existe en el proyecto.';
    if (error.status >= 500 && error.status !== 502) return fallback;
    return error.message;
  }
  return fallback;
}

/** La cuota que el backend mete en `details` del 429, si viene. */
function cuotaDelError(error: unknown): AssistantQuota | null {
  if (!(error instanceof ApiError)) return null;
  const details = error.details;
  if (details && typeof details === 'object' && 'cuota' in details) {
    return (details as { cuota: AssistantQuota }).cuota;
  }
  return null;
}

export interface RespuestaChat {
  reply: string | null;
  proposals: AssistantChatResult['proposals'];
  /** Siempre que se pueda saber: también cuando el turno falla por cuota. */
  cuota: AssistantQuota | null;
  error: string | null;
}

/**
 * Un turno de conversación.
 *
 * El historial lo manda el cliente —no hay tabla de conversaciones, queda fuera
 * del alcance— y se recorta aquí a `MAX_HISTORIAL`: el DTO del gateway lo
 * rechaza con 400 si se pasa, y un 400 por algo que sabemos de antemano es un
 * mensaje perdido.
 */
export async function preguntarAction(
  projectId: string,
  message: string,
  history: ChatTurn[],
): Promise<RespuestaChat> {
  const api = await requireApi();
  if (!api) {
    return { reply: null, proposals: [], cuota: null, error: 'Tu sesión ha caducado.' };
  }

  const texto = message.trim();
  if (texto.length === 0) {
    return { reply: null, proposals: [], cuota: null, error: 'Escribe algo primero.' };
  }
  if (texto.length > 2000) {
    return {
      reply: null,
      proposals: [],
      cuota: null,
      error: 'El mensaje no puede pasar de 2 000 caracteres.',
    };
  }

  try {
    const resultado = await api.post<AssistantChatResult>(
      `/projects/${projectId}/assistant/chat`,
      {
        message: texto,
        history: history.slice(-MAX_HISTORIAL).map((turno) => ({
          role: turno.role,
          text: turno.text.slice(0, 2000),
        })),
      },
    );

    /* Contra el `data`, no contra el status: un 200 con el cuerpo vacío es la
       forma en que este backend ha fallado antes. */
    if (!resultado?.reply) {
      return {
        reply: null,
        proposals: [],
        cuota: resultado?.cuota ?? null,
        error: 'El asistente no ha respondido nada.',
      };
    }

    return {
      reply: resultado.reply,
      proposals: resultado.proposals ?? [],
      cuota: resultado.cuota ?? null,
      error: null,
    };
  } catch (error) {
    return {
      reply: null,
      proposals: [],
      /* En el 429 la cuota viaja en el error: el contador tiene que quedar en
         el tope, no en el número de antes de intentarlo. */
      cuota: cuotaDelError(error),
      error: describe(error, 'El asistente no ha podido responder. Inténtalo otra vez.'),
    };
  }
}

/** Cuánta cuota queda. La pide la página al cargar, antes de escribir nada. */
export async function cuotaAction(projectId: string): Promise<AssistantQuota | null> {
  const api = await requireApi();
  if (!api) return null;
  return api
    .get<AssistantQuota>(`/projects/${projectId}/assistant/quota`)
    .catch(() => null);
}

export interface AceptarTareaState {
  error: string | null;
  creada: { id: string; title: string; boardId: string } | null;
}

/**
 * Crear de verdad la tarea que se propuso.
 *
 * Dos cosas se resuelven **aquí y no en el chat**, y las dos por el mismo
 * motivo —que la propuesta ha pasado por el navegador—:
 *
 * - **el tablero**, que la propuesta no trae: se busca la columna en el
 *   proyecto de verdad, y de paso eso confirma que la columna sigue existiendo;
 * - **`status`**, que tiene que igualar el nombre de la columna destino
 *   (trampa del contrato) y se toma del proyecto, no de lo que diga el modelo.
 */
export async function aceptarTareaAction(
  projectId: string,
  propuesta: PropuestaTarea,
): Promise<AceptarTareaState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', creada: null };

  const title = String(propuesta.title ?? '').trim();
  if (title.length === 0) return { error: 'La tarea necesita un título.', creada: null };
  if (title.length > 120) {
    return { error: 'El título no puede superar 120 caracteres.', creada: null };
  }

  const project = await api.get<ProjectDetail>(`/projects/${projectId}`).catch(() => null);
  const columna = (project?.workspaces ?? [])
    .flatMap((workspace) => workspace.boards ?? [])
    .flatMap((board) => (board.columns ?? []).map((column) => ({ column, board })))
    .find(({ column }) => column.id === propuesta.columnId);

  if (!columna) {
    return { error: 'La columna de la propuesta ya no existe en el tablero.', creada: null };
  }

  try {
    const created = await api.post<Task>(`/boards/${columna.board.id}/tasks`, {
      columnId: columna.column.id,
      title,
      /* El nombre de la columna, no el que venga en la propuesta. */
      status: columna.column.name,
      ...(propuesta.description && { description: propuesta.description }),
      ...(propuesta.dueDate && { dueDate: toIsoDueDate(propuesta.dueDate) }),
      ...(propuesta.priority && { priority: propuesta.priority }),
      ...(propuesta.assigneeIds?.length && { assigneeIds: propuesta.assigneeIds }),
      ...(propuesta.labelIds?.length && { labelIds: propuesta.labelIds }),
    });

    if (!created?.id || created.title !== title) {
      return { error: 'El servidor no guardó la tarea.', creada: null };
    }

    return {
      error: null,
      creada: { id: created.id, title: created.title, boardId: columna.board.id },
    };
  } catch (error) {
    return { error: describe(error, 'No se pudo crear la tarea.'), creada: null };
  }
}

export interface AceptarAsignacionState {
  error: string | null;
  asignada: { id: string; title: string; boardId: string; cuantos: number } | null;
}

/**
 * Cambiar quién lleva una tarea que ya existe.
 *
 * ⚠️ **El `taskId` de esta propuesta lo escribió la persona en el chat**, porque
 * los ids de tarea no viajan en el contexto del modelo a propósito. Así que lo
 * primero es traer la tarea: sirve para confirmar que existe, para comprobar que
 * es de **este** proyecto —un id de otro proyecto respondería 403 y se leería
 * como un fallo de permisos que no es— y para poder decir en la confirmación
 * cuál se ha tocado, con su nombre.
 */
export async function aceptarAsignacionAction(
  projectId: string,
  propuesta: PropuestaAsignacion,
): Promise<AceptarAsignacionState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', asignada: null };

  const taskId = String(propuesta.taskId ?? '').trim();
  if (!taskId) return { error: 'La propuesta no dice qué tarea.', asignada: null };

  const tarea = await api.get<Task>(`/tasks/${taskId}`).catch(() => null);
  if (!tarea?.id) {
    return { error: 'Esa tarea no existe. Comprueba el id que le diste.', asignada: null };
  }
  if (tarea.projectId !== projectId) {
    return { error: 'Esa tarea es de otro proyecto.', asignada: null };
  }

  const assigneeIds = propuesta.assigneeIds ?? [];

  try {
    /* La lista completa sustituye a la que hubiera: es la semántica de
       `assigneeIds` en todo el contrato, y es también lo que se le declaró al
       modelo. */
    const guardada = await api.post<Task>(`/tasks/${taskId}/assign`, { assigneeIds });

    const quedan = (guardada?.assignees ?? []).map((asignado) => asignado.userId);
    if (!guardada?.id || quedan.length !== assigneeIds.length) {
      return { error: 'El servidor no guardó los encargados.', asignada: null };
    }

    return {
      error: null,
      asignada: {
        id: guardada.id,
        title: guardada.title,
        boardId: guardada.boardId,
        cuantos: quedan.length,
      },
    };
  } catch (error) {
    return { error: describe(error, 'No se pudo cambiar el encargado.'), asignada: null };
  }
}

/**
 * `YYYY-MM-DD` → ISO al final de ese día.
 *
 * Igual que en el tablero: una fecha de vencimiento se cumple **durante** el día,
 * no a las 00:00. Sin esto, «para el viernes» vence el jueves por la noche.
 */
function toIsoDueDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59).toISOString();
}
