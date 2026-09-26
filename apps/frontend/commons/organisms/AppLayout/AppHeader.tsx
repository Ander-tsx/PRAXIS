'use client';

import type { ReactNode } from 'react';
import { useAppShell, useSidebarPlegada } from './AppShell';

export interface AppHeaderProps {
  anchoCompleto?: boolean;
  /**
   * Cómo se llama la pantalla.
   *
   * ⚠️ **Ya no se pinta**, y el nombre del componente se ha quedado grande: no
   * hay cabecera. Se conserva porque sigue siendo útil para quien no ve la
   * pantalla — va como `aria-label` de `<main>`, que es lo que hace que un
   * lector de pantalla pueda saltar a la región y decir a qué región salta.
   *
   * No se retira la prop: la pasan las veinte y pico pantallas del área privada
   * y quitarla sería un renombrado global a cambio de nada.
   */
  title: string;
  /**
   * La pantalla ocupa el alto disponible y **no desplaza**.
   *
   * Por defecto el contenido crece y `<main>` lo desplaza, que es lo correcto
   * para una página de documento: un panel, un informe, una lista. Con `lleno`,
   * el contenedor se queda del alto exacto de la ventana y quien desplaza es lo
   * que haya dentro.
   *
   * ⚠️ **Lo pide una pantalla que es un chat**, donde el compositor tiene que
   * quedarse quieto y solo los mensajes se mueven. Sin esto había que adivinar
   * el alto con `100dvh` menos la barra menos el relleno — un cálculo que se
   * rompe en cuanto cualquiera de los tres cambia.
   */
  lleno?: boolean;
  /**
   * Zona derecha de la antigua cabecera.
   *
   * ⚠️ **No lo usa ninguna pantalla**, y se comprobó antes de retirar la barra:
   * las acciones principales viven dentro del contenido (el «Nuevo proyecto» de
   * la rejilla, por ejemplo). Se conserva la prop y **no** se pinta: si alguna
   * pantalla vuelve a necesitar una acción fija, hay que decidir dónde va ahora
   * que no hay franja superior, no colarla aquí sin sitio.
   */
  headerSlot?: ReactNode;
  children: ReactNode;
}

/**
 * El contenido de una pantalla del área privada.
 *
 * ## 🕳️ Aquí había una cabecera, y se retiró entera
 *
 * Era una franja de `h-16` con el título de la pantalla —«Proyectos», «Mensajes
 * directos»—, el botón del menú móvil y el lanzador de PRAX. El título repetía
 * lo que ya dicen la entrada marcada en la barra lateral y el propio contenido,
 * y se llevaba cuatro rem de alto en **todas** las pantallas y en todos los
 * tamaños. En un teléfono eso es una fila entera de tablero.
 *
 * Lo que había dentro y sí hacía falta se ha reubicado:
 *
 * - **El botón del menú** pasa a flotar arriba a la izquierda, solo en móvil.
 *   ⚠️ No se podía simplemente borrar: es la **única** forma de abrir el cajón
 *   en un teléfono, y sin él no se llega ni a los proyectos ni a los chats. Es
 *   el mismo agujero que ya se arregló una vez.
 * - **PRAX** ya no vive aquí. El lanzador flotante tapaba el tablero más de
 *   lo que ayudaba; cada pantalla llama a PRAX con su propio botón integrado
 *   (`PraxProjectButton` en un proyecto, por ejemplo), y quien no tenga uno
 *   todavía sigue llegando por la entrada de la barra lateral.
 *
 * ## El título sigue existiendo, pero solo para quien no ve
 *
 * `aria-label` en `<main>`. Un `<main>` sin nombre obliga a un lector de
 * pantalla a leer contenido hasta deducir dónde está; con nombre, la región se
 * anuncia. Es gratis y no ocupa un píxel.
 *
 * Va **dentro de cada page**, al revés que `AppShell`, y a propósito: así el
 * `loading.tsx` cubre exactamente lo que está cargando y ni la barra lateral ni
 * los datos de quien ha entrado parpadean.
 */
export function AppHeader({
  title,
  lleno = false,
  anchoCompleto = false,
  children,
}: AppHeaderProps) {
  const { openMenu } = useAppShell();
  /* El ancho máximo compensa el pliegue: sin esto, plegar la barra lateral
     libera ~184px que esta columna nunca reclama —se queda en el margen
     lateral en vez de dárselos al contenido— y en una pantalla ancha, plegar
     no cambia nada de lo que se ve. */
  const plegada = useSidebarPlegada();

  return (
    <>
      {/**
       * El menú, flotando y **solo en móvil**.
       *
       * `fixed` y no `absolute`: tiene que quedarse quieto mientras `<main>` se
       * desplaza. Con fondo y borde propios porque ahora flota sobre contenido
       * cualquiera —una tabla, un tablero— y un icono suelto ahí no se ve.
       */}
      <button
        type="button"
        onClick={openMenu}
        aria-label="Abrir menú"
        className="fixed left-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#202020] text-text-primary shadow-lg transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.75}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

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
        aria-label={title}
        className={`relative flex-1 bg-[#191919] motion-safe:scroll-smooth ${
          /* `overflow-hidden` y no `auto`: con `lleno`, el que desplaza es un
             hijo, y dejar aquí un scroll de reserva produce dos barras
             anidadas —una que no se mueve nunca— en cuanto el hijo mide justo. */
          lleno ? 'min-h-0 overflow-hidden' : 'overflow-y-auto'
        }`}
      >
        <div
          className={`mx-auto w-full ${
            anchoCompleto
              ? 'p-0 max-w-full'
              : /* ⚠️ `pt-16` en móvil y `sm:pt-6` a partir de ahí: el botón del
                   menú flota sobre esta esquina, y sin ese hueco taparía la
                   primera línea de cualquier pantalla. En escritorio no existe,
                   así que no se paga. */
                `px-4 pb-4 pt-16 sm:p-6 ${plegada ? 'max-w-[1584px]' : 'max-w-[1400px]'}`
          } ${lleno ? 'flex h-full min-h-0 flex-col' : ''}`}
        >
          {children}
        </div>
      </main>
    </>
  );
}
