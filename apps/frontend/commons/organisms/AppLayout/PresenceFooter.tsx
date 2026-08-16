'use client';

import type { Presence } from '../../api/presence';
import { PresenceSwitcher } from '../../molecules/PresenceSwitcher';
import { useSidebarPlegada } from './AppShell';

export interface PresenceFooterProps {
  presencia: string | null | undefined;
  /**
   * Guarda la presencia. La pone cada zona con **su** server action: la
   * escritura va contra `PATCH /users/:id` por el proxy de esa zona, y una
   * acción de otra no se puede invocar desde aquí.
   */
  onCambiar: (presencia: Presence) => Promise<string | null>;
}

/**
 * El pie de la barra lateral: cambiar de estado, y nada más.
 *
 * ⚠️ **Aquí estaba «Cerrar sesión».** Era el único control destructivo de toda
 * la barra, pegado a la navegación, y se usa una vez al día como mucho; se fue
 * a la pantalla de cuenta, donde vive el resto de lo tuyo. Lo que queda es lo
 * que sí se toca varias veces al día — entras a una reunión, sales a comer— y
 * que mandado a otra pantalla costaría dos navegaciones cada vez.
 *
 * Existe como componente propio para leer el pliegue por contexto: plegada la
 * barra solo cabe el punto de color, y esa decisión no puede tomarla el
 * `layout.tsx` de cada zona, que se pinta en el servidor.
 */
export function PresenceFooter({ presencia, onCambiar }: PresenceFooterProps) {
  const plegada = useSidebarPlegada();
  return <PresenceSwitcher valor={presencia} onCambiar={onCambiar} plegada={plegada} />;
}
