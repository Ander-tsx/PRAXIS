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
export interface LogoutButtonProps {
  /**
   * Fuerza la forma del botón en vez de deducirla del pliegue de la barra.
   *
   * ⚠️ **Fuera de la barra lateral hay que pasarlo.** El botón se pinta también
   * en la pantalla de tu cuenta, y ahí el pliegue de la barra no significa
   * nada: con la barra plegada, el botón de aquella tarjeta se quedaba en un
   * icono suelto sin la palabra «Cerrar sesión», por un estado de otra parte de
   * la pantalla.
   */
  compacto?: boolean;
}

export function LogoutButton({ compacto }: LogoutButtonProps = {}) {
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
  const plegadaLaBarra = useSidebarPlegada();
  const plegada = compacto ?? plegadaLaBarra;

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
      /* `px-4`: sin relleno horizontal, fuera de la barra lateral —donde el
         `w-full` lo estiraba— el botón se encogía al ancho de su texto y el
         icono quedaba pegado a la letra. Con el relleno se ve igual en los dos
         sitios. */
      className="w-fit cursor-pointer rounded-lg border px-3 py-2 font-sans text-sm transition-colors border border-red-300 text-red-600 hover:bg-red-50"
    >
      {!plegada && (pending ? 'Saliendo...' : 'Cerrar sesión')}
    </button>
  );
}
