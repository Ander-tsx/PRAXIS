import { createServerApiClient, requireSession } from '@praxis/commons/auth';
import type { GlobalRole, UserProfile } from './domain';

export interface CurrentUser {
  userId: string;
  profile: UserProfile;
  /** Nombres de los roles globales. Vacío si no se pudieron leer. */
  roles: string[];
}

/**
 * Usuario identificado, tal como lo necesita el área privada.
 *
 * Hacen falta dos peticiones porque **no existe `GET /users/me`**: el JWT solo
 * lleva `{ sub, iat, exp }`, así que sacamos el id de la sesión y pedimos el
 * perfil aparte. Ver PENDIENTES-BACKEND.md §5.
 *
 * Las dos van en paralelo, y los roles degradan a lista vacía si fallan: no
 * poder pintar una insignia no es motivo para tumbar el panel entero.
 */
export async function loadCurrentUser(): Promise<CurrentUser> {
  const session = await requireSession();
  const api = createServerApiClient();

  const [profile, roles] = await Promise.all([
    api.get<UserProfile>(`/users/${session.userId}`),
    api
      .get<GlobalRole[]>(`/permissions/user/${session.userId}`)
      .then((list) => list.map((role) => role.name))
      .catch(() => [] as string[]),
  ]);

  return { userId: session.userId, profile, roles };
}
