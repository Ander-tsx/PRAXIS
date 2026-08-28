'use client';

import type { ReactNode } from 'react';
import { useAppShell, useSidebarPlegada } from './AppShell';

export interface AppHeaderProps {
  anchoCompleto?: boolean;
  /** Título de la pantalla. */
  title: string;
  /**
   * La pantalla ocupa el alto disponible y **no desplaza**.
   *
   * Por defecto el contenido crece y `<main>` lo desplaza, que es lo correcto
   * para una página de documento: un panel, un informe, una lista. Con `lleno`,
   * el contenedor se queda del alto exacto de la ventana y quien desplaza es lo
   * que haya dentro.
   *
   * ⚠️ **Lo pide una pantalla que es un chat**, donde la cabecera y el
   * compositor tienen que quedarse quietos y solo los mensajes se mueven. Sin
   * esto había que adivinar el alto con `100dvh` menos la barra menos el
   * relleno — un cálculo que se rompe en cuanto cualquiera de los tres cambia.
   */
  lleno?: boolean;
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
export function AppHeader({ title, headerSlot, lleno = false, anchoCompleto = false, children }: AppHeaderProps) {
  const { openMenu, cuentaSlot } = useAppShell();
  /* El ancho máximo compensa el pliegue: sin esto, plegar la barra lateral
     libera ~184px que esta columna nunca reclama —se queda en el margen
     lateral en vez de dárselos al contenido— y en una pantalla ancha, plegar
     no cambia nada de lo que se ve. */
  const plegada = useSidebarPlegada();

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-[#080807] px-4 sm:px-6">
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

        {/**
         * La derecha lleva dos cosas, y en este orden.
         *
         * Primero la acción de la pantalla —lo que se viene a hacer aquí— y
         * después quién eres, pegado al borde: el rol y el plan se consultan de
         * reojo y su sitio es la esquina, no delante del botón principal.
         *
         * `cuentaSlot` lo pone el armazón, así que sale en **todas** las
         * pantallas de la zona sin que cada página tenga que acordarse.
         */}
        {(headerSlot || cuentaSlot) && (
          <div className="flex shrink-0 items-center gap-3">
            {headerSlot}
            {cuentaSlot}
          </div>
        )}
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
      <main
        className={`relative flex-1 bg-background motion-safe:scroll-smooth ${
          /* `overflow-hidden` y no `auto`: con `lleno`, el que desplaza es un
             hijo, y dejar aquí un scroll de reserva produce dos barras
             anidadas —una que no se mueve nunca— en cuanto el hijo mide justo. */
          lleno ? 'min-h-0 overflow-hidden' : 'overflow-y-auto'
        }`}
      >
        <div
          className={`mx-auto w-full ${anchoCompleto ? 'p-0 max-w-full' : `p-4 sm:p-6 ${plegada ? 'max-w-[1584px]' : 'max-w-[1400px]'}`} ${
            lleno ? 'flex h-full min-h-0 flex-col' : ''
          }`}
        >
          {children}
        </div>
      </main>
    </>
  );
}
