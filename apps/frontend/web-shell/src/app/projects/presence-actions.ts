'use server';

import type { Presence, UserProfile } from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { revalidatePath } from 'next/cache';

/**
 * Cambiar tu estado desde el pie de la barra lateral, **en esta zona**.
 *
 * ⚠️ Una Server Action solo se puede invocar desde la zona que la define: cada
 * app de Next tiene su propio bundle y su propio proxy al gateway. Por eso hay
 * una copia por zona en vez de una compartida en `commons` — que además es
 * código de servidor y no se puede importar desde un componente de cliente.
 *
 * La pantalla donde se administra todo lo tuyo vive en `dashboard`; esto es
 * solo el atajo.
 */
export async function setPresenceAction(presence: Presence): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;

  try {
    const actualizado = await createServerApiClient().patch<UserProfile>(
      `/users/${session.userId}`,
      { presence },
    );
    /* Contra el `data`, no contra el status. */
    if (!actualizado?.id) return null;

    /* El armazón se pinta en el layout: es lo que hay que revalidar para que
       el punto cambie en todas las pantallas de la zona. */
    revalidatePath('/projects', 'layout');
    return actualizado.presence ?? presence;
  } catch {
    return null;
  }
}
