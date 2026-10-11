'use server';

import type {
  AutomationRuleState,
  BoardState,
  ColumnState,
  DeleteProjectState,
  MemberState,
  ProjectFieldState,
  ReviewState,
  RoleState,
  TaskState,
  WorkspaceState,
} from '@/lib/projects/action-state';
import type { AutomationCatalog } from '@/lib/projects/automation-catalog';
import { bodyFromDraft, draftFromFormData } from '@/lib/projects/automation-draft';
import {
  normalizeMultiline,
  validateAttachment,
  validateAutomationDraft,
  validateBoard,
  validateChatMessage,
  validateChecklistItem,
  validateColumn,
  validateColumnColor,
  validateComment,
  validateLabel,
  validateProject,
  validateRole,
  validateTask,
  validateWorkspace,
} from '@/lib/projects/validation';
import {
  ApiError,
  type AutomationReviewSummary,
  type AutomationRule,
  type Board,
  CHAT_ATTACHMENT_MAX_BYTES,
  type ChatAttachment,
  type ChatMessage,
  type ChecklistItem,
  type Column,
  type Label,
  PROJECT_SUSPENDED_CODE,
  type Paginated,
  type PermissionMap,
  type ProjectDetail,
  type ProjectInvitation,
  type ProjectRole,
  type Task,
  type TaskAttachment,
  type TaskComment,
  type Workspace,
  el403SeExplicaSolo,
} from '@praxis/commons';
import { type LinkPreview, obtenerPreviewDeEnlace } from '@praxis/commons/api/link-preview';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { detallesDeCuota } from '@praxis/commons/billing/planes';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

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

/**
 * Revalida **solo el detalle**, que es lo que cambia casi siempre.
 *
 * ⚠️ Antes revalidaba también `/`, y era caro por partida doble. Un
 * `revalidatePath` dentro de una Server Action re-renderiza en la **misma
 * respuesta** —§24.4—, así que el botón no se apaga hasta que ese render
 * termina; y ese render ocupa la cola global del App Router, que es donde se
 * origina el botón que gira para siempre (`commons/hooks/useAccion`). Pagarlo
 * dos veces por escribir un comentario es coste puro.
 *
 * De la lista, `ProyectosPageClient` pinta exactamente esto: `name`, `description`,
 * `status`, `createdAt`, `_count.members` y `_count.workspaces`. Nada más. Un
 * comentario, una tarea, una columna o una etiqueta **no cambian ninguno de
 * esos campos**, así que revalidarla no producía una sola diferencia en
 * pantalla.
 */
function revalidateProject(projectId: string) {
  /* ⚠️ Con `/projects` delante desde F6: sin `basePath` que Next anteponga,
     `` `/${projectId}` `` no es ninguna ruta de la aplicación. */
  revalidatePath(`/projects/${projectId}`);
}

/**
 * Crea o edita una regla desde el constructor guiado.
 *
 * Reconstruye el borrador desde los arrays paralelos que emite
 * `ConditionsSection` (D4), valida con el mismo criterio que
 * `rule-definition.ts` antes de gastar una petición, arma el cuerpo exacto
 * con `bodyFromDraft` y confirma contra el `data` de la respuesta — D6: que
 * exista `id` y que el nombre sea el que se pidió, no que el status HTTP
 * haya sido 200.
 */
export async function saveAutomationRuleAction(
  _prev: AutomationRuleState,
  formData: FormData,
): Promise<AutomationRuleState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const ruleId = formData.get('ruleId');

  /**
   * El catálogo, otra vez y desde el servidor.
   *
   * ⚠️ **No se acepta el que mande el cliente**, y no es paranoia barata: el
   * catálogo decide qué campos existen, qué operadores valen y qué claves de
   * configuración se aceptan. Recibirlo del navegador sería dejar que quien
   * envía el formulario redefina las reglas con las que se valida su propio
   * formulario. Pedirlo aquí cuesta una llamada por guardado y el gateway ya
   * lo cachea; el servicio lo devuelve de memoria.
   */
  let catalog: AutomationCatalog;
  try {
    catalog = await api.get<AutomationCatalog>(`/projects/${projectId}/automations/catalog`);
  } catch (error) {
    /**
     * 🔴 **Un proyecto suspendido moría aquí con el mensaje equivocado.**
     *
     * Esto era un `.catch(() => null)` y un texto genérico. Pero
     * `permissions/me` llega recortado cuando el proyecto está suspendido, así
     * que esta llamada —que exige `canManageAutomations`— responde 403 antes de
     * que se intente guardar nada: el mensaje bueno, el que está más abajo, ya
     * no se alcanzaba nunca.
     *
     * La diferencia no es de matiz. «Inténtalo otra vez» invita a reintentar
     * algo que no va a funcionar por mucho que se repita; la suspensión la
     * levanta quien administra la plataforma (CLAUDE.md, trampa 11).
     */
    if (error instanceof ApiError && error.code === PROJECT_SUSPENDED_CODE) {
      return {
        error: 'El proyecto está suspendido: no se pueden crear ni editar reglas mientras tanto.',
        done: null,
      };
    }
    return { error: 'No se ha podido comprobar la regla. Inténtalo otra vez.', done: null };
  }

  const draft = draftFromFormData(catalog, formData);

  /* El `FormData` no es de fiar aunque el cliente ya haya validado, así que se
     vuelve a comprobar aquí. Del ámbito no se hace nada: quien lo usa para
     colocar el mensaje es el formulario, y aquí solo hay un sitio donde
     ponerlo. */
  const clientError = validateAutomationDraft(catalog, draft);
  if (clientError) return { error: clientError.mensaje, done: null };

  const body = bodyFromDraft(draft);

  try {
    const saved = ruleId
      ? await api.patch<AutomationRule>(`/projects/${projectId}/automations/${ruleId}`, body)
      : await api.post<AutomationRule>(`/projects/${projectId}/automations`, body);

    /* Los tres campos que nombra D6: que exista, que se llame como pedimos y
       que sea del trigger que pedimos. El `trigger` importa porque el `PATCH`
       es reemplazo total: un guardado que lo cambiara no dejaría ninguna otra
       señal. */
    if (!saved?.id || saved.name !== body.name || saved.trigger?.type !== body.trigger.type) {
      return { error: 'El servidor no guardó la regla. Inténtalo de nuevo.', done: null };
    }
  } catch (error) {
    if (error instanceof ApiError && error.validationErrors.length > 0) {
      return { error: error.validationErrors.join(' '), done: null };
    }
    if (error instanceof ApiError && error.code === PROJECT_SUSPENDED_CODE) {
      return {
        error: 'El proyecto está suspendido: no se pueden crear ni editar reglas mientras tanto.',
        done: null,
      };
    }
    return { error: describe(error, 'No se pudo guardar la regla.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: body.name };
}

/**
 * «Revisar ahora»: evalúa las reglas activas contra las tareas candidatas.
 *
 * El resumen que devuelve el servidor —`{ rules, candidates, succeeded,
 * failed }`— viajaba hasta ahora directo a la papelera: se pedía y se
 * descartaba. Se transporta en el estado para que la interfaz pueda decir qué
 * pasó, sin inventar `skipped` ni `deduped`, que el backend no manda (hueco 4
 * de `PENDIENTES-BACKEND-AUTOMATIZACION.md`) — el detalle de esos dos casos
 * se lee fila por fila en la lista de ejecuciones, donde `SKIPPED` sí aparece.
 */
export async function reviewAutomationsAction(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.', summary: null };

  const projectId = String(formData.get('projectId') ?? '');

  try {
    const summary = await api.post<AutomationReviewSummary>(
      `/projects/${projectId}/automations/review`,
      {},
    );
    if (!summary || typeof summary.candidates !== 'number') {
      return { error: 'El servidor no devolvió un resumen de la revisión.', summary: null };
    }
    revalidateProject(projectId);
    return { error: null, summary };
  } catch (error) {
    if (error instanceof ApiError && error.code === PROJECT_SUSPENDED_CODE) {
      return {
        error: 'El proyecto está suspendido: no se pueden revisar las reglas mientras tanto.',
        summary: null,
      };
    }
    return { error: describe(error, 'No se pudo revisar las reglas.'), summary: null };
  }
}

/**
 * Habilita o deshabilita una regla.
 *
 * ⚠️ **`PATCH` es reemplazo total, no parcial** — hueco 2 de
 * `PENDIENTES-BACKEND-AUTOMATIZACION.md`: no existe una ruta para cambiar
 * solo `status`, así que hay que leer la regla entera y reenviarla con el
 * único campo cambiado. Confirma contra `data.status`, no contra el código
 * de estado: un 200 con el estado de siempre sería un cambio que no cambió
 * nada.
 */
export async function toggleAutomationRuleAction(
  _prev: AutomationRuleState,
  formData: FormData,
): Promise<AutomationRuleState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const ruleId = String(formData.get('ruleId') ?? '');
  const nextStatus = String(formData.get('nextStatus') ?? '');

  try {
    const rule = await api.get<AutomationRule>(`/projects/${projectId}/automations/${ruleId}`);

    const saved = await api.patch<AutomationRule>(`/projects/${projectId}/automations/${ruleId}`, {
      name: rule.name,
      ...(rule.description != null && { description: rule.description }),
      status: nextStatus,
      trigger: { type: rule.trigger.type, config: rule.trigger.config },
      conditions: rule.conditions.map(({ field, operator, value }) => ({ field, operator, value })),
      actions: rule.actions.map(({ type, config }) => ({ type, config })),
    });

    if (saved.status !== nextStatus) {
      return {
        error: 'El servidor no cambió el estado de la regla. Inténtalo de nuevo.',
        done: null,
      };
    }
  } catch (error) {
    return { error: describeAutomationToggleError(error), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: nextStatus };
}

export async function deleteAutomationRuleAction(
  _prev: AutomationRuleState,
  formData: FormData,
): Promise<AutomationRuleState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const ruleId = String(formData.get('ruleId') ?? '');

  try {
    await api.delete(`/projects/${projectId}/automations/${ruleId}`);
  } catch (error) {
    return {
      error:
        error instanceof ApiError && error.code === PROJECT_SUSPENDED_CODE
          ? 'El proyecto está suspendido: no se puede eliminar ninguna regla mientras tanto.'
          : describe(error, 'No se pudo eliminar la regla.'),
      done: null,
    };
  }

  revalidateProject(projectId);
  return { error: null, done: 'eliminada' };
}

/**
 * El 400 de `toggleAutomationRuleAction` no es «campo inválido»: es que la
 * regla se reenvía entera y el catálogo pudo endurecerse desde que se
 * guardó — hueco 2. El mensaje genérico de `describe()` hablaría de un campo
 * que nadie tocó.
 */
function describeAutomationToggleError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === PROJECT_SUSPENDED_CODE) {
      return 'El proyecto está suspendido: no se puede activar ni desactivar ninguna regla mientras tanto.';
    }
    if (error.status === 400) {
      return 'Esta regla ya no es válida con el catálogo actual: ábrela y corrígela antes de cambiar su estado.';
    }
  }
  return describe(error, 'No se pudo cambiar el estado de la regla.');
}

/**
 * El detalle **y** la lista.
 *
 * Solo para lo que mueve un contador de `ProyectosPageClient`: entrar o salir gente, y
 * crear o borrar espacios. Si mañana la tarjeta de la lista enseña algo más
 * —tareas abiertas, por ejemplo— hay que volver aquí y ampliar quién la llama;
 * olvidarlo sale como una tarjeta con el número viejo hasta navegar, no como un
 * error.
 */
function revalidateProjectAndList(projectId: string) {
  /* ⚠️ Con `/projects` delante. Eran relativas al `basePath` de la zona; sin
     `basePath`, un `'/'` revalida la landing pública y `` `/${projectId}` ``
     una ruta que no existe. Ninguna de las dos cosas da un error: simplemente
     deja de refrescarse lo que tocaba. */
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
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

/* ─── El proyecto ───────────────────────────────────────────────────── */

/**
 * Lo que se lleva por delante el borrado de un proyecto.
 *
 * No es una Server Action de formulario: es una **lectura**, y la llama el
 * diálogo de confirmación al abrirse. Se hace así y no en el render de la página
 * porque contar las tareas obliga a una petición por tablero, y sería trabajo
 * tirado en las visitas —casi todas— donde nadie va a borrar nada.
 *
 * Los ids de los tableros se vuelven a resolver **aquí**, desde el `projectId`,
 * en vez de recibirlos del cliente: el detalle está cacheado en Redis 5 minutos,
 * así que es barato, y así ningún id que llegue de fuera decide qué se consulta.
 *
 * ⚠️ **Las tareas se piden con `limit=100`, el mismo que usa la página, y no con
 * `limit=1` aunque solo interese el `total`.** La clave de caché del backend
 * (`tasks:board:<id>`) **no incluye la paginación**: una petición con `limit=1`
 * deja cacheado un tablero de una sola tarea durante 60 s y el tablero se pinta
 * casi vacío. Reproducido. Ver §24.3.
 *
 * Un fallo devuelve `null` en el contador, no cero: «no lo sé» y «ninguna» son
 * cosas distintas, y en una confirmación de borrado decir cero de más es peor
 * que no decir nada.
 */
export interface ProjectInventory {
  tasks: number | null;
  pendingInvitations: number | null;
}

export async function projectInventoryAction(projectId: string): Promise<ProjectInventory> {
  const api = await requireApi();
  if (!api) return { tasks: null, pendingInvitations: null };

  const project = await api.get<ProjectDetail>(`/projects/${projectId}`).catch(() => null);
  if (!project) return { tasks: null, pendingInvitations: null };

  const boardIds = project.workspaces.flatMap((workspace) =>
    workspace.boards.map((board) => board.id),
  );

  const [taskTotals, invitations] = await Promise.all([
    Promise.all(
      boardIds.map((boardId) =>
        api
          .get<Paginated<Task>>(`/boards/${boardId}/tasks?limit=100`)
          .then((page) => page.total)
          .catch(() => null),
      ),
    ),
    api
      .get<ProjectInvitation[]>(`/projects/${projectId}/invitations`)
      .then((list) => list.filter((invitation) => invitation.status === 'PENDING').length)
      .catch(() => null),
  ]);

  return {
    // Si algún tablero falló no se puede sumar: el total sería más bajo del real.
    tasks: taskTotals.every((total): total is number => total !== null)
      ? taskTotals.reduce((sum, total) => sum + total, 0)
      : null,
    pendingInvitations: invitations,
  };
}

/**
 * Elimina un proyecto entero.
 *
 * La cascada **ya está resuelta en el backend y no se reimplementa aquí**:
 * Postgres arrastra espacios → tableros → columnas dentro de projects-service, y
 * `TaskPurgeService` borra las tareas, que viven en tasks-service y a las que el
 * `ON DELETE CASCADE` no llega. Verificado contando filas antes y después.
 *
 * Tras borrar **hay que salir**: la página del proyecto acaba de dejar de
 * existir, así que la acción redirige a la lista en vez de devolver un estado
 * que nadie podría leer.
 */
export async function deleteProjectAction(
  _prev: DeleteProjectState,
  formData: FormData,
): Promise<DeleteProjectState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.' };

  const projectId = String(formData.get('projectId') ?? '');

  try {
    await api.delete(`/projects/${projectId}`);
  } catch (error) {
    return { error: describe(error, 'No se pudo eliminar el proyecto.') };
  }

  revalidatePath('/projects');
  redirect('/projects');
}

/**
 * Guarda **todo** desde el modal de configuración del proyecto: nombre,
 * descripción, icono y color, en un solo `PATCH`.
 *
 * Sustituyó al editor en línea de la cabecera (`EditableProjectFields`, con
 * autosave por campo y `settleProjectAction` aparte). Al ser un guardado de una
 * vez —botón «Guardar», no debounce— esto **sí revalida** aquí mismo: pagar el
 * re-render del árbol del proyecto una vez, al cerrar el modal, está bien.
 *
 * Tres cosas que se conservan del editor viejo:
 *
 * 1. **Se comprueba contra el `data`**, no contra el status: se devuelve lo que
 *    confirmó el servidor.
 * 2. **Un nombre repetido responde 409** (único por dueño) y el mensaje del
 *    backend sube tal cual.
 * 3. **Renombrar regenera el slug**, que se devuelve en `savedSlug` para que el
 *    cliente corrija la URL con `replaceState` — recargar daría 404 sobre un
 *    proyecto que está perfectamente.
 *
 * ⚠️ `iconKey`/`color` admiten `null` para volver al monograma; `''` se trata
 * igual que `null`. Exige `canEditProject`.
 */
export async function saveProjectSettingsAction(input: {
  projectId: string;
  name: string;
  description: string;
  iconKey: string | null;
  color: string | null;
}): Promise<ProjectFieldState> {
  const empty = { savedName: null, savedDescription: null, savedSlug: null };

  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.', ...empty };

  const name = input.name.trim();
  const description = normalizeMultiline(input.description);

  const invalid = validateProject({ name, description });
  if (invalid) return { error: invalid, ...empty };

  try {
    const saved = await api.patch<ProjectDetail>(`/projects/${input.projectId}`, {
      name,
      description,
      iconKey: input.iconKey || null,
      color: input.iconKey ? input.color || null : null,
    });

    if (!saved?.id) return { error: 'El servidor no guardó el cambio.', ...empty };
    if (saved.name !== name) return { error: 'El servidor no guardó el nombre nuevo.', ...empty };

    revalidateProject(input.projectId);
    /* Y la lista, a diferencia del resto de acciones: `ProyectosPageClient` pinta el
       nombre, la descripción y el monograma, y esto cambia los tres. */
    revalidatePath('/projects');

    return {
      error: null,
      savedName: saved.name,
      savedDescription: saved.description ?? '',
      savedSlug: saved.slug,
    };
  } catch (error) {
    return { error: describe(error, 'No se pudo guardar la configuración.'), ...empty };
  }
}

/**
 * Sube la imagen del proyecto. Va por `FormData` a un endpoint `multipart`,
 * igual que la foto de perfil: en base64 dentro de JSON crecería un tercio.
 *
 * Devuelve la `imageUrl` que **confirmó el servidor** (con su versión, que es
 * lo que rompe la caché del navegador). Exige `canEditProject`.
 */
export async function uploadProjectImageAction(
  formData: FormData,
): Promise<{ error: string | null; imageUrl: string | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.', imageUrl: null };

  const projectId = String(formData.get('projectId') ?? '');
  const file = formData.get('file');
  if (!projectId || !(file instanceof File) || file.size === 0) {
    return { error: 'No llegó ninguna imagen.', imageUrl: null };
  }

  const envio = new FormData();
  envio.append('file', file);

  try {
    const saved = await api.postForm<ProjectDetail>(`/projects/${projectId}/image`, envio);
    if (!saved?.imageUrl) return { error: 'El servidor no guardó la imagen.', imageUrl: null };

    revalidateProject(projectId);
    revalidatePath('/projects');
    return { error: null, imageUrl: saved.imageUrl };
  } catch (error) {
    return { error: describe(error, 'No se pudo subir la imagen.'), imageUrl: null };
  }
}

/** Quita la imagen del proyecto: vuelve a su icono o a las iniciales. */
export async function deleteProjectImageAction(
  projectId: string,
): Promise<{ error: string | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.' };

  try {
    await api.delete(`/projects/${projectId}/image`);
    revalidateProject(projectId);
    revalidatePath('/projects');
    return { error: null };
  } catch (error) {
    return { error: describe(error, 'No se pudo quitar la imagen.') };
  }
}

/* ─── Roles ─────────────────────────────────────────────────────────── */

export async function saveRoleAction(_prev: RoleState, formData: FormData): Promise<RoleState> {
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

export async function deleteRoleAction(_prev: RoleState, formData: FormData): Promise<RoleState> {
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
    const invitation = await api.post<ProjectInvitation>(`/projects/${projectId}/invitations`, {
      userId,
      projectRoleId,
    });
    if (!invitation?.id) {
      return { error: 'El servidor no registró la invitación.', done: null };
    }
  } catch (error) {
    /* ⚠️ Una invitación puede chocar con el tope de miembros del plan **del
       dueño del proyecto**, no con el de quien invita. El detalle sale aparte
       para que el diálogo pueda decir de quién depende el tope en vez de
       mandar a pagar a alguien cuyo plan no cambia nada. Ver `QuotaNotice`. */
    return {
      error: describe(error, 'No se pudo enviar la invitación.'),
      done: null,
      cuota: detallesDeCuota(error),
    };
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

  revalidatePath('/projects');
  redirect('/projects');
}

/**
 * Cambiar el rol de alguien que ya está dentro.
 *
 * Va a `PATCH /projects/:id/members/:userId`, que existe desde que se vio que
 * la alternativa —sacar y volver a meter— le borraba la fecha de entrada, le
 * mandaba un aviso diciendo que lo habían echado y lo dejaba sin permisos entre
 * las dos operaciones.
 */
export async function changeMemberRoleAction(
  _prev: MemberState,
  formData: FormData,
): Promise<MemberState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const userId = String(formData.get('userId') ?? '');
  const projectRoleId = String(formData.get('projectRoleId') ?? '');

  if (!projectRoleId) return { error: 'Elige un rol.', done: null };

  try {
    await api.patch(`/projects/${projectId}/members/${userId}`, { projectRoleId });
  } catch (error) {
    return { error: describe(error, 'No se pudo cambiar el rol.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'role-changed' };
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

  revalidateProjectAndList(projectId);
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
    const kind = formData.get('kind') === 'DOCUMENTS' ? 'DOCUMENTS' : 'BOARDS';
    created = await api.post<Workspace>(`/projects/${projectId}/workspaces`, { name, kind });
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

  revalidateProjectAndList(projectId);
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

  revalidateProjectAndList(projectId);
  return { error: null, savedName: 'eliminado', createdId: null };
}

/**
 * Renombrar un espacio.
 *
 * Faltaba: el espacio se podía crear y borrar, pero no corregirle el nombre —
 * así que una errata obligaba a borrarlo entero, y borrarlo **cascadea** sobre
 * sus tableros y columnas. Un renombrado evita esa desproporción.
 */
export async function updateWorkspaceAction(
  _prev: WorkspaceState,
  formData: FormData,
): Promise<WorkspaceState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', savedName: null, createdId: null };

  const projectId = String(formData.get('projectId') ?? '');
  const workspaceId = String(formData.get('workspaceId') ?? '');
  const name = String(formData.get('name') ?? '').trim();

  const invalid = validateWorkspace(name);
  if (invalid) return { error: invalid, savedName: null, createdId: null };

  try {
    /* Solo el campo que declara el DTO: uno de sobra ya da 400. */
    await api.patch(`/workspaces/${workspaceId}`, { name });
  } catch (error) {
    return {
      error: describe(error, 'No se pudo renombrar el espacio.'),
      savedName: null,
      createdId: null,
    };
  }

  revalidateProject(projectId);
  return { error: null, savedName: name, createdId: null };
}

/* ─── Tableros ──────────────────────────────────────────────────────── */

/** Renombrar un tablero. El endpoint existía y no lo usaba nadie. */
export async function updateBoardAction(
  _prev: BoardState,
  formData: FormData,
): Promise<BoardState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', savedName: null };

  const projectId = String(formData.get('projectId') ?? '');
  const boardId = String(formData.get('boardId') ?? '');
  const name = String(formData.get('name') ?? '').trim();

  const invalid = validateBoard(name);
  if (invalid) return { error: invalid, savedName: null };

  try {
    await api.patch(`/boards/${boardId}`, { name });
  } catch (error) {
    return { error: describe(error, 'No se pudo renombrar el tablero.'), savedName: null };
  }

  revalidateProject(projectId);
  return { error: null, savedName: name };
}

/**
 * Eliminar un tablero.
 *
 * ⚠️ **No existía en la interfaz**, aunque el endpoint sí: se podían crear
 * tableros y no había forma de quitarlos. Cascadea sobre sus columnas igual que
 * el espacio sobre sus tableros, así que quien lo llama pide confirmación
 * escrita cuando hay algo dentro.
 */
export async function deleteBoardAction(
  _prev: BoardState,
  formData: FormData,
): Promise<BoardState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', savedName: null };

  const projectId = String(formData.get('projectId') ?? '');
  const boardId = String(formData.get('boardId') ?? '');

  try {
    await api.delete(`/boards/${boardId}`);
  } catch (error) {
    return { error: describe(error, 'No se pudo eliminar el tablero.'), savedName: null };
  }

  revalidateProject(projectId);
  return { error: null, savedName: 'eliminado' };
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

/**
 * Renombra una columna o le cambia el color.
 *
 * Exige `canEditColumn`, que hasta ahora no lo usaba ningún endpoint. Se manda
 * **solo el campo que cambia**: mandar los dos siempre obligaría al backend a
 * disparar la cascada del `status` en cada cambio de color, y esa cascada es una
 * llamada a otro microservicio.
 *
 * ⚠️ Renombrar arrastra el `status` de las tareas de la columna, porque ese
 * campo guarda el nombre y no el id. Lo hace el gateway; aquí solo hay que saber
 * que un renombrado toca más filas de las que parece.
 */
export async function updateColumnAction(
  _prev: ColumnState,
  formData: FormData,
): Promise<ColumnState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', savedName: null };

  const boardId = String(formData.get('boardId') ?? '');
  const columnId = String(formData.get('columnId') ?? '');
  const projectId = String(formData.get('projectId') ?? '');
  /* Ausente, no vacío: el campo que no se toca no viaja, y una cadena vacía
     sería un nombre inválido en vez de «no lo cambies». */
  const rawName = formData.get('name');
  const rawColor = formData.get('color');
  const rawWip = formData.get('wipLimit');

  const name = rawName === null ? null : String(rawName).trim();
  const color = rawColor === null ? null : String(rawColor);
  /* `undefined` = no se toca; vacío = quitar el límite (`null`). */
  const wipTexto = rawWip === null ? undefined : String(rawWip).trim();
  const wipLimit = wipTexto === undefined ? undefined : wipTexto === '' ? null : Number(wipTexto);

  if (name === null && color === null && wipLimit === undefined) {
    return { error: 'No hay nada que cambiar.', savedName: null };
  }
  if (
    typeof wipLimit === 'number' &&
    (!Number.isInteger(wipLimit) || wipLimit < 1 || wipLimit > 999)
  ) {
    return { error: 'El límite tiene que ser un número entero entre 1 y 999.', savedName: null };
  }

  if (name !== null) {
    const invalid = validateColumn(name);
    if (invalid) return { error: invalid, savedName: null };
  }
  if (color !== null) {
    const invalid = validateColumnColor(color);
    if (invalid) return { error: invalid, savedName: null };
  }

  try {
    const saved = await api.patch<Column>(`/boards/${boardId}/columns/${columnId}`, {
      ...(name !== null && { name }),
      ...(color !== null && { color }),
      ...(wipLimit !== undefined && { wipLimit }),
    });

    // Confirmación contra el `data`, no contra el status.
    if (!saved?.id) {
      return { error: 'El servidor no guardó la columna.', savedName: null };
    }
    if (name !== null && saved.name !== name) {
      return { error: 'El servidor no guardó el nombre nuevo.', savedName: null };
    }
    if (color !== null && saved.color !== color) {
      return { error: 'El servidor no guardó el color.', savedName: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo cambiar la columna.'), savedName: null };
  }

  revalidateProject(projectId);
  return { error: null, savedName: name ?? 'recoloreada' };
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
  const estimatePoints = readEstimate(formData);

  return { title, description, dueDate, priority, assigneeIds, labelIds, estimatePoints };
}

/**
 * La estimación, en sus tres formas: sin el campo en el formulario no se toca
 * (`undefined`), vacío la borra (`null`) y un entero la fija. Un número mal
 * escrito también se trata como «no tocar»: mejor no guardar que guardar un 0
 * que nadie escribió.
 */
function readEstimate(formData: FormData): number | null | undefined {
  if (!formData.has('estimatePoints')) return undefined;
  const raw = String(formData.get('estimatePoints') ?? '').trim();
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= 999 ? value : undefined;
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
  const { title, description, dueDate, priority, assigneeIds, labelIds } = readTaskFields(formData);

  const invalid = validateTask(title);
  if (invalid) return { error: invalid, done: null };

  let creada: Task;
  try {
    creada = await api.post<Task>(`/boards/${boardId}/tasks`, {
      columnId,
      title,
      status,
      ...(description && { description }),
      ...(dueDate && { dueDate: toIsoDueDate(dueDate) }),
      ...(priority && { priority }),
      ...(assigneeIds.length > 0 && { assigneeIds }),
      ...(labelIds.length > 0 && { labelIds }),
    });

    if (!creada?.id || creada.title !== title) {
      return { error: 'El servidor no guardó la tarea.', done: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo crear la tarea.'), done: null };
  }

  revalidateProject(projectId);
  /**
   * ⚠️ **Devuelve el id, no la cadena `'created'`.**
   *
   * El alta rápida solo pide el título, así que lo siguiente que quiere hacer
   * quien la usa es rellenar el resto — y para abrir el panel de la tarea hace
   * falta su id. Confirmar con una cadena fija obligaba a buscarla después por
   * el título, que ni siquiera es único.
   */
  return { error: null, done: creada.id };
}

export async function updateTaskAction(_prev: TaskState, formData: FormData): Promise<TaskState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const taskId = String(formData.get('taskId') ?? '');
  const { title, description, dueDate, priority, assigneeIds, labelIds, estimatePoints } =
    readTaskFields(formData);

  const invalid = validateTask(title);
  if (invalid) return { error: invalid, done: null };

  try {
    const saved = await api.patch<Task>(`/tasks/${taskId}`, {
      ...(estimatePoints !== undefined && { estimatePoints }),
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
/**
 * Cuántas renumeraciones se aceptan detrás de un movimiento.
 *
 * Es un tope de cordura, no un límite de producto: una columna razonable
 * renumera dos o tres tareas, y si alguna vez salieran cincuenta peticiones de
 * un solo arrastre, el fallo está en quien las calcula y no en el tablero.
 */
const MAX_RENUMERACIONES = 30;

/**
 * Mueve una tarea **a un hueco concreto**, no al final de la columna.
 *
 * ⚠️ **El backend no reindexa nada.** `POST /tasks/:id/move` escribe el `order`
 * que le mandes y se acabó: si insertas en medio, la tarea nueva comparte número
 * con la que ya estaba ahí y el orden entre las dos lo decide el desempate por
 * `createdAt`, es decir, el azar de cuál se creó antes. Por eso el cliente manda
 * también `renumerar`: la lista `id:orden` de las que **de verdad** cambian de
 * número, calculada contra los `order` que ya tiene en pantalla.
 *
 * Van desde aquí y no desde el navegador por una razón concreta: cada llamada
 * suelta desde el cliente arrastraría su propia revalidación de esta ruta —que
 * es el árbol entero del proyecto—, así que arrastrar una tarjeta costaría tres
 * o cuatro renders completos. Aquí son N peticiones al gateway y **una sola**
 * revalidación al final.
 *
 * ⚠️ **Una renumeración que falle no tumba el movimiento.** Lo que importaba
 * —que la tarea esté en su columna— ya está hecho y confirmado contra el `data`;
 * lo otro es cosmética del orden, y devolver un error por ello dejaría la
 * pantalla deshaciendo un movimiento que sí se guardó.
 *
 * La lista de sucesión pedía un endpoint de reordenado en bloque como el que ya
 * tienen las columnas (`PATCH /boards/:id/columns/reorder`). Ver
 * PENDIENTES-BACKEND.
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

  /* `id:orden,id:orden`. Solo llegan las que cambian, y sin `status`: no se
     mueven de columna, así que su estado es el que ya tenían. */
  const renumeraciones = String(formData.get('renumerar') ?? '')
    .split(',')
    .filter(Boolean)
    .slice(0, MAX_RENUMERACIONES)
    .map((par) => {
      const [id, posicion] = par.split(':');
      return { id, order: Number(posicion) };
    })
    .filter((entrada) => entrada.id && Number.isInteger(entrada.order) && entrada.order >= 0);

  if (renumeraciones.length > 0) {
    await Promise.allSettled(
      renumeraciones.map((entrada) =>
        api.post<Task>(`/tasks/${entrada.id}/move`, { columnId, order: entrada.order }),
      ),
    );
  }

  revalidateProject(projectId);
  return { error: null, done: 'moved' };
}

/**
 * Cambia solo la fecha de vencimiento: lo que arrastra la vista de Calendario
 * al soltar una tarea sobre otro día.
 *
 * ⚠️ **A propósito no reusa `updateTaskAction`.** Ese lee `readTaskFields` y
 * reenvía título, prioridad, encargados y etiquetas junto con la fecha — bien
 * para el panel, que ya tiene los cinco a mano, pero forzaría al calendario a
 * cargar la tarea entera solo para soltarla un día más allá. `PATCH /tasks/:id`
 * admite un cuerpo parcial, así que aquí solo viaja lo que cambió.
 */
export async function moveTaskDueDateAction(
  _prev: TaskState,
  formData: FormData,
): Promise<TaskState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const taskId = String(formData.get('taskId') ?? '');
  /** Vacío es «sin fecha»: se manda `null` explícito, no se omite el campo. */
  const dueDate = String(formData.get('dueDate') ?? '').trim();

  try {
    const saved = await api.patch<Task>(`/tasks/${taskId}`, {
      dueDate: dueDate ? toIsoDueDate(dueDate) : null,
    });
    if (!saved?.id) return { error: 'El servidor no guardó la fecha.', done: null };
  } catch (error) {
    return { error: describe(error, 'No se pudo cambiar la fecha.'), done: null };
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

/** Cambia el texto de un paso. Pide `canEditTask`; marcar y desmarcar es otra acción. */
export async function updateChecklistItemAction(
  _prev: TaskState,
  formData: FormData,
): Promise<TaskState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const taskId = String(formData.get('taskId') ?? '');
  const itemId = String(formData.get('itemId') ?? '');
  const text = String(formData.get('text') ?? '').trim();

  if (!text) return { error: 'El paso no puede estar vacío.', done: null };
  if (text.length > 500) return { error: 'El paso admite 500 caracteres como máximo.', done: null };

  try {
    const updated = await api.patch<ChecklistItem>(`/tasks/${taskId}/checklists/${itemId}`, {
      text,
    });
    if (updated?.text !== text) {
      return { error: 'El servidor no guardó el cambio.', done: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo editar el paso.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'updated' };
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

/* ─── Adjuntos ──────────────────────────────────────────────────────── */

/**
 * Sube un archivo a una tarea.
 *
 * El `FormData` se reenvía **tal cual** al gateway: reconstruirlo aquí
 * significaría leer el archivo entero en memoria para volver a empaquetarlo.
 * Solo se le quitan los campos que son nuestros y que el endpoint no declara.
 */
export async function uploadAttachmentAction(
  _prev: TaskState,
  formData: FormData,
): Promise<TaskState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const taskId = String(formData.get('taskId') ?? '');
  const file = formData.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Elige un archivo.', done: null };
  }

  const invalid = validateAttachment(file.type, file.size);
  if (invalid) return { error: invalid, done: null };

  const upload = new FormData();
  upload.append('file', file);

  try {
    const created = await api.postForm<TaskAttachment>(`/tasks/${taskId}/attachments`, upload);
    if (!created?.id) {
      return { error: 'El servidor no guardó el archivo.', done: null };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo subir el archivo.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'uploaded' };
}

/** Lo borra quien lo subió, o quien pueda eliminar tareas. */
export async function deleteAttachmentAction(
  _prev: TaskState,
  formData: FormData,
): Promise<TaskState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const projectId = String(formData.get('projectId') ?? '');
  const taskId = String(formData.get('taskId') ?? '');
  const attachmentId = String(formData.get('attachmentId') ?? '');

  try {
    await api.delete(`/tasks/${taskId}/attachments/${attachmentId}`);
  } catch (error) {
    return { error: describe(error, 'No se pudo eliminar el archivo.'), done: null };
  }

  revalidateProject(projectId);
  return { error: null, done: 'deleted' };
}

/* ─── Chat del proyecto ─────────────────────────────────────────────── */

/**
 * ## Funciones normales, no `useAccion`
 *
 * El redactor **controla su propio texto** —insertar una mención obliga a
 * reescribirlo y a recolocar el cursor—, así que no hay `FormData` que mandar:
 * el cuerpo ya viene montado. Server Actions llamadas como funciones desde un
 * componente de cliente es una forma tan válida como el formulario, y aquí es la
 * que encaja.
 */

/**
 * Escribe en el chat del proyecto.
 *
 * Exige `canComment`, el mismo permiso que comentar en una tarea. No hay un
 * `canChat` a propósito: los permisos de un rol son un diccionario, así que una
 * clave nueva nace en `false` para todos los roles que ya existen y el chat
 * saldría mudo hasta editarlos uno a uno en cada proyecto.
 */
export async function sendChatMessageAction(
  projectId: string,
  cuerpo: string,
  replyToId: string | null,
  attachmentIds: string[] = [],
  enHilo = false,
): Promise<{ error: string | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.' };

  const body = normalizeMultiline(cuerpo);
  /* El mensaje puede ir sin texto si lleva archivos; la validación del cuerpo
     solo se aplica cuando hay texto. */
  const invalid = body.trim() ? validateChatMessage(body) : null;
  if (invalid) return { error: invalid };
  if (attachmentIds.length > 5) return { error: 'Un mensaje no puede llevar más de 5 archivos.' };

  try {
    /* Se confirma contra el `data` de la respuesta y no contra el status: un
       200 sin cuerpo ya nos ha mentido antes. */
    const created = await api.post<ChatMessage>(`/projects/${projectId}/chat/messages`, {
      ...(body.trim() ? { body } : {}),
      ...(replyToId && { replyToId }),
      ...(attachmentIds.length > 0 && { attachmentIds }),
      ...(enHilo && { enHilo }),
    });
    if (!created?.id) return { error: 'El servidor no guardó el mensaje.' };
  } catch (error) {
    return { error: describe(error, 'No se pudo enviar el mensaje.') };
  }

  revalidateProject(projectId);
  return { error: null };
}

/** Lo borra su autor, o quien gestione el equipo. El gateway lo resuelve. */
export async function deleteChatMessageAction(
  projectId: string,
  messageId: string,
): Promise<{ error: string | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.' };

  try {
    await api.delete(`/projects/${projectId}/chat/messages/${messageId}`);
  } catch (error) {
    return { error: describe(error, 'No se pudo eliminar el mensaje.') };
  }

  revalidateProject(projectId);
  return { error: null };
}

/**
 * Pone o quita una reacción.
 *
 * ⚠️ **No revalida.** Reaccionar repintaría el proyecto entero por un emoji, y
 * con varias personas reaccionando seguido eso es un parpadeo constante. El
 * panel se queda con lo que devuelve el servidor para ese mensaje.
 */
export async function reactChatAction(
  projectId: string,
  messageId: string,
  emoji: string,
  on: boolean,
): Promise<void> {
  const api = await requireApi();
  if (!api) return;

  await api
    .post(`/projects/${projectId}/chat/messages/${messageId}/react`, { emoji, on })
    .catch(() => undefined);
}

/**
 * Fija o desfija un mensaje del chat del proyecto.
 *
 * ⚠️ **No revalida**, igual que reaccionar: el panel pinta el resultado con lo
 * que esto devuelve, y revalidar repintaría la conversación entera por un pin.
 */
export async function pinChatMessageAction(
  projectId: string,
  messageId: string,
  on: boolean,
): Promise<{ error: string | null; pinned: boolean; pinnedById: string | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', pinned: false, pinnedById: null };

  try {
    const resultado = await api.post<{
      messageId: string;
      pinned: boolean;
      pinnedById: string | null;
    }>(`/projects/${projectId}/chat/messages/${messageId}/pin`, { on });
    if (!resultado)
      return { error: 'El servidor no guardó el fijado.', pinned: false, pinnedById: null };
    return { error: null, pinned: resultado.pinned, pinnedById: resultado.pinnedById };
  } catch (error) {
    return {
      error: describe(error, 'No se pudo fijar el mensaje.'),
      pinned: false,
      pinnedById: null,
    };
  }
}

/**
 * Edita el texto de un mensaje propio del chat del proyecto.
 *
 * ⚠️ **No revalida**, igual que fijar y reaccionar: el panel pinta el resultado
 * con lo que esto devuelve. Solo el autor puede editar; el servidor lo
 * comprueba y devuelve 404 si no es suyo.
 */
export async function editChatMessageAction(
  projectId: string,
  messageId: string,
  body: string,
): Promise<{ error: string | null; message: ChatMessage | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', message: null };

  try {
    const resultado = await api.patch<ChatMessage>(
      `/projects/${projectId}/chat/messages/${messageId}`,
      { body },
    );
    if (!resultado) return { error: 'El servidor no guardó el cambio.', message: null };
    return { error: null, message: resultado };
  } catch (error) {
    return { error: describe(error, 'No se pudo editar el mensaje.'), message: null };
  }
}

/**
 * Deja el chat por leído.
 *
 * ⚠️ **No revalida.** La llama el propio chat al abrirse, y revalidar desde ahí
 * volvería a renderizar la página que acaba de pintarse —y con ella el chat, que
 * volvería a llamar—: un bucle. El contador se pone al día en la siguiente
 * navegación o con el refresco que ya dispara cualquier aviso en vivo.
 */
export async function markChatReadAction(projectId: string): Promise<void> {
  const api = await requireApi();
  if (!api) return;

  await api.post(`/projects/${projectId}/chat/read`, {}).catch(() => undefined);

  /**
   * ⚠️ **Revalida el armazón, y sin esto la insignia mentía.**
   *
   * Marcar leído escribe en el servidor y no cambia nada de lo que se está
   * viendo… salvo el contador de la barra lateral, que lo calcula
   * `loadPrivateChrome()` en el `layout.tsx`. Sin revalidar, abrías la
   * conversación, la leías entera, contestabas — y la burbuja de no leídos
   * seguía ahí hasta cambiar de página o recargar.
   *
   * Se revalida el **layout** y no la página: el contador no vive en la
   * pantalla del chat, vive en el armazón que la envuelve.
   */
  revalidatePath('/projects', 'layout');
}

/**
 * Sube un archivo al chat del proyecto y lo deja en **borrador**.
 *
 * El adjunto se sube solo y queda sin mensaje; al enviar, los `attachmentIds`
 * del mensaje lo reclaman. Devuelve los metadatos para que el redactor lo pinte
 * como chip pendiente.
 *
 * No revalida: revalidar repintaría el proyecto entero por cada archivo que se
 * adjunta, y además el borrador no se ve en ninguna lista todavía.
 */
export async function uploadChatAttachmentAction(
  projectId: string,
  file: File,
): Promise<{ error: string | null; attachment: ChatAttachment | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', attachment: null };

  if (file.size === 0) return { error: 'El archivo está vacío.', attachment: null };
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
    return {
      error: `El archivo supera el máximo de ${Math.round(CHAT_ATTACHMENT_MAX_BYTES / 1024 / 1024)} MB.`,
      attachment: null,
    };
  }

  const upload = new FormData();
  upload.append('file', file);

  try {
    const created = await api.postForm<ChatAttachment>(
      `/projects/${projectId}/chat/attachments`,
      upload,
    );
    if (!created?.id) {
      return { error: 'El servidor no guardó el archivo.', attachment: null };
    }
    return { error: null, attachment: created };
  } catch (error) {
    return { error: describe(error, 'No se pudo subir el archivo.'), attachment: null };
  }
}

/** Borra un adjunto del chat: un borrador propio, o cualquiera si moderas. */
export async function deleteChatAttachmentAction(
  projectId: string,
  attachmentId: string,
): Promise<{ error: string | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.' };

  try {
    await api.delete(`/projects/${projectId}/chat/attachments/${attachmentId}`);
  } catch (error) {
    return { error: describe(error, 'No se pudo eliminar el archivo.') };
  }

  return { error: null };
}

/**
 * Silencia el chat del proyecto, o le devuelve el sonido.
 *
 * ⚠️ **Silenciar no deja de contar lo no leído.** Lo que se apaga es la tarjeta
 * emergente y el sonido; la insignia de la pestaña sigue. Son dos cosas
 * distintas y confundirlas dejaría a alguien sin enterarse nunca de un chat que
 * sí quiere leer, solo porque le molestaba el ruido.
 */
export async function muteChatAction(
  projectId: string,
  muted: boolean,
): Promise<{ muted: boolean } | null> {
  const api = await requireApi();
  if (!api) return null;

  const confirmado = await api
    .post<{ muted: boolean }>(`/projects/${projectId}/chat/mute`, { muted })
    .catch(() => null);

  if (confirmado) revalidateProject(projectId);
  return confirmado;
}

/**
 * Preview de la primera URL de un mensaje del chat.
 *
 * ⚠️ **Solo se ejecuta en el servidor** (archivo `'use server'`) y es una
 * **lectura de una URL ajena**, así que va por `obtenerPreviewDeEnlace`, que
 * lleva el guard SSRF —bloquea IPs privadas, valida cada redirección—. El
 * cliente nunca hace este fetch directo. Un fallo devuelve `null`: una preview
 * que no sale no debe romper el mensaje.
 */
export async function previewDeEnlaceAction(url: string): Promise<LinkPreview | null> {
  const session = await getSession();
  if (!session) return null;
  return obtenerPreviewDeEnlace(url);
}

/* ─── Utilidades ────────────────────────────────────────────────────── */

function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      /* ⚠️ **No todos los 403 son de permisos.** Un proyecto suspendido y un
         equipo sin asientos también responden 403, traen su propio `code` y su
         mensaje explica la salida — que no es «pídeselo a quien administra».
         Sustituirlo por la frase de abajo le dice al dueño de un proyecto que no
         tiene permiso sobre lo suyo. */
      if (el403SeExplicaSolo(error.code)) return error.message;
      return 'No tienes permiso para hacer esto en este proyecto.';
    }
    if (error.status >= 500) return fallback;
    return error.message;
  }
  return fallback;
}
