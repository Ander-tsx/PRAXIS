import { AppHeader } from '@praxis/commons';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mensajes directos',
};

/**
 * El armazón del chat.
 *
 * Alojaba el `ChatDirectory` (la columna izquierda); esa navegación se mudó a la
 * barra lateral del armazón (`AppShell`), así que aquí solo queda la cabecera y
 * el contenedor de la conversación.
 *
 * ## ⚠️ `lleno` en vez de calcular el alto a mano
 *
 * Estaba escrito como `h-[calc(100vh-7rem)]`, y las dos mitades estaban mal:
 *
 * - **`100vh` en un móvil** mide la ventana con la barra de direcciones
 *   retraída, o sea más de lo que se ve. El compositor caía por debajo del borde
 *   y, con el `overflow-hidden` del armazón, no había forma de desplazarse hasta
 *   él.
 * - **`-7rem`** era la cabecera más el relleno, adivinados. `AppHeader` lleva su
 *   aviso escrito sobre esto: «un cálculo que se rompe en cuanto cualquiera de
 *   los tres cambia».
 *
 * `lleno` existe justo para esto: deja el contenedor del alto exacto disponible
 * y hace que desplace lo de dentro —los mensajes— y no la página.
 */
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppHeader title="Mensajes directos" lleno>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </AppHeader>
  );
}
