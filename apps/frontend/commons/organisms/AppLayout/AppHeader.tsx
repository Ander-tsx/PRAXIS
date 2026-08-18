'use client';

import type { ReactNode } from 'react';
import { useAppShell, useSidebarPlegada } from './AppShell';

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
  /* El ancho máximo compensa el pliegue: sin esto, plegar la barra lateral
     libera ~184px que esta columna nunca reclama —se queda en el margen
     lateral en vez de dárselos al contenido— y en una pantalla ancha, plegar
     no cambia nada de lo que se ve. */
  const plegada = useSidebarPlegada();

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

      {/**
       * ⚠️ **El scroll suave va aquí y no en `html`.**
       *
       * `theme.css` declara `scroll-behavior: smooth` sobre `html`, y no servía
       * de nada para las anclas de una pantalla: quien desplaza **es este
       * `<main>`**, porque lleva el `overflow-y-auto`. Un `#ancla` dentro de él
       * lo resuelve el contenedor, no el documento, así que el salto era seco
       * por mucho que el documento dijera lo contrario.
       *
       * `motion-safe:` porque un desplazamiento animado es justo lo que molesta
       * a quien pide menos movimiento — y ahí el salto instantáneo es correcto,
       * no un defecto.
       */}
      <main className="relative flex-1 overflow-y-auto bg-background motion-safe:scroll-smooth">
        <div
          className={`mx-auto w-full p-4 sm:p-6 ${plegada ? 'max-w-[1584px]' : 'max-w-[1400px]'}`}
        >
          {children}
        </div>
      </main>
    </>
  );
}
