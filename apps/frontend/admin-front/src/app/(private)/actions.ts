'use server';

import type { AdminUserState } from '@/lib/action-state';
import { type AdminUser, ApiError, GLOBAL_ROLES, USER_STATUSES } from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { revalidatePath } from 'next/cache';

/**
 * Cambia el estado de una cuenta.
 *
 * ## Se valida en el cliente aunque el gateway ya valide
 *
 * Es la regla del repo: el mensaje llega antes y señala el campo. Aquí importa
 * especialmente el motivo — mandarlo vacío devuelve un 400 correcto pero el
 * formulario ya lo sabía.
 *
 * ## Se confirma contra el `data`, no contra el status
 *
 * El hábito viene de cuando el gateway no validaba y respondía 200 sin guardar
 * nada, y sigue siendo lo correcto: si el estado que vuelve no es el que se pidió,
 * algo pasó y hay que decirlo en vez de pintar la fila como si hubiera cambiado.
 */
export async function setUserStatusAction(
  _prev: AdminUserState,
  formData: FormData,
): Promise<AdminUserState> {
  const session = await getSession();
  if (!session) {
    return { error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.', done: null };
  }

  const userId = String(formData.get('userId') ?? '');
  const status = String(formData.get('status') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();

  if (!USER_STATUSES.includes(status as never)) {
    return { error: 'Ese estado no existe.', done: null };
  }

  /* El motivo es obligatorio para todo lo que no sea reactivar: una cuenta
     bloqueada sin motivo es una cuenta que nadie sabe explicar. Deshacer no
     necesita justificación. */
  if (status !== 'ACTIVE' && reason.length < 4) {
    return { error: 'Escribe el motivo: al menos 4 caracteres.', done: null };
  }

  let actualizado: AdminUser;
  try {
    actualizado = await createServerApiClient().patch<AdminUser>(`/admin/users/${userId}/status`, {
      status,
      ...(reason ? { reason } : {}),
    });
  } catch (error) {
    return { error: describeError(error), done: null };
  }

  if (actualizado?.status !== status) {
    return {
      error: 'El servidor respondió correctamente pero no guardó el cambio.',
      done: null,
    };
  }

  revalidatePath('/');
  revalidatePath('/actividad');
  return { error: null, done: actualizado.status };
}

/**
 * Fija el rol global de una cuenta.
 *
 * `PUT`, no `PATCH`: reemplaza. El nivel efectivo de una cuenta es el más alto de
 * sus filas, así que «añadir User» a un Admin no lo degradaría, y el panel enseña
 * un rol.
 */
export async function setUserRoleAction(
  _prev: AdminUserState,
  formData: FormData,
): Promise<AdminUserState> {
  const session = await getSession();
  if (!session) {
    return { error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.', done: null };
  }

  const userId = String(formData.get('userId') ?? '');
  const role = String(formData.get('role') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();

  if (!Object.values(GLOBAL_ROLES).includes(role as never)) {
    return { error: 'Ese rol no existe.', done: null };
  }

  let resultado: { userId: string; globalRole: string };
  try {
    resultado = await createServerApiClient().put<{ userId: string; globalRole: string }>(
      `/admin/users/${userId}/role`,
      { role, ...(reason ? { reason } : {}) },
    );
  } catch (error) {
    return { error: describeError(error), done: null };
  }

  if (resultado?.globalRole !== role) {
    return {
      error: 'El servidor respondió correctamente pero no guardó el rol.',
      done: null,
    };
  }

  revalidatePath('/');
  revalidatePath('/actividad');
  return { error: null, done: resultado.globalRole };
}

/*
 * 🕳️ Aquí estaba `setAssistantPlanAction`, que llamaba a
 * `PUT /admin/users/:id/plan`.
 *
 * Concedía el `PRO` **por persona** del asistente. Esa ruta ya no existe: el
 * tope de IA lo pone el plan de la **organización** desde la etapa Enterprise, y
 * lo que esto concedía no cambiaba ningún límite. Ver
 * `docs/AUDITORIA-PLANES.md` (P5-P7).
 */

/**
 * Borra una cuenta de verdad.
 *
 * ⚠️ **No es desactivar.** Aquello es un estado y se deshace; esto quita la
 * cuenta y sus credenciales, y no se deshace.
 *
 * Lo que esa persona escribió —tareas, mensajes, actividad— **se queda**: vive
 * en otros esquemas sin clave foránea, y borrarlo dejaría huecos en tableros de
 * proyectos que no tienen nada que ver con ella. Se lee como «Usuario
 * eliminado».
 *
 * El gateway se niega si todavía es dueña de algún proyecto, y dice cuáles: un
 * proyecto sin dueño no se puede administrar desde ningún sitio.
 */
export async function deleteUserAction(
  _prev: AdminUserState,
  formData: FormData,
): Promise<AdminUserState> {
  const session = await getSession();
  if (!session) {
    return { error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.', done: null };
  }

  const userId = String(formData.get('userId') ?? '');
  const etiqueta = String(formData.get('userLabel') ?? '');
  const confirmacion = String(formData.get('confirmacion') ?? '');

  /* Se comprueba aquí además de en el cliente: el `FormData` de una Server
     Function no es de fiar solo porque el formulario lo haya validado. */
  if (confirmacion.trim() !== etiqueta.trim()) {
    return { error: 'El nombre no coincide. Escríbelo tal cual para confirmar.', done: null };
  }

  try {
    await createServerApiClient().delete(`/admin/users/${userId}`);
  } catch (error) {
    return { error: describeError(error), done: null };
  }

  revalidatePath('/');
  revalidatePath('/actividad');
  return { error: null, done: userId };
}

/**
 * Traduce el error del gateway a algo que se pueda leer en pantalla.
 *
 * Los 403 y los 409 de aquí **ya vienen redactados para una persona** —«Solo
 * puedes administrar cuentas de nivel inferior al tuyo», «Es el último
 * SuperAdmin…»— así que se pasan tal cual: reescribirlos aquí sería mantener dos
 * versiones del mismo mensaje y acabar con la peor.
 */
function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.message) return error.message;
    if (error.status === 403) return 'No tienes nivel suficiente para hacer esto.';
    if (error.status === 409) return 'El cambio dejaría el sistema sin administración.';
  }
  return 'No se pudo aplicar el cambio. Vuelve a intentarlo.';
}
