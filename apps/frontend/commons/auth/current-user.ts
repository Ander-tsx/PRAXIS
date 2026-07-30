import type { GlobalRole, UserProfile } from '../api/domain';
import { createServerApiClient } from './server-client';
import { requireSession } from './session';

export interface CurrentUser {
  userId: string;
  profile: UserProfile;
  /** Nombres de los roles globales. Vacío si no se pudieron leer. */
  roles: string[];
}

/**
 * Usuario identificado, tal como lo necesita el área privada.
 *
 * El perfil sale de **`GET /users/me`**, que resuelve el usuario desde el token.
 * Antes había que sacar el `sub` de la sesión y pedir `/users/:id`, lo que
 * obligaba a cada zona a saber leer un JWT que —por diseño— vive en una cookie
 * httpOnly (PENDIENTES-BACKEND §5, cerrado).
 *
 * `requireSession()` se conserva: decide si hay que redirigir al login **antes**
 * de tocar la red, y de ahí sale el `userId` que las páginas usan para comparar
 * con `ownerId`, autores de comentarios y encargados.
 *
 * Las dos peticiones van en paralelo, y los roles degradan a lista vacía si
 * fallan: no poder pintar una insignia no es motivo para tumbar el panel entero.
 */
export async function loadCurrentUser(): Promise<CurrentUser> {
  const session = await requireSession();
  const api = createServerApiClient();

  const [profile, roles] = await Promise.all([
    api.get<UserProfile>('/users/me'),
    api
      .get<GlobalRole[]>(`/permissions/user/${session.userId}`)
      .then((list) => list.map((role) => role.name))
      .catch(() => [] as string[]),
  ]);

  return { userId: session.userId, profile, roles };
}
