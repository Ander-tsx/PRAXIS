import { AppHeader } from '@praxis/commons';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mensajes directos',
};

/**
 * El armazón del chat privado.
 *
 * Antes alojaba el ChatDirectory (lista izquierda), pero esa navegación
 * ahora se ha movido globalmente al Sidebar (AppShell). Aquí queda únicamente
 * la cabecera y el contenedor del chat en sí.
 */
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppHeader title="Mensajes directos">
      <div className="flex h-[calc(100vh-7rem)] flex-col gap-5 sm:flex-row">
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </AppHeader>
  );
}
