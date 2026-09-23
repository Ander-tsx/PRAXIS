'use server';

import type { CloseSprintState, SprintState } from '@/lib/projects/action-state';
import {
  ApiError,
  type Board,
  type PendingSprintTask,
  SPRINT_HAS_PENDING_TASKS_CODE,
  type Sprint,
  type Task,
  el403SeExplicaSolo,
} from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { revalidatePath } from 'next/cache';

/**
 * Acciones de Scrum: el interruptor del tablero, los sprints y el paso de
 * tareas entre backlog y sprint. Ver `docs/PLAN-SCRUM-KANBAN.md`.
 *
 * Viven aparte de `actions.ts` —que ya pasa de mil novecientas líneas— por la
 * misma razón que `invitation-actions.ts`: son un dominio propio. Comprueban
 * la sesión igual que aquellas, y confirman contra el `data` de la respuesta,
 * no contra el status.
 */

async function requireApi() {
  const session = await getSession();
  if (!session) return null;
  return createServerApiClient();
}

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
}

/** Mismo criterio que `describe` de `actions.ts`: un 403 con código propio se explica solo. */
function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      if (el403SeExplicaSolo(error.code)) return error.message;
      return 'No tienes permiso para hacer esto en este tablero.';
    }
    if (error.status >= 500) return fallback;
    return error.message;
  }
  return fallback;
}

/**
 * Encender o apagar Scrum en un tablero (D1).
 *
 * Apagarlo no cierra ningún sprint ni mueve ninguna tarea (invariante 3): solo
 * esconde Backlog y Sprint. Por eso no pide confirmación.
 */
export async function toggleScrumAction(
  _prev: SprintState,
  formData: FormData,
): Promise<SprintState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const boardId = String(formData.get('boardId') ?? '');
  const enabled = formData.get('enabled') === 'true';

  try {
    const board = await api.patch<Board>(`/boards/${boardId}`, { scrumEnabled: enabled });
    if (board?.scrumEnabled !== enabled) {
      return { error: 'El servidor no guardó el cambio.', done: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo cambiar el modo del tablero.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: enabled ? 'on' : 'off' };
}

/** `YYYY-MM-DD` local → ISO, al principio o al final del día (ver `startSprintAction`). */
function fechasDelFormulario(
  formData: FormData,
  prefijo = '',
): { startDate: string; endDate: string } | { error: string } {
  const start = String(formData.get(`${prefijo}startDate`) ?? '');
  const end = String(formData.get(`${prefijo}endDate`) ?? '');
  const offset = Number(formData.get('tzOffset') ?? 0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return { error: 'Elige la fecha de inicio y la de fin.' };
  }
  if (end < start) return { error: 'La fecha de fin no puede ser anterior a la de inicio.' };
  const aIso = (dia: string, hora: string) =>
    new Date(new Date(`${dia}T${hora}Z`).getTime() + offset * 60_000).toISOString();
  return { startDate: aIso(start, '00:00:00.000'), endDate: aIso(end, '23:59:59.999') };
}

/**
 * Crea y arranca un sprint en un solo paso: lo que ve la persona es «Empezar
 * sprint», no «planear» y luego «iniciar» (D16 de `docs/PLAN-SCRUM-KANBAN.md`).
 * El backend sigue teniendo los dos estados; aquí se encadenan.
 */
export async function startNewSprintAction(
  _prev: SprintState,
  formData: FormData,
): Promise<SprintState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const boardId = String(formData.get('boardId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const goal = String(formData.get('goal') ?? '').trim();
  if (name.length < 2) return { error: 'El nombre necesita al menos 2 caracteres.', done: null };
  const fechas = fechasDelFormulario(formData);
  if ('error' in fechas) return { error: fechas.error, done: null };

  try {
    const sprint = await api.post<Sprint>(`/boards/${boardId}/sprints`, {
      name: name.slice(0, 100),
      ...(goal && { goal: goal.slice(0, 500) }),
    });
    const iniciado = await api.post<Sprint>(
      `/boards/${boardId}/sprints/${sprint.id}/start`,
      fechas,
    );
    if (iniciado?.status !== 'ACTIVE')
      return { error: 'El servidor no arrancó el sprint.', done: null };
  } catch (error) {
    return { error: describe(error, 'No se pudo empezar el sprint.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'started' };
}

/**
 * Cierra el sprint activo.
 *
 * `resolutions` llega como `taskId:backlog,taskId:nextSprint`. La primera vez
 * que se abre el diálogo no se sabe qué hay pendiente, así que puede mandarse
 * vacío: el 409 devuelve la lista y el diálogo pregunta por cada tarea (D6).
 */
export async function closeSprintAction(
  _prev: CloseSprintState,
  formData: FormData,
): Promise<CloseSprintState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null, pending: null };

  const projectId = String(formData.get('projectId') ?? '');
  const boardId = String(formData.get('boardId') ?? '');
  const sprintId = String(formData.get('sprintId') ?? '');
  const nextSprintId = String(formData.get('nextSprintId') ?? '');
  const resolutions = String(formData.get('resolutions') ?? '')
    .split(',')
    .filter(Boolean)
    .map((par) => {
      const [taskId, action] = par.split(':');
      return { taskId, action };
    })
    .filter((r) => r.taskId && (r.action === 'backlog' || r.action === 'nextSprint'));

  /* El siguiente sprint se crea aquí mismo, con su nombre y sus fechas, y se
     arranca en cuanto el actual queda cerrado (D16). */
  const nombreSiguiente = String(formData.get('nextName') ?? '').trim();
  const alSiguiente = resolutions.some((r) => r.action === 'nextSprint');
  const fechasSiguiente = alSiguiente ? fechasDelFormulario(formData, 'next') : null;
  if (fechasSiguiente && 'error' in fechasSiguiente) {
    return { error: fechasSiguiente.error, done: null, pending: null };
  }
  if (alSiguiente && !nextSprintId && nombreSiguiente.length < 2) {
    return { error: 'Ponle nombre al siguiente sprint.', done: null, pending: null };
  }

  try {
    let siguienteId = nextSprintId;
    if (alSiguiente && !siguienteId) {
      const nuevo = await api.post<Sprint>(`/boards/${boardId}/sprints`, {
        name: nombreSiguiente.slice(0, 100),
      });
      siguienteId = nuevo.id;
    }
    const sprint = await api.post<Sprint>(`/boards/${boardId}/sprints/${sprintId}/close`, {
      resolutions,
      ...(alSiguiente && siguienteId && { nextSprintId: siguienteId }),
    });
    if (sprint?.status !== 'CLOSED') {
      return { error: 'El servidor no cerró el sprint.', done: null, pending: null };
    }
    if (alSiguiente && siguienteId && fechasSiguiente && !('error' in fechasSiguiente)) {
      await api.post<Sprint>(`/boards/${boardId}/sprints/${siguienteId}/start`, fechasSiguiente);
    }
  } catch (error) {
    if (error instanceof ApiError && error.code === SPRINT_HAS_PENDING_TASKS_CODE) {
      const details = error.details as { pending?: PendingSprintTask[] } | null;
      return { error: null, done: null, pending: details?.pending ?? [] };
    }
    return { error: describe(error, 'No se pudo cerrar el sprint.'), done: null, pending: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'closed', pending: null };
}

/**
 * Trae una tarea del backlog al sprint en curso, **a la columna donde se
 * soltó** (D14 de `docs/PLAN-SCRUM-KANBAN.md`). Un solo `PATCH`: sprint,
 * columna y `status` a la vez — el gateway resuelve si la columna es de cierre.
 */
export async function pullToSprintAction(
  _prev: SprintState,
  formData: FormData,
): Promise<SprintState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const taskId = String(formData.get('taskId') ?? '');
  const sprintId = String(formData.get('sprintId') ?? '');
  const columnId = String(formData.get('columnId') ?? '');
  const status = String(formData.get('status') ?? '');

  try {
    const task = await api.patch<Task>(`/tasks/${taskId}`, { sprintId, columnId, status });
    if (task?.sprintId !== sprintId || task.columnId !== columnId) {
      return { error: 'El servidor no movió la tarea.', done: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo meter la tarea en el sprint.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: taskId };
}

/**
 * Crea una tarea **en el backlog**: `sprintId: null` explícito, para que el
 * gateway no la ate al sprint activo (D12). Nace en la primera columna del
 * tablero, que es donde empezará cuando entre en un sprint.
 */
export async function createBacklogTaskAction(
  _prev: SprintState,
  formData: FormData,
): Promise<SprintState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const boardId = String(formData.get('boardId') ?? '');
  const columnId = String(formData.get('columnId') ?? '');
  const status = String(formData.get('status') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const order = Number(formData.get('order') ?? 0);
  /* Los datos básicos de una tarea Scrum: lo que hace falta para poder
     planearla sin abrirla otra vez. */
  const description = String(formData.get('description') ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
  const priority = String(formData.get('priority') ?? '');
  const puntos = String(formData.get('estimatePoints') ?? '').trim();
  const estimatePoints = puntos === '' ? undefined : Number(puntos);
  const assigneeIds = formData.getAll('assigneeIds').map(String).filter(Boolean);

  if (
    estimatePoints !== undefined &&
    (!Number.isInteger(estimatePoints) || estimatePoints < 0 || estimatePoints > 999)
  ) {
    return { error: 'Los puntos tienen que ser un número entero entre 0 y 999.', done: null };
  }

  if (!title) return { error: 'Escribe un título.', done: null };
  if (title.length > 255)
    return { error: 'El título no puede pasar de 255 caracteres.', done: null };
  if (!columnId) return { error: 'El tablero necesita al menos una columna.', done: null };

  try {
    const task = await api.post<Task>(`/boards/${boardId}/tasks`, {
      columnId,
      status,
      title,
      order,
      sprintId: null,
      ...(description && { description }),
      ...(['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(priority) && { priority }),
      ...(estimatePoints !== undefined && { estimatePoints }),
      ...(assigneeIds.length > 0 && { assigneeIds }),
    });
    if (!task?.id || task.sprintId !== null) {
      return { error: 'El servidor no creó la tarea en el backlog.', done: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo crear la tarea.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'created' };
}
