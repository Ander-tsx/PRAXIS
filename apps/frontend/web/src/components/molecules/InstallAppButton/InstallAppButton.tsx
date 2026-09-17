'use client';

import { DownloadIcon } from '@/components/icons';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { l, lRadius } from '@/lib/landingColors';

export interface InstallAppButtonProps {
  className?: string;
}

/**
 * El botón «Instalar app» de la landing.
 *
 * ## No es un `RollCta`
 *
 * `RollCta` es siempre un `<a href>`: navega. Instalar no navega a ningún
 * sitio — dispara el `prompt()` que ya capturó `useInstallPrompt` — así que
 * necesita un `<button>` con `onClick`, no un enlace con `href="#"` fingiendo
 * serlo.
 *
 * ## Por qué puede no renderizar nada
 *
 * `puedeInstalar` es falso en dos casos bien distintos y el componente los
 * trata igual a propósito: el navegador no soporta instalación (Safari,
 * Firefox) o ya está instalada. Ninguno de los dos es un error — son el
 * estado normal de la mayoría de visitas—, así que no hay hueco vacío ni
 * mensaje de reserva: el botón existe solo cuando pulsarlo hace algo.
 */
export function InstallAppButton({ className = '' }: InstallAppButtonProps) {
  const { puedeInstalar, instalar } = useInstallPrompt();

  if (!puedeInstalar) return null;

  return (
    <button
      type="button"
      onClick={instalar}
      className={`flex items-center gap-2 py-[0.3em] pr-5 pl-4 text-sm font-medium transition-transform duration-300 ease-[var(--ease-transition)] hover:-translate-y-px ${className}`}
      style={{
        background: 'transparent',
        color: l.fg,
        border: `1px solid ${l.border}`,
        borderRadius: lRadius,
      }}
    >
      <DownloadIcon className="h-4 w-4" />
      Instalar app
    </button>
  );
}
