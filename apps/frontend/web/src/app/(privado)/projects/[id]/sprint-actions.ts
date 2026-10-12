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
 * Al encender, `taskIds` son las tareas abiertas que ya estaban en columnas y
 * que la persona eligió llevarse al primer sprint: sin eso, el tablero de todo
 * el equipo se quedaba en blanco de golpe (auditoría S7). Al apagar, el
 * servidor exige que no haya un sprint en marcha (S8).
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
  const taskIds = formData.getAll('taskIds').map(String).filter(Boolean);

  try {
    const board = await api.patch<Board>(`/boards/${boardId}`, { scrumEnabled: enabled });
    if (board?.scrumEnabled !== enabled) {
      return { error: 'El servidor no guardó el cambio.', done: null };
    }
    if (enabled && taskIds.length > 0) {
      const sprint = await api.post<Sprint>(`/boards/${boardId}/sprints`, { name: 'Sprint 1' });
      await api.post(`/boards/${boardId}/sprints/${sprint.id}/tasks`, { taskIds });
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo cambiar el modo del tablero.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: enabled ? 'on' : 'off' };
}

/**
 * Renombra la columna final de solo lectura de un tablero con Scrum («Closed» por defecto).
 * Es una propiedad del tablero, así que pide `canEditBoard` como renombrarlo. Un nombre vacío la
 * devuelve a su nombre por defecto.
 */
export async function renameClosedColumnAction(
  _prev: SprintState,
  formData: FormData,
): Promise<SprintState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const boardId = String(formData.get('boardId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (name.length > 40) return { error: 'El nombre admite 40 caracteres como máximo.', done: null };

  try {
    const board = await api.patch<Board>(`/boards/${boardId}`, { closedColumnName: name });
    if ((board?.closedColumnName ?? '') !== name) {
      return { error: 'El servidor no guardó el cambio.', done: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo renombrar la columna.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'renamed' };
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
 * Planea un sprint vacío: «el siguiente». Nace sin fechas; se le ponen al
 * empezarlo.
 */
export async function createPlannedSprintAction(
  _prev: SprintState,
  formData: FormData,
): Promise<SprintState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const boardId = String(formData.get('boardId') ?? '');
  const name = String(formData.get('name') ?? '').trim() || 'Siguiente sprint';

  try {
    const sprint = await api.post<Sprint>(`/boards/${boardId}/sprints`, {
      name: name.slice(0, 100),
    });
    if (!sprint?.id) return { error: 'El servidor no creó el sprint.', done: null };
  } catch (error) {
    return { error: describe(error, 'No se pudo planear el sprint.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'planned' };
}

/**
 * Empieza el sprint planeado: fija nombre, meta y fechas, y arranca el reloj.
 *
 * Lo que ya estaba dentro es el compromiso; lo que entre después, alcance
 * añadido. Por eso se planea **antes** de empezar (auditoría S1).
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
  const name = String(formData.get('name') ?? '').trim();
  const goal = String(formData.get('goal') ?? '').trim();
  if (name.length < 2) return { error: 'El nombre necesita al menos 2 caracteres.', done: null };
  const fechas = fechasDelFormulario(formData);
  if ('error' in fechas) return { error: fechas.error, done: null };

  try {
    await api.patch<Sprint>(`/boards/${boardId}/sprints/${sprintId}`, {
      name: name.slice(0, 100),
      goal: goal.slice(0, 500),
    });
    const iniciado = await api.post<Sprint>(`/boards/${boardId}/sprints/${sprintId}/start`, fechas);
    if (iniciado?.status !== 'ACTIVE') {
      return { error: 'El servidor no arrancó el sprint.', done: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo empezar el sprint.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'started' };
}

/**
 * Nombre, meta y fechas de un sprint. De uno en curso solo viaja el final: el
 * inicio ya pasó y el servidor lo rechaza.
 */
export async function updateSprintAction(
  _prev: SprintState,
  formData: FormData,
): Promise<SprintState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const boardId = String(formData.get('boardId') ?? '');
  const sprintId = String(formData.get('sprintId') ?? '');
  const enCurso = formData.get('enCurso') === 'true';
  const name = String(formData.get('name') ?? '').trim();
  const goal = String(formData.get('goal') ?? '').trim();
  if (name.length < 2) return { error: 'El nombre necesita al menos 2 caracteres.', done: null };

  const cuerpo: Record<string, string> = { name: name.slice(0, 100), goal: goal.slice(0, 500) };
  if (formData.has('endDate')) {
    const fechas = fechasDelFormulario(formData);
    if ('error' in fechas) return { error: fechas.error, done: null };
    cuerpo.endDate = fechas.endDate;
    if (!enCurso) cuerpo.startDate = fechas.startDate;
  }

  try {
    const sprint = await api.patch<Sprint>(`/boards/${boardId}/sprints/${sprintId}`, cuerpo);
    if (sprint?.name !== cuerpo.name)
      return { error: 'El servidor no guardó el sprint.', done: null };
  } catch (error) {
    return { error: describe(error, 'No se pudo guardar el sprint.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'saved' };
}

/** Descarta el sprint planeado; sus tareas vuelven al backlog. */
export async function discardSprintAction(
  _prev: SprintState,
  formData: FormData,
): Promise<SprintState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const boardId = String(formData.get('boardId') ?? '');
  const sprintId = String(formData.get('sprintId') ?? '');

  try {
    await api.delete(`/boards/${boardId}/sprints/${sprintId}`);
  } catch (error) {
    return { error: describe(error, 'No se pudo descartar el sprint.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'discarded' };
}

/**
 * Cierra el sprint en curso.
 *
 * `resolutions` llega como `taskId:backlog,taskId:nextSprint`. Lo que pasa al
 * siguiente va al sprint planeado —o a uno nuevo con `nextName`—, que **queda
 * planeado**: el servidor orquesta todo en una llamada y el equipo planifica
 * antes de empezarlo (auditoría S1 y S4). Si entre abrir el diálogo y
 * confirmar apareció otra pendiente, el 409 devuelve la lista y se pregunta.
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
  const nextName = String(formData.get('nextName') ?? '').trim();
  const resolutions = String(formData.get('resolutions') ?? '')
    .split(',')
    .filter(Boolean)
    .map((par) => {
      const [taskId, action] = par.split(':');
      return { taskId, action };
    })
    .filter((r) => r.taskId && (r.action === 'backlog' || r.action === 'nextSprint'));

  try {
    const sprint = await api.post<Sprint>(`/boards/${boardId}/sprints/${sprintId}/close`, {
      resolutions,
      ...(nextName.length >= 2 && { nextName: nextName.slice(0, 100) }),
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

/** Tope de tareas renumeradas por gesto, como `MAX_RENUMERACIONES` de `actions.ts`. */
const MAX_RENUMERACIONES = 60;

/**
 * El gesto de planificar: una tarea que se suelta en el backlog o en una
 * columna del sprint que enseña el tablero (D14).
 *
 * - `sprintId`: el sprint destino si la tarea entra en uno. Vacío con
 *   `nombreNuevo` crea el planeado en el acto —es lo que pasa al soltar la
 *   primera tarea en un tablero sin sprint—.
 * - `destino`: `backlog` o el id de la columna.
 * - `renumerar`: `id:orden:columna` de las vecinas cuyo `order` cambia.
 *
 * Volver al backlog lleva la tarea a la **primera columna**: el backlog es
 * trabajo por empezar, y una tarea terminada sin sprint no se enseña en él.
 */
export async function planTaskAction(_prev: SprintState, formData: FormData): Promise<SprintState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const boardId = String(formData.get('boardId') ?? '');
  const taskId = String(formData.get('taskId') ?? '');
  const destino = String(formData.get('destino') ?? '');
  const status = String(formData.get('status') ?? '');
  const order = Number(formData.get('order') ?? 0);
  const cambiaSprint = formData.get('cambiaSprint') === 'true';
  const alBacklog = destino === 'backlog';
  const columnId = alBacklog ? String(formData.get('primeraColumna') ?? '') : destino;

  try {
    if (cambiaSprint) {
      let sprintId: string | null = null;
      if (!alBacklog) {
        sprintId = String(formData.get('sprintId') ?? '') || null;
        if (!sprintId) {
          const nombre = String(formData.get('nombreNuevo') ?? '').trim() || 'Sprint 1';
          const nuevo = await api.post<Sprint>(`/boards/${boardId}/sprints`, { name: nombre });
          sprintId = nuevo.id;
        }
      }
      const task = await api.patch<Task>(`/tasks/${taskId}`, { sprintId, columnId, status });
      if (task?.sprintId !== sprintId) {
        return { error: 'El servidor no movió la tarea.', done: null };
      }
    }
    const movida = await api.post<Task>(`/tasks/${taskId}/move`, { columnId, status, order });
    if (movida?.columnId !== columnId)
      return { error: 'El servidor no movió la tarea.', done: null };
  } catch (error) {
    return { error: describe(error, 'No se pudo mover la tarea.'), done: null };
  }

  const renumeraciones = String(formData.get('renumerar') ?? '')
    .split(',')
    .filter(Boolean)
    .slice(0, MAX_RENUMERACIONES)
    .map((trio) => {
      const [id, posicion, columna] = trio.split(':');
      return { id, order: Number(posicion), columna };
    })
    .filter((e) => e.id && e.columna && Number.isInteger(e.order) && e.order >= 0);
  if (renumeraciones.length > 0) {
    await Promise.allSettled(
      renumeraciones.map((e) =>
        api.post<Task>(`/tasks/${e.id}/move`, { columnId: e.columna, order: e.order }),
      ),
    );
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

  let creada: string;
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
    creada = task.id;
  } catch (error) {
    return { error: describe(error, 'No se pudo crear la tarea.'), done: null };
  }

  revalidateProject(projectId);
  /* El id y no un «created» fijo: dos altas seguidas tienen que ser dos
     cambios de estado, o el campo no se vacía la segunda vez. */
  return { error: null, done: creada };
}
