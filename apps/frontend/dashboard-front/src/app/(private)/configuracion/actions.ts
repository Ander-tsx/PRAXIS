'use server';

import { ApiError } from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { THEME_COOKIE, themeCookieOptions, type ThemeName } from '@praxis/commons/theme';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { UpdateProfileState } from '@/lib/action-state';
import type { UserProfile } from '@praxis/commons';
import { validateProfile } from '@/lib/validation';

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

  // Sin el basePath: son rutas del App Router de esta app, donde el panel es
  // `/` y esta pantalla `/configuracion`. El nombre se ve en las dos, y también
  // en la barra lateral, que vive en el layout y lo recibe del mismo perfil.
  revalidatePath('/');
  revalidatePath('/configuracion');

  return { error: null, savedName: firstName };
}

/**
 * Guarda el tema elegido en la cookie compartida por las cinco zonas.
 *
 * No hay nada que validar contra el backend —el tema no vive en ningún
 * microservicio, es una preferencia de la interfaz— así que no hay `data` que
 * confirmar: escribir la cookie y que el layout la relea es la confirmación.
 *
 * `revalidatePath('/', 'layout')` y no solo `'/configuracion'`: el `data-theme`
 * lo estampa el `RootLayout`, que envuelve toda la zona, no la page. Sin el
 * segundo argumento, `revalidatePath` solo invalida ese segmento y el `<html>`
 * se queda con el tema viejo hasta la próxima navegación completa.
 */
export async function setThemeAction(theme: ThemeName): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE, theme, themeCookieOptions());
  revalidatePath('/', 'layout');
}
