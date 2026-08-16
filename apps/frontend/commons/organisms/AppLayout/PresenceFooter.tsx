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
 * El selector de estado de la barra lateral: **la propia esfera del avatar**.
 *
 * ⚠️ Aquí hubo primero «Cerrar sesión» —que se fue a la pantalla de cuenta— y
 * luego una fila con el nombre del estado. La fila sobraba: el punto de color
 * del avatar ya dice cuál es tu estado y es donde se intenta pulsar, así que
 * repetirlo debajo con su etiqueta gastaba una línea de la barra para no decir
 * nada nuevo. Ahora el punto **es** el botón.
 *
 * Se queda como componente propio porque `AppShell` lo coloca sobre el avatar
 * y quien tiene la acción de guardar es la zona: este es el puente entre las
 * dos, y es de cliente porque el menú tiene estado.
 */
export function PresenceFooter({ presencia, onCambiar }: PresenceFooterProps) {
  /* Plegada la barra, el menú sale en su forma compacta: ver `PresenceSwitcher`.
     El pliegue se lee por contexto porque lo decide el armazón, no la zona. */
  const plegada = useSidebarPlegada();
  return <PresenceSwitcher valor={presencia} onCambiar={onCambiar} compacto={plegada} />;
}
