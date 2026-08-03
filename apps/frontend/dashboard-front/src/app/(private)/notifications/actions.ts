'use server';

import { ApiError } from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { revalidatePath } from 'next/cache';
import type { NotificationState } from '@/lib/action-state';

/**
 * Acciones de la bandeja de avisos.
 *
 * Las dos son idempotentes y el backend acota por el usuario del token, así que
 * no hay nada que validar aquí: no se puede marcar el aviso de otra persona ni
 * por accidente ni a propósito.
 */

async function requireApi() {
  const session = await getSession();
  if (!session) return null;
  return createServerApiClient();
}

/** Revalida la bandeja y el panel, que comparten la insignia de no leídos. */
function revalidateInbox() {
  revalidatePath('/notifications');
  revalidatePath('/');
}

export async function markNotificationReadAction(
  _prev: NotificationState,
  formData: FormData,
): Promise<NotificationState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  const id = String(formData.get('notificationId') ?? '');

  try {
    await api.patch(`/me/notifications/${id}/read`, {});
  } catch (error) {
    /* Un 404 aquí significa que el aviso ya no está o nunca fue suyo. Marcar
       algo que no existe no es un fallo que merezca interrumpir a nadie. */
    if (error instanceof ApiError && error.status === 404) {
      revalidateInbox();
      return { error: null, done: 'read' };
    }
    return { error: 'No se pudo marcar el aviso.', done: null };
  }

  revalidateInbox();
  return { error: null, done: 'read' };
}

export async function markAllNotificationsReadAction(
  _prev: NotificationState,
  _formData: FormData,
): Promise<NotificationState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null };

  try {
    await api.post('/me/notifications/read-all', {});
  } catch {
    return { error: 'No se pudieron marcar los avisos.', done: null };
  }

  revalidateInbox();
  return { error: null, done: 'read-all' };
}
