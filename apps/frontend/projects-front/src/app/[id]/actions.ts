'use server';

import {
  ApiError,
  type Board,
  type ChecklistItem,
  type Column,
  type Label,
  type PermissionMap,
  type ProjectInvitation,
  type ProjectRole,
  type Task,
  type TaskComment,
  type Workspace,
} from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type {
  BoardState,
  ColumnState,
  MemberState,
  RoleState,
  TaskState,
  WorkspaceState,
} from '@/lib/action-state';
import {
  validateBoard,
  validateChecklistItem,
  validateColumn,
  normalizeMultiline,
  validateComment,
  validateLabel,
  validateRole,
  validateTask,
  validateWorkspace,
} from '@/lib/validation';

/**
 * Acciones del detalle de proyecto.
 *
 * Todas comprueban la sesión por su cuenta: las Server Functions viajan como
 * POST a la ruta donde se usan y un cambio de `matcher` en `proxy.ts` podría
 * dejarlas fuera del guard. La autorización real la hace el gateway, que ya
 * exige `canManageRoles` / `canManageMembers` en cada endpoint.
 */

async function requireApi() {
  const session = await getSession();
  if (!session) return null;
  return createServerApiClient();
}

/** Revalida el detalle y la lista, que muestra contadores. */
function revalidateProject(projectId: string) {
  revalidatePath(`/${projectId}`);
  revalidatePath('/');
}

/**
 * Lee el mapa de permisos del formulario.
 *
 * ⚠️ Se construye como **diccionario**, nunca como array. Un array se guardaba
 * con 201 y producía un rol vacío en silencio; el backend ya lo rechaza, pero
 * la forma correcta empieza aquí.
 */
function readPermissions(formData: FormData): PermissionMap {
  const map: PermissionMap = {};
  for (const key of formData.getAll('permissions')) {
    map[String(key) as keyof PermissionMap] = true;
  }
  return map;
}

/* ─── Roles ─────────────────────────────────────────────────────────── */

export async function saveRoleAction(
  _prev: RoleState,
  formData: FormData,
): Promise<RoleState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.', savedName: null };

  const projectId = String(formData.get('projectId') ?? '');
  const roleId = String(formData.get('roleId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const permissions = readPermissions(formData);

  const invalid = validateRole(name, Object.keys(permissions).length);
  if (invalid) return { error: invalid, savedName: null };

  try {
    const saved = roleId
      ? await api.patch<ProjectRole>(`/projects/${projectId}/roles/${roleId}`, {
          name,
          permissions,
        })
      : await api.post<ProjectRole>(`/projects/${projectId}/roles`, { name, permissions });

    // Confirmación contra el `data`: que exista y se llame como pedimos.
    if (!saved?.id || saved.name !== name) {
      return { error: 'El servidor no guardó el rol. Inténtalo de nuevo.', savedName: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo guardar el rol.'), savedName: null };
  }

  revalidateProject(projectId);
  return { error: null, savedName: name };
}

export async function deleteRoleAction(
  _prev: RoleState,
  formData: FormData,
): Promise<RoleState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', savedName: null };

  const projectId = String(formData.get('projectId') ?? '');
  const roleId = String(formData.get('roleId') ?? '');

  try {
    await api.delete(`/projects/${projectId}/roles/${roleId}`);
  } catch (error) {
    /**
     * Un rol con miembros asignados no se puede borrar: la relación
     * `ProjectMember.projectRole` no es opcional. El backend responde con un
     * error de restricción, que no dice gran cosa al usuario.
     */
    return {
      error: describe(
        error,
        'No se pudo eliminar el rol. Si tiene personas asignadas, cámbialas de rol antes.',
      ),
      savedName: null,
    };
  }

  revalidateProject(projectId);
  return { error: null, savedName: 'eliminado' };
}

/* ─── Miembros ──────────────────────────────────────────────────────── */

/**
 * Invita a alguien al proyecto.
 *
 * La invitación queda **pendiente**: quien la recibe todavía no es miembro, no
 * tiene permisos y no ve el proyecto. Entra cuando la acepta.
 *
 * Recibe un `userId`, así que quien llama resuelve antes el correo contra
 * `GET /users`.
 */
export async function inviteMemberAction(
  _prev: MemberState,
  formData: FormData,
): Promise<MemberState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const userId = String(formData.get('userId') ?? '');
  const projectRoleId = String(formData.get('projectRoleId') ?? '');

  if (!userId) return { error: 'Elige a una persona.', done: null };
  if (!projectRoleId) return { error: 'Elige el rol con el que entrará.', done: null };

  try {
    const invitation = await api.post<ProjectInvitation>(
      `/projects/${projectId}/invitations`,
      { userId, projectRoleId },
    );
    if (!invitation?.id) {
      return { error: 'El servidor no registró la invitación.', done: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo enviar la invitación.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'invited' };
}

/** Retira una invitación que todavía no han respondido. */
export async function cancelInvitationAction(
  _prev: MemberState,
  formData: FormData,
): Promise<MemberState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const invitationId = String(formData.get('invitationId') ?? '');

  try {
    await api.delete(`/projects/${projectId}/invitations/${invitationId}`);
  } catch (error) {
    return { error: describe(error, 'No se pudo retirar la invitación.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'cancelled' };
}

/**
 * Salir del proyecto por voluntad propia.
 *
 * Tras salir se vuelve a la lista: la página del proyecto ya no es accesible.
 */
export async function leaveProjectAction(
  _prev: MemberState,
  formData: FormData,
): Promise<MemberState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');

  try {
    await api.delete(`/projects/${projectId}/membership/me`);
  } catch (error) {
    return { error: describe(error, 'No se pudo salir del proyecto.'), done: null };
  }

  revalidatePath('/');
  redirect('/');
}

export async function removeMemberAction(
  _prev: MemberState,
  formData: FormData,
): Promise<MemberState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const userId = String(formData.get('userId') ?? '');

  try {
    // El userId va en el cuerpo, no en la ruta: así lo declara el endpoint.
    await api.delete(`/projects/${projectId}/members`, { userId });
  } catch (error) {
    return { error: describe(error, 'No se pudo quitar a esa persona.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'removed' };
}

/* ─── Espacios de trabajo ───────────────────────────────────────────── */

export async function createWorkspaceAction(
  _prev: WorkspaceState,
  formData: FormData,
): Promise<WorkspaceState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', savedName: null, createdId: null };

  const projectId = String(formData.get('projectId') ?? '');
  const name = String(formData.get('name') ?? '').trim();

  const invalid = validateWorkspace(name);
  if (invalid) return { error: invalid, savedName: null, createdId: null };

  let created: Workspace;
  try {
    created = await api.post<Workspace>(`/projects/${projectId}/workspaces`, { name });
    if (!created?.id || created.name !== name) {
      return { error: 'El servidor no guardó el espacio.', savedName: null, createdId: null };
    }
  } catch (error) {
    // El backend distingue el nombre duplicado (409) con su propio mensaje.
    return {
      error: describe(error, 'No se pudo crear el espacio.'),
      savedName: null,
      createdId: null,
    };
  }

  revalidateProject(projectId);
  // El id vuelve para que el selector entre directamente en el espacio nuevo.
  return { error: null, savedName: name, createdId: created.id };
}

/**
 * Crea un tablero dentro de un espacio.
 *
 * El `projectId` viaja aparte solo para revalidar: el endpoint cuelga del
 * espacio (`POST /workspaces/:workspaceId/boards`) y no lo necesita.
 */
export async function createBoardAction(
  _prev: BoardState,
  formData: FormData,
): Promise<BoardState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', savedName: null };

  const workspaceId = String(formData.get('workspaceId') ?? '');
  const projectId = String(formData.get('projectId') ?? '');
  const name = String(formData.get('name') ?? '').trim();

  const invalid = validateBoard(name);
  if (invalid) return { error: invalid, savedName: null };

  try {
    const created = await api.post<Board>(`/workspaces/${workspaceId}/boards`, { name });
    if (!created?.id || created.name !== name) {
      return { error: 'El servidor no guardó el tablero.', savedName: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo crear el tablero.'), savedName: null };
  }

  revalidateProject(projectId);
  return { error: null, savedName: name };
}

/**
 * Elimina un espacio de trabajo.
 *
 * ⚠️ Cascadea: `Board` y `BoardColumn` cuelgan con `onDelete: Cascade`, así que
 * arrastra todos los tableros y columnas de dentro. Quien llama debe haberlo
 * advertido; aquí solo se ejecuta.
 */
export async function deleteWorkspaceAction(
  _prev: WorkspaceState,
  formData: FormData,
): Promise<WorkspaceState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', savedName: null, createdId: null };

  const projectId = String(formData.get('projectId') ?? '');
  const workspaceId = String(formData.get('workspaceId') ?? '');

  try {
    await api.delete(`/workspaces/${workspaceId}`);
  } catch (error) {
    return {
      error: describe(error, 'No se pudo eliminar el espacio.'),
      savedName: null,
      createdId: null,
    };
  }

  revalidateProject(projectId);
  return { error: null, savedName: 'eliminado', createdId: null };
}

/* ─── Columnas ──────────────────────────────────────────────────────── */

export async function createColumnAction(
  _prev: ColumnState,
  formData: FormData,
): Promise<ColumnState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', savedName: null };

  const boardId = String(formData.get('boardId') ?? '');
  const projectId = String(formData.get('projectId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const order = Number(formData.get('order') ?? 0);

  const invalid = validateColumn(name);
  if (invalid) return { error: invalid, savedName: null };

  try {
    // `order` es obligatorio en el DTO: la nueva va al final de las que hay.
    const created = await api.post<Column>(`/boards/${boardId}/columns`, { name, order });
    if (!created?.id) {
      return { error: 'El servidor no guardó la columna.', savedName: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo crear la columna.'), savedName: null };
  }

  revalidateProject(projectId);
  return { error: null, savedName: name };
}

export async function deleteColumnAction(
  _prev: ColumnState,
  formData: FormData,
): Promise<ColumnState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', savedName: null };

  const boardId = String(formData.get('boardId') ?? '');
  const columnId = String(formData.get('columnId') ?? '');
  const projectId = String(formData.get('projectId') ?? '');

  try {
    await api.delete(`/boards/${boardId}/columns/${columnId}`);
  } catch (error) {
    return { error: describe(error, 'No se pudo eliminar la columna.'), savedName: null };
  }

  revalidateProject(projectId);
  return { error: null, savedName: 'eliminada' };
}

/**
 * Reordena las columnas de un tablero.
 *
 * El endpoint recibe la lista **completa** de ids ya ordenada, no un
 * intercambio de posiciones. Los ids viajan separados por comas en un campo
 * oculto porque el arrastre ocurre en el cliente y el formulario se envía solo.
 */
export async function reorderColumnsAction(
  _prev: ColumnState,
  formData: FormData,
): Promise<ColumnState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', savedName: null };

  const boardId = String(formData.get('boardId') ?? '');
  const projectId = String(formData.get('projectId') ?? '');
  const columnIds = String(formData.get('columnIds') ?? '')
    .split(',')
    .filter(Boolean);

  if (columnIds.length === 0) {
    return { error: 'No hay columnas que reordenar.', savedName: null };
  }

  try {
    await api.patch(`/boards/${boardId}/columns/reorder`, { columnIds });
  } catch (error) {
    return { error: describe(error, 'No se pudo guardar el nuevo orden.'), savedName: null };
  }

  revalidateProject(projectId);
  return { error: null, savedName: 'reordenado' };
}

/* ─── Tareas ────────────────────────────────────────────────────────── */

/**
 * Lee los campos comunes del formulario de tarea.
 *
 * ⚠️ **Nada de `projectId` en el cuerpo.** Lo resuelve el guard desde la ruta y
 * mandarlo responde 400. Aquí el `projectId` solo sirve para revalidar.
 *
 * Los campos vacíos se omiten en vez de mandarse como `''`: el DTO los valida
 * con formato (UUID, ISO 8601, enum) y una cadena vacía da 400.
 */
function readTaskFields(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim();
  const description = normalizeMultiline(String(formData.get('description') ?? ''));
  const dueDate = String(formData.get('dueDate') ?? '').trim();
  const priority = String(formData.get('priority') ?? '').trim();
  const assigneeIds = formData.getAll('assigneeIds').map(String).filter(Boolean);
  const labelIds = formData.getAll('labelIds').map(String).filter(Boolean);

  return { title, description, dueDate, priority, assigneeIds, labelIds };
}

/**
 * Convierte lo que da un `<input type="date">` (`2026-08-01`) en ISO 8601.
 *
 * El DTO exige `@IsISO8601()` y `2026-08-01` a secas lo pasa, pero el backend
 * lo interpretaría como medianoche UTC. Se fija al **final del día local**, que
 * es lo que espera quien escribe una fecha límite: si pones hoy, no vence hace
 * ocho horas.
 */
function toIsoDueDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59).toISOString();
}

export async function createTaskAction(_prev: TaskState, formData: FormData): Promise<TaskState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const boardId = String(formData.get('boardId') ?? '');
  const columnId = String(formData.get('columnId') ?? '');
  /** El nombre de la columna: `status` tiene que igualarlo (trampa #2). */
  const status = String(formData.get('status') ?? '');
  const { title, description, dueDate, priority, assigneeIds, labelIds } =
    readTaskFields(formData);

  const invalid = validateTask(title);
  if (invalid) return { error: invalid, done: null };

  try {
    const created = await api.post<Task>(`/boards/${boardId}/tasks`, {
      columnId,
      title,
      status,
      ...(description && { description }),
      ...(dueDate && { dueDate: toIsoDueDate(dueDate) }),
      ...(priority && { priority }),
      ...(assigneeIds.length > 0 && { assigneeIds }),
      ...(labelIds.length > 0 && { labelIds }),
    });

    if (!created?.id || created.title !== title) {
      return { error: 'El servidor no guardó la tarea.', done: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo crear la tarea.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'created' };
}

export async function updateTaskAction(_prev: TaskState, formData: FormData): Promise<TaskState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const taskId = String(formData.get('taskId') ?? '');
  const { title, description, dueDate, priority, assigneeIds, labelIds } =
    readTaskFields(formData);

  const invalid = validateTask(title);
  if (invalid) return { error: invalid, done: null };

  try {
    const saved = await api.patch<Task>(`/tasks/${taskId}`, {
      title,
      /* Cadena vacía, no ausencia: es como se borra una descripción. */
      description,
      /* `null` explícito quita la fecha; omitirlo la dejaría como estaba. */
      dueDate: dueDate ? toIsoDueDate(dueDate) : null,
      priority,
      /* Siempre se manda: el diálogo enseña la lista completa, así que lo que
         venga es la lista que debe quedar. Omitirlo no borraría a nadie. */
      assigneeIds,
      /* Mismo motivo que los encargados: el diálogo enseña todas, así que lo
         que venga marcado es lo que debe quedar. */
      labelIds,
    });

    if (!saved?.id || saved.title !== title) {
      return { error: 'El servidor no guardó los cambios.', done: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo guardar la tarea.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'updated' };
}

/**
 * Mueve una tarea de columna.
 *
 * ⚠️ Manda `columnId` **y** `status` coherentes: `status` es un string que debe
 * igualar el nombre de la columna destino, así que quien llama tiene que
 * conocer la correspondencia nombre ↔ id.
 */
export async function moveTaskAction(_prev: TaskState, formData: FormData): Promise<TaskState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const taskId = String(formData.get('taskId') ?? '');
  const columnId = String(formData.get('columnId') ?? '');
  const status = String(formData.get('status') ?? '');
  const order = Number(formData.get('order') ?? 0);

  try {
    const moved = await api.post<Task>(`/tasks/${taskId}/move`, { columnId, status, order });
    if (moved?.columnId !== columnId) {
      return { error: 'El servidor no movió la tarea.', done: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo mover la tarea.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'moved' };
}

export async function deleteTaskAction(_prev: TaskState, formData: FormData): Promise<TaskState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const taskId = String(formData.get('taskId') ?? '');

  try {
    await api.delete(`/tasks/${taskId}`);
  } catch (error) {
    return { error: describe(error, 'No se pudo eliminar la tarea.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'deleted' };
}

/* ─── Checklist ─────────────────────────────────────────────────────── */

/**
 * Acciones del checklist de una tarea.
 *
 * Las tres cuelgan de `/tasks/:taskId/checklists` y exigen `canEditTask`: el
 * checklist es parte de la tarea, no un recurso con permisos propios.
 *
 * Ninguna manda `projectId`; el `projectId` del formulario solo sirve para
 * revalidar la página.
 */
export async function addChecklistItemAction(
  _prev: TaskState,
  formData: FormData,
): Promise<TaskState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const taskId = String(formData.get('taskId') ?? '');
  const text = String(formData.get('text') ?? '').trim();
  /* Va al final: el DTO declara `order` opcional, pero sin él todos valdrían 0
     y el orden dependería de la inserción. */
  const order = Number(formData.get('order') ?? 0);

  const invalid = validateChecklistItem(text);
  if (invalid) return { error: invalid, done: null };

  try {
    const created = await api.post<ChecklistItem>(`/tasks/${taskId}/checklists`, { text, order });
    if (!created?.id || created.text !== text) {
      return { error: 'El servidor no guardó el ítem.', done: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo añadir el ítem.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'added' };
}

/**
 * Alterna un ítem.
 *
 * ⚠️ Es un **toggle sin cuerpo**: no se manda el estado deseado, sino que el
 * backend invierte el que tenga. Dos clics rápidos sobre el mismo ítem se
 * cancelan entre sí, que es lo esperable, pero también significa que no se
 * puede forzar «marcado» de forma idempotente.
 */
export async function toggleChecklistItemAction(
  _prev: TaskState,
  formData: FormData,
): Promise<TaskState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const taskId = String(formData.get('taskId') ?? '');
  const itemId = String(formData.get('itemId') ?? '');

  try {
    const updated = await api.post<ChecklistItem>(
      `/tasks/${taskId}/checklists/${itemId}/toggle`,
      {},
    );
    if (!updated?.id) {
      return { error: 'El servidor no cambió el ítem.', done: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo cambiar el ítem.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'toggled' };
}

export async function deleteChecklistItemAction(
  _prev: TaskState,
  formData: FormData,
): Promise<TaskState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const taskId = String(formData.get('taskId') ?? '');
  const itemId = String(formData.get('itemId') ?? '');

  try {
    await api.delete(`/tasks/${taskId}/checklists/${itemId}`);
  } catch (error) {
    return { error: describe(error, 'No se pudo eliminar el ítem.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'deleted' };
}

/* ─── Etiquetas ─────────────────────────────────────────────────────── */

/**
 * Las etiquetas son del **proyecto**, no del tablero, así que sus rutas cuelgan
 * de `/projects/:id/labels`.
 *
 * ⚠️ Gestionarlas exige `canEditTask`: no hay un permiso propio de etiquetas.
 * Quien puede editar tareas puede definir con qué se etiquetan.
 */
export async function saveLabelAction(_prev: TaskState, formData: FormData): Promise<TaskState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const labelId = String(formData.get('labelId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const color = String(formData.get('color') ?? '');

  const invalid = validateLabel(name, color);
  if (invalid) return { error: invalid, done: null };

  try {
    const saved = labelId
      ? await api.patch<Label>(`/projects/${projectId}/labels/${labelId}`, { name, color })
      : await api.post<Label>(`/projects/${projectId}/labels`, { name, color });

    if (!saved?.id || saved.name !== name) {
      return { error: 'El servidor no guardó la etiqueta.', done: null };
    }
  } catch (error) {
    // El backend distingue el nombre repetido con un 409 y su propio mensaje.
    return { error: describe(error, 'No se pudo guardar la etiqueta.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'saved' };
}

/**
 * Elimina una etiqueta.
 *
 * ⚠️ Se la quita a todas las tareas que la llevaban: la relación cascadea.
 * Quien llama debe haberlo advertido antes.
 */
export async function deleteLabelAction(_prev: TaskState, formData: FormData): Promise<TaskState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const labelId = String(formData.get('labelId') ?? '');

  try {
    await api.delete(`/projects/${projectId}/labels/${labelId}`);
  } catch (error) {
    return { error: describe(error, 'No se pudo eliminar la etiqueta.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'deleted' };
}

/* ─── Comentarios ───────────────────────────────────────────────────── */

/**
 * Comentar en una tarea.
 *
 * ⚠️ Exige `canEditTask`: no hay un permiso de comentar, así que un perfil de
 * solo lectura puede leer el hilo pero no participar (PENDIENTES §17).
 */
export async function addCommentAction(_prev: TaskState, formData: FormData): Promise<TaskState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const taskId = String(formData.get('taskId') ?? '');
  const body = normalizeMultiline(String(formData.get('body') ?? ''));

  const invalid = validateComment(body);
  if (invalid) return { error: invalid, done: null };

  try {
    const created = await api.post<TaskComment>(`/tasks/${taskId}/comments`, { body });
    if (!created?.id || created.body !== body) {
      return { error: 'El servidor no guardó el comentario.', done: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo comentar.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'added' };
}

/** Editar es solo del autor; el backend lo comprueba y responde 403 si no. */
export async function editCommentAction(_prev: TaskState, formData: FormData): Promise<TaskState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const taskId = String(formData.get('taskId') ?? '');
  const commentId = String(formData.get('commentId') ?? '');
  const body = normalizeMultiline(String(formData.get('body') ?? ''));

  const invalid = validateComment(body);
  if (invalid) return { error: invalid, done: null };

  try {
    const saved = await api.patch<TaskComment>(`/tasks/${taskId}/comments/${commentId}`, { body });
    if (saved?.body !== body) {
      return { error: 'El servidor no guardó el cambio.', done: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo editar el comentario.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'edited' };
}

/** Lo borra su autor, o quien pueda eliminar tareas del proyecto. */
export async function deleteCommentAction(
  _prev: TaskState,
  formData: FormData,
): Promise<TaskState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const taskId = String(formData.get('taskId') ?? '');
  const commentId = String(formData.get('commentId') ?? '');

  try {
    await api.delete(`/tasks/${taskId}/comments/${commentId}`);
  } catch (error) {
    return { error: describe(error, 'No se pudo eliminar el comentario.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'deleted' };
}

/* ─── Utilidades ────────────────────────────────────────────────────── */

function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'No tienes permiso para hacer esto en este proyecto.';
    }
    if (error.status >= 500) return fallback;
    return error.message;
  }
  return fallback;
}
