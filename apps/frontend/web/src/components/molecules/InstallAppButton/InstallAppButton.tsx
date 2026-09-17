'use client';

import { DownloadIcon } from '@/components/icons';
import { RollCta } from '@/components/molecules/RollCta';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

export interface InstallAppButtonProps {
  /** El mismo `size` que el CTA de al lado — por eso existe este componente
      y no un botón suelto: sin el prop, quien lo usa tendría que acordarse
      de repetirlo a mano en cada sitio. */
  size?: 'sm' | 'lg';
  className?: string;
}

/**
 * El botón «Instalar app» de la landing.
 *
 * ## Por qué es un `RollCta` y no un botón aparte
 *
 * La primera versión tenía su propio marcado, a ojo parecido al CTA de al
 * lado pero no idéntico: otro `padding`, sin la cápsula del icono, sin la
 * animación de rodillo. Se leía como un botón de otra pantalla que se coló
 * aquí. `RollCta` ahora acepta `onClick` además de `href` (los dos nunca
 * juntos — ver su tipo) exactamente para esto: reutilizar el mismo marcado,
 * el mismo tamaño y la misma cadencia en vez de perseguir a mano un parecido
 * que se desincroniza en el primer retoque de cualquiera de los dos.
 *
 * ## Por qué puede no renderizar nada
 *
 * `puedeInstalar` es falso en dos casos bien distintos y el componente los
 * trata igual a propósito: el navegador no soporta instalación (Safari,
 * Firefox) o ya está instalada. Ninguno de los dos es un error — son el
 * estado normal de la mayoría de visitas—, así que no hay hueco vacío ni
 * mensaje de reserva: el botón existe solo cuando pulsarlo hace algo.
 */
export function InstallAppButton({ size = 'lg', className }: InstallAppButtonProps) {
  const { puedeInstalar, instalar } = useInstallPrompt();

  if (!puedeInstalar) return null;

  return (
    <RollCta
      onClick={instalar}
      label="Instalar app"
      icon={DownloadIcon}
      variant="ghost"
      size={size}
      className={className}
    />
  );
}
