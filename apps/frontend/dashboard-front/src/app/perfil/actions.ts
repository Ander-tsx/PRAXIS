'use server';

import { ApiError } from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { revalidatePath } from 'next/cache';
import type { UpdateProfileState } from '@/lib/action-state';
import type { UserProfile } from '@praxis/commons';
import { validateProfile } from '@/lib/validation';

/**
 * Guarda nombre y apellido del usuario identificado.
 *
 * Dos trampas de este endpoint, las dos verificadas contra el stack:
 *
 * 1. **Entra en snake_case y sale en camelCase.** `PATCH /users/:id` acepta
 *    `first_name` / `last_name` y devuelve `firstName` / `lastName`.
 * 2. **Ahora sí valida**: mandar `firstName` en camelCase devuelve 400 con el
 *    mensaje del campo. Antes devolvía 200 sin guardar nada, y de ahí viene la
 *    costumbre de confirmar contra el `data` y no contra el status, que se
 *    mantiene porque sigue siendo lo correcto. Ver PENDIENTES-BACKEND.md §10.
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
    // snake_case, y solo los dos campos que el DTO declara.
    updated = await api.patch<UserProfile>(`/users/${session.userId}`, {
      first_name: firstName,
      last_name: lastName,
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

  // Sin el basePath: son rutas del App Router de esta app, donde el panel es
  // `/` y esta pantalla `/perfil`. El nombre se ve en las dos.
  revalidatePath('/');
  revalidatePath('/perfil');

  return { error: null, savedName: firstName };
}
