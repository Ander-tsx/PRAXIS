'use client';

import { useEffect } from 'react';

/**
 * La raíz de dashboard-front ya no tiene pantalla propia: los proyectos —lo que
 * antes vivía aquí— tienen su zona (`/projects`), y lo que queda bajo
 * `/dashboard/*` es la cuenta (organizaciones, facturación, roles, ajustes).
 *
 * ⚠️ **No se puede usar `redirect('/projects')` del servidor.** Esta zona tiene
 * `basePath: '/dashboard'`, y `redirect()` se lo antepone: la respuesta sería
 * `Location: /dashboard/projects`, que es un 404. Cruzar de zona hay que hacerlo
 * desde el navegador, que sí ve la URL real del shell.
 */
export default function DashboardRoot() {
  useEffect(() => {
    window.location.replace('/projects');
  }, []);

  return null;
}
