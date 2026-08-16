'use server';

import type { UpdateProfileState, VoiceLinkState } from '@/lib/action-state';
import { validateProfile } from '@/lib/validation';
import type { VoiceSeedPhrase } from '@/lib/voice';
import { ApiError } from '@praxis/commons';
import type { UserProfile } from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import {
  THEME_COOKIE,
  type ThemeName,
  esTemaValido,
  themeCookieOptions,
} from '@praxis/commons/theme';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

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
  // `/` y esta pantalla `/settings`. El nombre se ve en las dos, y también
  // en la barra lateral, que vive en el layout y lo recibe del mismo perfil.
  //
  // ⚠️ **`/profile` también**, que es de donde se llama hoy: el formulario se
  // quedó aquí porque la escritura es la misma, pero quien lo pinta es la
  // pantalla de la cuenta, y sin esta línea el nombre grande del encabezado
  // seguía siendo el viejo hasta recargar.
  revalidatePath('/');
  revalidatePath('/settings');
  revalidatePath('/profile');

  return { error: null, savedName: firstName };
}

/**
 * Guarda el tema elegido en la cookie compartida por las cinco zonas.
 *
 * No hay nada que validar contra el backend —el tema no vive en ningún
 * microservicio, es una preferencia de la interfaz— así que no hay `data` que
 * confirmar: escribir la cookie y que el layout la relea es la confirmación.
 *
 * `revalidatePath('/', 'layout')` y no solo `'/settings'`: el `data-theme`
 * lo estampa el `RootLayout`, que envuelve toda la zona, no la page. Sin el
 * segundo argumento, `revalidatePath` solo invalida ese segmento y el `<html>`
 * se queda con el tema viejo hasta la próxima navegación completa.
 */
export async function setThemeAction(theme: ThemeName): Promise<void> {
  /**
   * ⚠️ **Se valida aquí aunque `getTheme()` ya normalice al leer.**
   *
   * El parámetro de una Server Function llega del cliente, y `ThemeName` es un
   * tipo: desaparece al compilar y no filtra nada. Hoy no hay agujero porque
   * quien lee hace `=== 'light' ? 'light' : 'dark'`, así que cualquier basura
   * acaba en oscuro — pero eso deja la seguridad de este valor en manos de un
   * único lector. El día que alguien lo lea sin normalizar, el valor va directo
   * a `data-theme` del `<html>`.
   *
   * Guardar solo lo que conocemos cuesta una línea y no depende de nadie.
   */
  if (!esTemaValido(theme)) return;

  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE, theme, themeCookieOptions());
  revalidatePath('/', 'layout');
}

/**
 * Genera la frase semilla que se le dicta a Praxis Voice.
 *
 * `POST /api/alexa/link` **sin cuerpo**: el usuario sale del token, como en
 * todo lo que cuelga de `/me`. Mandar un `userId` aquí sería, además de un
 * campo de más —y uno de más ya da 400—, dejar que el cliente eligiera de quién
 * es la frase.
 *
 * ⚠️ **La frase solo existe en esta respuesta.** El backend guarda su hash, no
 * el texto, así que no hay ninguna ruta que la vuelva a devolver: si se pierde,
 * se genera otra. Por eso no se revalida ninguna ruta con la frase dentro ni se
 * escribe en caché — viaja al estado del formulario y ahí se queda.
 *
 * Generar una nueva **invalida la anterior sin canjear**, y eso lo hace el
 * propio backend en la misma llamada: nunca hay dos vivas a la vez.
 *
 * Se confirma contra el `data` y no contra el status, como en el resto: un 201
 * con la frase vacía sería una frase que nadie puede dictar.
 */
export async function generateSeedPhraseAction(
  _prevState: VoiceLinkState,
  _formData: FormData,
): Promise<VoiceLinkState> {
  const session = await getSession();
  if (!session) {
    return {
      error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
      phrase: null,
      expiresAt: null,
    };
  }

  let generated: VoiceSeedPhrase;
  try {
    generated = await createServerApiClient().post<VoiceSeedPhrase>('/alexa/link', {});
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message, phrase: null, expiresAt: null };
    }
    return {
      error: 'No se pudo generar la frase. Inténtalo de nuevo.',
      phrase: null,
      expiresAt: null,
    };
  }

  if (!generated?.phrase || !generated?.expiresAt) {
    return {
      error: 'El servidor respondió correctamente pero no devolvió ninguna frase.',
      phrase: null,
      expiresAt: null,
    };
  }

  return { error: null, phrase: generated.phrase, expiresAt: generated.expiresAt };
}

/**
 * Revoca una vinculación de voz concreta, o todas.
 *
 * Sin `linkId` va a `DELETE /alexa/links`, que las tumba todas. Con él, a
 * `DELETE /alexa/links/:id`. Las dos resuelven el usuario desde el token, así
 * que no se puede revocar la de otra persona pasando un id ajeno.
 *
 * Aquí **sí** se revalida: la lista de dispositivos la pinta el Server
 * Component de la pantalla, y sin esto seguiría enseñando el que se acaba de
 * echar.
 */
export async function revokeVoiceLinkAction(
  _prevState: VoiceLinkState,
  formData: FormData,
): Promise<VoiceLinkState> {
  const session = await getSession();
  if (!session) {
    return {
      error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
      phrase: null,
      expiresAt: null,
    };
  }

  const linkId = String(formData.get('linkId') ?? '').trim();

  try {
    await createServerApiClient().delete(linkId ? `/alexa/links/${linkId}` : '/alexa/links');
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message, phrase: null, expiresAt: null };
    }
    return {
      error: 'No se pudo revocar el acceso. Inténtalo de nuevo.',
      phrase: null,
      expiresAt: null,
    };
  }

  revalidatePath('/settings');
  revalidatePath('/');

  return { error: null, phrase: null, expiresAt: null };
}
