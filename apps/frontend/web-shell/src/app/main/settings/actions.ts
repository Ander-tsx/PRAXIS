'use server';

import type { UpdateProfileState } from '@/lib/main/action-state';
import { validateProfile } from '@/lib/main/validation';
import { ApiError } from '@praxis/commons';
import type { UserProfile } from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { revalidatePath } from 'next/cache';

/**
 * Guarda nombre y apellido del usuario identificado.
 *
 * **Entra y sale en camelCase.** Era el único endpoint que recibía `first_name`
 * y devolvía `firstName`, así que leer un usuario y devolver el mismo objeto
 * cambiado daba 200 sin guardar nada (PENDIENTES-BACKEND §10, cerrado). El
 * backend sigue aceptando la forma vieja, marcada como obsoleta, pero desde aquí
 * ya se manda la buena.
 *
 * Se sigue confirmando contra el `data` y no contra el status: la costumbre nace
 * justo de aquel 200 mentiroso y sigue siendo lo correcto.
 *
 * Se manda el `:id` de la sesión, nunca uno que venga del formulario.
 */
export async function updateProfileAction(
  _prevState: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const session = await getSession();
  if (!session) {
    return { error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.', savedName: null };
  }

  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();

  const invalid = validateProfile({ firstName, lastName });
  if (invalid) {
    return { error: invalid, savedName: null };
  }

  const api = createServerApiClient();

  let updated: UserProfile;
  try {
    // camelCase, y solo los dos campos que el DTO declara.
    updated = await api.patch<UserProfile>(`/users/${session.userId}`, {
      firstName,
      lastName,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message, savedName: null };
    }
    return { error: 'No se pudo guardar tu perfil.', savedName: null };
  }

  // La confirmación real: que el servidor devuelva lo que mandamos.
  if (updated?.firstName !== firstName || updated?.lastName !== lastName) {
    return {
      error: 'El servidor respondió correctamente pero no guardó los cambios. Inténtalo de nuevo.',
      savedName: null,
    };
  }

  /* ⚠️ Rutas completas, con `/main` delante: ya no hay `basePath` que Next
     anteponga. El nombre se ve en el panel, en `/main/profile` —que es quien
     pinta este formulario— y en la barra lateral, que vive en el layout y lo
     recibe del mismo perfil. */
  revalidatePath('/main');
  revalidatePath('/main/profile');

  return { error: null, savedName: firstName };
}
