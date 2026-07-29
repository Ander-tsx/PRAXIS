'use client';

import { useState } from 'react';

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
      className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border font-sans text-xs font-semibold text-error transition-colors hover:bg-error-muted disabled:cursor-not-allowed disabled:opacity-50"
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
      {pending ? 'Saliendo...' : 'Cerrar sesión'}
    </button>
  );
}
