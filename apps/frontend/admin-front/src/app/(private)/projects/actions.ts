'use server';

import type { AdminProjectState } from '@/lib/action-state';
import { type AdminProject, ApiError, PROJECT_STATUSES } from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { revalidatePath } from 'next/cache';

/**
 * Suspende, reactiva o archiva un proyecto.
 *
 * ## El motivo no es burocracia
 *
 * Es el texto que va a leer el dueño en el aviso de su propia pantalla. Sin él ve
 * un proyecto donde ningún botón funciona y ni una palabra que lo explique, así que
 * abre un ticket en vez de entenderlo. El gateway lo exige igual (400), pero
 * validarlo aquí marca el campo y llega antes.
 *
 * ## Se confirma contra el `data`, no contra el status
 *
 * Si el estado que vuelve no es el que se pidió, hay que decirlo en vez de pintar
 * la fila como si hubiera cambiado. La costumbre viene de cuando el gateway
 * respondía 200 sin guardar nada, y sigue siendo lo correcto.
 */
export async function setProjectStatusAction(
  _prev: AdminProjectState,
  formData: FormData,
): Promise<AdminProjectState> {
  const session = await getSession();
  if (!session) {
    return { error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.', done: null };
  }

  const projectId = String(formData.get('projectId') ?? '');
  const status = String(formData.get('status') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();

  if (!PROJECT_STATUSES.includes(status as never)) {
    return { error: 'Ese estado no existe.', done: null };
  }

  /* Volver a activo es deshacer, y deshacer no necesita justificarse. Todo lo
     demás sí: es lo que se le enseña al dueño. */
  if (status !== 'ACTIVE' && reason.length < 4) {
    return { error: 'Escribe el motivo: al menos 4 caracteres.', done: null };
  }

  let actualizado: AdminProject;
  try {
    actualizado = await createServerApiClient().patch<AdminProject>(
      `/admin/projects/${projectId}/status`,
      { status, ...(reason ? { reason } : {}) },
    );
  } catch (error) {
    return { error: describeError(error), done: null };
  }

  if (actualizado?.status !== status) {
    return {
      error: 'El servidor respondió correctamente pero no guardó el cambio.',
      done: null,
    };
  }

  revalidatePath('/projects');
  revalidatePath('/actividad');
  return { error: null, done: actualizado.status };
}

/**
 * Borra un proyecto de verdad, con su purga en los otros servicios.
 *
 * ⚠️ **No es archivar.** Archivar es un estado y se deshace; esto quita la fila
 * y arrastra espacios, tableros, columnas, roles, miembros, chat, tareas y
 * reglas. No hay pantalla desde la que recuperarlo.
 *
 * Por eso la confirmación pide **escribir el nombre**: un «¿seguro?» se pulsa
 * con la misma mano y la misma atención con la que se pulsó el botón que lo
 * abrió, y aquí lo que hace falta es un segundo de más.
 */
export async function deleteProjectAction(
  _prev: AdminProjectState,
  formData: FormData,
): Promise<AdminProjectState> {
  const session = await getSession();
  if (!session) {
    return { error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.', done: null };
  }

  const projectId = String(formData.get('projectId') ?? '');
  const nombre = String(formData.get('projectName') ?? '');
  const confirmacion = String(formData.get('confirmacion') ?? '');

  /* Se comprueba aquí además de en el cliente: el `FormData` de una Server
     Function no es de fiar solo porque el formulario lo haya validado. */
  if (confirmacion.trim() !== nombre.trim()) {
    return { error: 'El nombre no coincide. Escríbelo tal cual para confirmar.', done: null };
  }

  try {
    await createServerApiClient().delete(`/admin/projects/${projectId}`);
  } catch (error) {
    return { error: describeError(error), done: null };
  }

  revalidatePath('/projects');
  revalidatePath('/actividad');
  return { error: null, done: projectId };
}

/**
 * Traduce el error del gateway a algo legible.
 *
 * Los mensajes de estas rutas **ya vienen redactados para una persona**, así que se
 * pasan tal cual: reescribirlos aquí sería mantener dos versiones del mismo texto y
 * quedarse con la peor.
 */
function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.message) return error.message;
    if (error.status === 403) return 'No tienes nivel suficiente para hacer esto.';
    if (error.status === 404) return 'Ese proyecto ya no existe.';
  }
  return 'No se pudo aplicar el cambio. Vuelve a intentarlo.';
}
