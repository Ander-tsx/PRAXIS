'use server';

import {
  ApiError,
  type Board,
  type Column,
  type PermissionMap,
  type ProjectMember,
  type ProjectRole,
  type Workspace,
} from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { revalidatePath } from 'next/cache';
import type {
  BoardState,
  ColumnState,
  MemberState,
  RoleState,
  WorkspaceState,
} from '@/lib/action-state';
import { validateBoard, validateColumn, validateRole, validateWorkspace } from '@/lib/validation';

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
 * Añade a alguien al proyecto.
 *
 * ⚠️ **No es invitar.** El backend no tiene invitaciones: ni tabla, ni estados,
 * ni aviso. Esta persona entra directamente y se entera al abrir el proyecto.
 * La interfaz lo llama "añadir" a propósito. Ver PENDIENTES-BACKEND §12.
 *
 * Recibe un `userId`, así que quien llama tiene que resolver antes el correo
 * contra `GET /users`.
 */
export async function addMemberAction(
  _prev: MemberState,
  formData: FormData,
): Promise<MemberState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const userId = String(formData.get('userId') ?? '');
  const projectRoleId = String(formData.get('projectRoleId') ?? '');

  if (!userId) return { error: 'Elige a una persona.', done: null };
  if (!projectRoleId) return { error: 'Elige el rol con el que entra.', done: null };

  try {
    const member = await api.post<ProjectMember>(`/projects/${projectId}/members`, {
      userId,
      projectRoleId,
    });
    if (!member?.id) {
      return { error: 'El servidor no guardó el alta. Inténtalo de nuevo.', done: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo añadir a esa persona.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'added' };
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
