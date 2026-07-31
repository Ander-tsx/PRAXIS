'use server';

import { ApiError } from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { InvitationResponseState } from '@/lib/action-state';

/**
 * Responder a una invitación **desde la página del proyecto**.
 *
 * Es la gemela de la del panel, y existe aparte porque lo que pasa después es
 * distinto: allí se responde desde una lista y se sigue en la lista; aquí se
 * responde estando ya en la puerta del proyecto.
 *
 * - **Aceptar** revalida y deja la página, que en el siguiente render ya tiene
 *   proyecto que enseñar. Quien pulsó un enlace de invitación quería entrar.
 * - **Rechazar** saca de aquí: sin invitación y sin membresía esta página no
 *   tiene nada que mostrar, y quedarse sería una pantalla vacía.
 *
 * Cuelga de `/me/invitations`, que no exige permisos sobre el proyecto —no
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
  const projectId = String(formData.get('projectId') ?? '');
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

  if (decision === 'reject') {
    revalidatePath('/');
    redirect('/');
  }

  revalidatePath(`/${projectId}`);
  revalidatePath('/');
  return { error: null, done: decision };
}
