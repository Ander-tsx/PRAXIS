import { cookies } from 'next/headers';
import { type Role, type User, MOCK_USERS } from './index';

/**
 * Obtiene el rol activo en el servidor leyendo cookies
 */
export async function getActiveRoleServer(): Promise<Role | null> {
  const user = await getActiveUserServer();
  return user ? user.role : null;
}

/**
 * Obtiene el usuario mock completo en el servidor
 */
export async function getActiveUserServer(): Promise<User | null> {
  try {
    const cookieStore = await cookies();

    // Buscar cookie de demo user
    const demoUser = cookieStore.get('praxis_demo_user')?.value;
    if (demoUser === 'logged_out') {
      return null;
    }
    if (demoUser && MOCK_USERS[demoUser]) {
      return MOCK_USERS[demoUser];
    }

    // Buscar cookie de sesión real
    const sessionToken = cookieStore.get('praxis_session')?.value;
    if (sessionToken) {
      return MOCK_USERS['usr-1'];
    }
  } catch {}

  // Por defecto en la demo académica
  return MOCK_USERS['usr-1'];
}

