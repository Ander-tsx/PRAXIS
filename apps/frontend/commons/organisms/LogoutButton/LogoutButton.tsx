'use client';

import { useState } from 'react';
import { useSidebarPlegada } from '../AppLayout/AppShell';

/**
 * Cerrar sesión.
 *
 * El endpoint que borra la sesión en Redis y limpia las cookies vive en
 * auth-front (`/auth/api/logout`), así que se llama por ruta absoluta: es otra
 * zona del multi-zone.
 *
 * Después, navegación dura a `/`. `router.push` no vale aquí — y además
 * queremos que el shell se recargue de cero, sin nada del usuario anterior en
 * memoria.
 */
export function LogoutButton() {
  const [pending, setPending] = useState(false);
  /**
   * Plegada, solo el icono.
   *
   * El icono **no encoge**: sigue a 16 px, igual que en los enlaces de arriba,
   * porque lo que se quita es la palabra, no la superficie sobre la que se
   * pulsa. Un objetivo de clic más pequeño en el único botón que te saca de la
   * aplicación sería el cambio contrario al que se pide.
   *
   * El nombre accesible se conserva entero en `aria-label`: para un lector de
   * pantalla no cambia nada, solo deja de estar escrito.
   */
  const plegada = useSidebarPlegada();

  async function handleLogout() {
    setPending(true);
    try {
      await fetch('/auth/api/logout', { method: 'POST' });
    } catch {
      // Aunque falle, salimos igual: las cookies caducan solas y dejar al
      // usuario encerrado en el panel sería peor.
    }
    window.location.assign('/');
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      aria-label={pending ? 'Saliendo' : 'Cerrar sesión'}
      title={plegada ? 'Cerrar sesión' : undefined}
      className={`flex h-9 w-full cursor-pointer items-center justify-center rounded-lg border border-border font-sans text-xs font-semibold text-error transition-colors hover:bg-error-muted disabled:cursor-not-allowed disabled:opacity-50 ${
        plegada ? '' : 'gap-2'
      }`}
    >
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.75}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
        />
      </svg>
      {!plegada && (pending ? 'Saliendo...' : 'Cerrar sesión')}
    </button>
  );
}
