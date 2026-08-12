'use server';

import type { AdminUserState } from '@/lib/action-state';
import {
  ASSISTANT_PLANS,
  type AdminUser,
  ApiError,
  GLOBAL_ROLES,
  USER_STATUSES,
} from '@praxis/commons';
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

/**
 * Cambia el plan del asistente de una cuenta.
 *
 * Es lo que sustituye a una pasarela de pago mientras no exista: PRO se concede
 * a mano desde el panel. Sigue el mismo camino que el cambio de rol —`PUT`,
 * motivo opcional, confirmación contra el `data` de la respuesta— porque es la
 * misma clase de decisión administrativa.
 */
export async function setAssistantPlanAction(
  _prev: AdminUserState,
  formData: FormData,
): Promise<AdminUserState> {
  const session = await getSession();
  if (!session) {
    return { error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.', done: null };
  }

  const userId = String(formData.get('userId') ?? '');
  const plan = String(formData.get('plan') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();

  if (!ASSISTANT_PLANS.includes(plan as never)) {
    return { error: 'Ese plan no existe.', done: null };
  }

  let resultado: { userId: string; plan: string };
  try {
    resultado = await createServerApiClient().put<{ userId: string; plan: string }>(
      `/admin/users/${userId}/plan`,
      { plan, ...(reason ? { reason } : {}) },
    );
  } catch (error) {
    return { error: describeError(error), done: null };
  }

  /* Contra el `data`, no contra el status: es la regla del repo, y aquí evita
     decir que alguien tiene PRO cuando la escritura no llegó a ocurrir. */
  if (resultado?.plan !== plan) {
    return {
      error: 'El servidor respondió correctamente pero no guardó el plan.',
      done: null,
    };
  }

  revalidatePath('/');
  revalidatePath('/actividad');
  return { error: null, done: resultado.plan };
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
