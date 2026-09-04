'use server';

import { ApiError, type Presence, type UserProfile } from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { revalidatePath } from 'next/cache';

/**
 * Acciones de **tu cuenta**: presencia, foto y borrado.
 *
 * Viven aquí y no en `settings/actions.ts` porque la pantalla es otra: en
 * Configuración quedan los ajustes que se consultan —apariencia, facturación,
 * Alexa— y aquí lo que eres tú. La de nombre y apellidos sigue en Configuración
 * y la reutiliza esta pantalla: es la misma escritura y no tiene sentido
 * duplicarla.
 *
 * ⚠️ **El `:id` sale siempre de la sesión, nunca de un formulario.** Las rutas
 * llevan `:id` y un `AccountOwnerGuard` detrás, así que mandar otro daría 403;
 * pero la regla es no darle al cliente ni la ocasión de proponerlo.
 */

/** El id de quien pide, o `null` si la sesión ya no vale. */
async function idDeLaSesion(): Promise<string | null> {
  const session = await getSession();
  return session?.userId ?? null;
}

function describir(error: unknown, porDefecto: string): string {
  if (error instanceof ApiError) {
    if (error.status >= 500) return porDefecto;
    if (error.message.includes('File too large'))
      return 'El archivo es demasiado grande (máximo 5MB).';
    if (error.message.includes('Validation failed')) return 'Error de validación en los datos.';
    if (error.message.includes('Expected')) return 'El formato del archivo no es válido.';
    return error.message;
  }
  return porDefecto;
}

/**
 * Cambia tu presencia.
 *
 * Devuelve el valor **confirmado por el servidor**, que es lo que pinta el
 * conmutador: si el guardado falla, el punto vuelve a decir la verdad en vez
 * de la intención.
 */
export async function setPresenceAction(presence: Presence): Promise<string | null> {
  const userId = await idDeLaSesion();
  if (!userId) return null;

  try {
    const actualizado = await createServerApiClient().patch<UserProfile>(`/users/${userId}`, {
      presence,
    });
    /* Se confirma contra el `data` y no contra el status, como en todo el
       repositorio: un 200 sin cuerpo ya nos ha mentido antes (CLAUDE.md). */
    if (!actualizado?.id) return null;

    /* El armazón —barra lateral incluida— se pinta en el layout, así que es lo
       que hay que revalidar para que el punto cambie en todas las pantallas. */
    revalidatePath('/main', 'layout');
    return actualizado.presence ?? presence;
  } catch {
    return null;
  }
}

/**
 * Sube tu foto de perfil.
 *
 * ⚠️ El archivo va por `FormData` a un endpoint `multipart`, no en JSON: en
 * base64 dentro de un cuerpo JSON crecería un tercio y habría que subir otra
 * vez el tope de las Server Actions.
 */
export async function uploadAvatarAction(
  formData: FormData,
): Promise<{ error: string | null; avatarUrl: string | null }> {
  const userId = await idDeLaSesion();
  if (!userId) return { error: 'Tu sesión ha caducado.', avatarUrl: null };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'No llegó ninguna imagen.', avatarUrl: null };
  }

  const envio = new FormData();
  envio.append('file', file);

  try {
    const actualizado = await createServerApiClient().postForm<UserProfile>(
      `/users/${userId}/avatar`,
      envio,
    );
    if (!actualizado?.id) return { error: 'El servidor no guardó la foto.', avatarUrl: null };

    revalidatePath('/main', 'layout');
    return { error: null, avatarUrl: actualizado.avatarUrl };
  } catch (error) {
    return { error: describir(error, 'No se pudo subir la foto.'), avatarUrl: null };
  }
}

/** Quita tu foto y vuelve a las iniciales. */
export async function deleteAvatarAction(): Promise<{ error: string | null }> {
  const userId = await idDeLaSesion();
  if (!userId) return { error: 'Tu sesión ha caducado.' };

  try {
    await createServerApiClient().delete(`/users/${userId}/avatar`);
    revalidatePath('/main', 'layout');
    return { error: null };
  } catch (error) {
    return { error: describir(error, 'No se pudo quitar la foto.') };
  }
}

/**
 * Borra tu cuenta **y cierra la sesión**.
 *
 * ⚠️ **No se deshace, y el backend no pide confirmación.** `DELETE /users/:id`
 * solo mira que seas su dueño, así que la única defensa está aquí: hay que
 * escribir el correo exacto de la cuenta. Es la misma idea que el borrado de un
 * proyecto, y por el mismo motivo — lo que no tiene vuelta atrás no puede
 * borrarse con un clic de más.
 *
 * ⚠️ **Aquí no se limpian las cookies.** Quien cierra sesión de verdad es
 * `/auth/api/logout`, en la zona de autenticación: borra el refresh de Redis
 * además de las cookies, y es el mismo camino que usa el botón de siempre.
 * Este action solo borra la cuenta; el componente llama a esa ruta después.
 */
export async function deleteAccountAction(confirmacion: string): Promise<{ error: string | null }> {
  const session = await getSession();
  if (!session) return { error: 'Tu sesión ha caducado.' };

  const api = createServerApiClient();

  /* El correo se lee **del servidor**, no del formulario: comparar lo escrito
     con otro campo del propio formulario no comprobaría nada. */
  const perfil = await api.get<UserProfile>(`/users/${session.userId}`).catch(() => null);
  if (!perfil) return { error: 'No se pudo comprobar la cuenta. Inténtalo de nuevo.' };

  if (confirmacion.trim().toLowerCase() !== perfil.credential.email.toLowerCase()) {
    return { error: 'El correo no coincide con el de esta cuenta.' };
  }

  try {
    await api.delete(`/users/${session.userId}`);
  } catch (error) {
    return { error: describir(error, 'No se pudo eliminar la cuenta.') };
  }

  return { error: null };
}

export async function uploadCoverAction(
  formData: FormData,
): Promise<{ error: string | null; coverUrl: string | null }> {
  const userId = await idDeLaSesion();
  if (!userId) return { error: 'Tu sesión ha caducado.', coverUrl: null };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'No llegó ninguna imagen.', coverUrl: null };
  }

  const envio = new FormData();
  envio.append('file', file);

  try {
    const actualizado = await createServerApiClient().postForm<UserProfile>(
      `/users/${userId}/cover`,
      envio,
    );
    if (!actualizado?.id) return { error: 'El servidor no guardó la foto.', coverUrl: null };

    revalidatePath('/main', 'layout');
    return { error: null, coverUrl: actualizado.coverUrl };
  } catch (error) {
    return { error: describir(error, 'No se pudo subir la foto de portada.'), coverUrl: null };
  }
}

export async function deleteCoverAction(): Promise<{ error: string | null }> {
  const userId = await idDeLaSesion();
  if (!userId) return { error: 'Tu sesión ha caducado.' };

  try {
    await createServerApiClient().delete(`/users/${userId}/cover`);
    revalidatePath('/main', 'layout');
    return { error: null };
  } catch (error) {
    return { error: describir(error, 'No se pudo quitar la foto de portada.') };
  }
}

export async function updateProfileAction(data: {
  firstName?: string;
  lastName?: string;
  biography?: string;
  location?: string;
  professionalInfo?: any;
}): Promise<{ error: string | null }> {
  const userId = await idDeLaSesion();
  if (!userId) return { error: 'Tu sesión ha caducado.' };

  try {
    await createServerApiClient().patch(`/users/${userId}`, data);
    revalidatePath('/main', 'layout');
    return { error: null };
  } catch (error) {
    return { error: describir(error, 'No se pudo actualizar el perfil.') };
  }
}
