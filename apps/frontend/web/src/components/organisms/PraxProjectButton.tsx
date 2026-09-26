'use client';

import { PraxSidebarIcon, usePrax } from '@praxis/commons';

/**
 * El acceso a PRAX **dentro de un proyecto**: a la izquierda del botón de
 * Chat, con el mismo trato de píldora.
 *
 * Sustituye al lanzador flotante global (`PraxLauncher`, retirado): tapaba el
 * tablero más de lo que ayudaba, y cada pantalla tiene ahora su propia forma
 * de llamar a PRAX, integrada en sus utilidades. Esta es la del proyecto.
 */
export function PraxProjectButton() {
  const prax = usePrax();
  if (!prax) return null;

  return (
    <button
      type="button"
      onClick={() => {
        /* Sin panel que valga en un móvil estrecho: se va directo a la
           pantalla completa, igual que hacía el lanzador que sustituye. */
        if (window.innerWidth < 768) {
          window.location.assign('/assistant');
          return;
        }
        prax.alternar();
      }}
      aria-pressed={prax.abierto}
      title="PRAX"
      className="flex items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3.5 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
    >
      <PraxSidebarIcon className="h-4 w-4" />
      PRAX
    </button>
  );
}
