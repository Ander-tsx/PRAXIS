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

export async function createSprintAction(
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
  if (name.length > 100)
    return { error: 'El nombre no puede pasar de 100 caracteres.', done: null };
  if (goal.length > 500) return { error: 'La meta no puede pasar de 500 caracteres.', done: null };

  try {
    const sprint = await api.post<Sprint>(`/boards/${boardId}/sprints`, {
      name,
      ...(goal && { goal }),
    });
    if (!sprint?.id) return { error: 'El servidor no creó el sprint.', done: null };
  } catch (error) {
    return { error: describe(error, 'No se pudo crear el sprint.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'created' };
}

/**
 * Arranca un sprint planeado.
 *
 * Las fechas llegan como `YYYY-MM-DD` del `<input type="date">` y se mandan
 * como el **principio del día de inicio** y el **final del día de fin**, en
 * hora local de quien lo arranca: un sprint «del 1 al 14» incluye el 14 entero.
 */
export async function startSprintAction(
  _prev: SprintState,
  formData: FormData,
): Promise<SprintState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const boardId = String(formData.get('boardId') ?? '');
  const sprintId = String(formData.get('sprintId') ?? '');
  const start = String(formData.get('startDate') ?? '');
  const end = String(formData.get('endDate') ?? '');
  /* Minutos de diferencia con UTC del navegador, para que «del 1 al 14» no se
     desplace un día según el huso del servidor. */
  const offset = Number(formData.get('tzOffset') ?? 0);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return { error: 'Elige la fecha de inicio y la de fin.', done: null };
  }
  if (end < start)
    return { error: 'La fecha de fin no puede ser anterior a la de inicio.', done: null };

  const aIso = (dia: string, hora: string) =>
    new Date(new Date(`${dia}T${hora}Z`).getTime() + offset * 60_000).toISOString();

  try {
    const sprint = await api.post<Sprint>(`/boards/${boardId}/sprints/${sprintId}/start`, {
      startDate: aIso(start, '00:00:00.000'),
      endDate: aIso(end, '23:59:59.999'),
    });
    if (sprint?.status !== 'ACTIVE')
      return { error: 'El servidor no arrancó el sprint.', done: null };
  } catch (error) {
    return { error: describe(error, 'No se pudo iniciar el sprint.'), done: null };
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

  if (resolutions.some((r) => r.action === 'nextSprint') && !nextSprintId) {
    return {
      error: 'Elige a qué sprint pasan las tareas, o mándalas al backlog.',
      done: null,
      pending: null,
    };
  }

  try {
    const sprint = await api.post<Sprint>(`/boards/${boardId}/sprints/${sprintId}/close`, {
      resolutions,
      ...(nextSprintId && { nextSprintId }),
    });
    if (sprint?.status !== 'CLOSED') {
      return { error: 'El servidor no cerró el sprint.', done: null, pending: null };
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
 * Mueve una tarea al backlog (`sprintId` vacío) o a un sprint (D2).
 *
 * Es un `PATCH` de la tarea, con `canEditTask`: decidir en qué sprint cae una
 * tarea es planificación del trabajo, no gestión del sprint.
 */
export async function moveToSprintAction(
  _prev: SprintState,
  formData: FormData,
): Promise<SprintState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const taskId = String(formData.get('taskId') ?? '');
  const sprintId = String(formData.get('sprintId') ?? '') || null;

  try {
    const task = await api.patch<Task>(`/tasks/${taskId}`, { sprintId });
    if ((task?.sprintId ?? null) !== sprintId) {
      return { error: 'El servidor no movió la tarea.', done: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo mover la tarea.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: sprintId ? 'sprint' : 'backlog' };
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

/**
 * Sube o baja una tarea en el backlog.
 *
 * El orden del backlog es `Task.order`, el mismo que usa la columna (D5): se
 * renumeran solo las que cambian, por `POST /tasks/:id/move` con la **misma
 * columna** que ya tenían — el backend no reindexa por su cuenta.
 *
 * Llega como `id:columnId:orden` separados por comas.
 */
export async function reorderBacklogAction(
  _prev: SprintState,
  formData: FormData,
): Promise<SprintState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const cambios = String(formData.get('cambios') ?? '')
    .split(',')
    .filter(Boolean)
    .slice(0, 60)
    .map((trio) => {
      const [id, columnId, orden] = trio.split(':');
      return { id, columnId, order: Number(orden) };
    })
    .filter((c) => c.id && c.columnId && Number.isInteger(c.order) && c.order >= 0);

  const resultados = await Promise.allSettled(
    cambios.map((c) =>
      api.post<Task>(`/tasks/${c.id}/move`, { columnId: c.columnId, order: c.order }),
    ),
  );

  revalidateProject(projectId);
  if (resultados.some((r) => r.status === 'rejected')) {
    return { error: 'Parte del orden no se guardó. Recarga para ver el orden real.', done: null };
  }
  return { error: null, done: 'reordered' };
}
