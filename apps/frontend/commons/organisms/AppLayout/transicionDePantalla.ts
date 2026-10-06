'use client';

/**
 * Hacia dónde fue la última navegación, para animar la pantalla que entra
 * (D9 de `docs/PLAN-MOVIL.md`).
 *
 * ## Por qué no `experimental.viewTransition`
 *
 * Next 16 lo ofrece, pero es experimental y **global**: anima toda navegación
 * del App Router, también las de escritorio, que no pueden cambiar (I1). Esto
 * es CSS de entrada encerrado en `@media (max-width: 767px)` —ver
 * `.pantalla-entra-*` en `theme.css`—, así que en escritorio no anima nada.
 *
 * ## Cómo se sabe la dirección
 *
 * - **Atrás:** `popstate` (el botón del sistema, el gesto, `history.back()`).
 * - **Adelante:** un clic en un enlace interno. Lo que navega por código
 *   (`router.push`) no anima: casi siempre es una redirección tras guardar, y
 *   ahí un deslizamiento sobra.
 *
 * La primera pantalla que se monta después **consume** la dirección; la de
 * `loading.tsx` y la de verdad no la animan dos veces.
 */

type Direccion = 'adelante' | 'atras';

let pendiente: Direccion | null = null;
let instalado = false;

export function instalarDetectorDeNavegacion() {
  if (instalado || typeof window === 'undefined') return;
  instalado = true;
  window.addEventListener('popstate', () => {
    pendiente = 'atras';
  });
  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const enlace = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!enlace || enlace.target === '_blank' || enlace.hasAttribute('download')) return;
      const destino = new URL(enlace.href, window.location.href);
      if (destino.origin !== window.location.origin) return;
      /* Cambiar solo la consulta (`?board=`) no es otra pantalla. */
      if (destino.pathname === window.location.pathname) return;
      pendiente = 'adelante';
    },
    true,
  );
}

/** La dirección de la navegación que acaba de ocurrir, una sola vez. */
export function consumirTransicion(): Direccion | null {
  const d = pendiente;
  pendiente = null;
  return d;
}

/** La clase de entrada para esa dirección (vacía si no hay que animar). */
export function claseDeEntrada(direccion: Direccion | null): string {
  if (direccion === 'adelante') return 'pantalla-entra-adelante';
  if (direccion === 'atras') return 'pantalla-entra-atras';
  return '';
}
