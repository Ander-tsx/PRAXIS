'use client';

import type { ReactNode } from 'react';
import { useAppShell } from './AppShell';

export interface AppHeaderProps {
  /** Título de la pantalla. */
  title: string;
  /** Zona derecha: la acción principal de la pantalla, si la tiene. */
  headerSlot?: ReactNode;
  children: ReactNode;
}

/**
 * Cabecera y contenido de una pantalla del área privada.
 *
 * Va **dentro de cada page**, al revés que `AppShell`, y a propósito: el título
 * y la acción de la derecha son lo único de esta zona de la pantalla que cambia
 * al navegar. Dejándolos aquí, el `loading.tsx` cubre exactamente lo que está
 * cargando y ni la barra lateral ni los datos de quien ha entrado parpadean.
 *
 * El botón del menú móvil vive aquí porque visualmente está en la cabecera, pero
 * lo que abre es el cajón de `AppShell`: por eso pide la función por contexto en
 * vez de recibirla por props a través de media aplicación.
 */
export function AppHeader({ title, headerSlot, children }: AppHeaderProps) {
  const { openMenu } = useAppShell();

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={openMenu}
            aria-label="Abrir menú"
            className="rounded-md p-1 text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <h1 className="truncate font-display text-lg text-text-primary">{title}</h1>
        </div>

        {headerSlot && <div className="flex shrink-0 items-center gap-3">{headerSlot}</div>}
      </header>

      <main className="relative flex-1 overflow-y-auto bg-background">
        <div className="mx-auto w-full max-w-[1400px] p-4 sm:p-6">{children}</div>
      </main>
    </>
  );
}
