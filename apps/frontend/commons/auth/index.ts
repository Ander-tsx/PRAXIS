// Praxis Common Auth Utilities

export type Role = 'admin' | 'user';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  privileges: string[];
}

export const MOCK_USERS: Record<string, User> = {
  'usr-1': {
    id: 'usr-1',
    name: 'Alejandro Admin',
    email: 'admin@praxis.com',
    role: 'admin',
    privileges: [
      'admin:acceder',
      'proyecto:crear',
      'proyecto:ver',
      'tarea:crear',
      'tarea:ver',
      'tarea:mover',
      'reporte:ver',
      'reporte:exportar',
    ],
  },
  'usr-2': {
    id: 'usr-2',
    name: 'Patricia Manager',
    email: 'pm@praxis.com',
    role: 'user',
    privileges: [
      'proyecto:crear',
      'proyecto:ver',
      'tarea:crear',
      'tarea:ver',
      'tarea:mover',
      'reporte:ver',
      'reporte:exportar',
    ],
  },
  'usr-3': {
    id: 'usr-3',
    name: 'Carlos Colaborador',
    email: 'colab@praxis.com',
    role: 'user',
    privileges: ['proyecto:ver', 'tarea:ver', 'tarea:mover'],
  },
  'usr-5': {
    id: 'usr-5',
    name: 'Sofía Desarrolladora',
    email: 'sofia@praxis.com',
    role: 'user',
    privileges: ['proyecto:ver', 'tarea:ver'],
  },
};

export const ROLE_PRIVILEGES: Record<Role, string[]> = {
  admin: [
    'admin:acceder',
    'proyecto:crear',
    'proyecto:ver',
    'tarea:crear',
    'tarea:ver',
    'tarea:mover',
    'reporte:ver',
    'reporte:exportar',
  ],
  user: ['proyecto:crear', 'proyecto:ver', 'tarea:ver'],
};

/**
 * Valida si un rol tiene cierto privilegio a nivel de sistema
 */
export function hasPrivilege(role: Role | string, privilege: string): boolean {
  const normRole = role as Role;
  const privileges = ROLE_PRIVILEGES[normRole] || [];
  return privileges.includes(privilege);
}

/**
 * Obtiene el rol activo en el cliente leyendo cookies
 */
export function getActiveRoleClient(): Role | null {
  const user = getActiveUserClient();
  return user ? user.role : null;
}

/**
 * Obtiene el usuario mock completo en el cliente
 */
export function getActiveUserClient(): User | null {
  if (typeof window === 'undefined') return MOCK_USERS['usr-1'];

  // Buscar cookie de demo user
  const demoMatch = document.cookie.match(/(?:^|; )praxis_demo_user=([^;]*)/);
  if (demoMatch) {
    const val = decodeURIComponent(demoMatch[1]);
    if (val === 'logged_out') return null;
    if (MOCK_USERS[val]) return MOCK_USERS[val];
  }

  // Buscar cookie de sesión real
  const sessionMatch = document.cookie.match(/(?:^|; )praxis_session=([^;]*)/);
  if (sessionMatch) {
    return MOCK_USERS['usr-1'];
  }

  // Por defecto en la demo académica
  return MOCK_USERS['usr-1'];
}

/**
 * Helper para setear el usuario de demo en el cliente
 */
export function setDemoUserClient(userId: string | 'logged_out'): void {
  if (typeof window === 'undefined') return;
  document.cookie = `praxis_demo_user=${userId}; path=/; max-age=${60 * 60 * 24 * 7}`; // 1 semana
}

export { AuthGuard } from './AuthGuard';
