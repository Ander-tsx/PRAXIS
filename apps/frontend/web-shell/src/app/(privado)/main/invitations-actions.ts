'use server';

import type { InvitationResponseState } from '@/lib/main/action-state';
import { ApiError } from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { revalidatePath } from 'next/cache';

/**
 * Responder a una invitación.
 *
 * Aceptar crea la membresía en el backend; rechazar solo la marca. Las dos
 * cuelgan de `/me/invitations`, que no exige permisos sobre el proyecto —no
 * puedes tenerlos si aún no estás dentro— y comprueba que la invitación sea
 * tuya.
 */
export async function respondInvitationAction(
  _prev: InvitationResponseState,
  formData: FormData,
): Promise<InvitationResponseState> {
  const session = await getSession();
  if (!session) {
    return { error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.', done: null };
  }

  const invitationId = String(formData.get('invitationId') ?? '');
  const decision = String(formData.get('decision') ?? '');

  if (decision !== 'accept' && decision !== 'reject') {
    return { error: 'Respuesta no válida.', done: null };
  }

  try {
    await createServerApiClient().post(`/me/invitations/${invitationId}/${decision}`);
  } catch (error) {
    if (error instanceof ApiError) {
      // 409: ya la respondiste en otra pestaña, o la retiraron.
      return { error: error.message, done: null };
    }
    return { error: 'No se pudo enviar tu respuesta.', done: null };
  }

  revalidatePath('/main');
  return { error: null, done: decision };
}
