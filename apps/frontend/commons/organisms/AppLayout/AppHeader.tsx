'use client';

import { type ReactNode, useState } from 'react';
import { useFijarTituloMovil } from './BarraSuperior';
import { claseDeEntrada, consumirTransicion } from './transicionDePantalla';

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
   * El título de la barra de arriba en móvil, cuando la ruta no basta para
   * saberlo: el nombre del proyecto en `/projects/<slug>`. Sin él, la barra
   * pone el de la ruta (ver `pantallaMovil` en `BarraSuperior`).
   */
  tituloMovil?: string;
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
  tituloMovil,
  lleno = false,
  anchoCompleto = false,
  children,
}: AppHeaderProps) {
  /* Móvil: entra deslizando según hacia dónde se navegó (D9). Se lee una vez,
     al montar; en la carga inicial no hay dirección y no anima. */
  const [entrada] = useState(() =>
    typeof window === 'undefined' ? '' : claseDeEntrada(consumirTransicion()),
  );
  useFijarTituloMovil(tituloMovil);
  /* ⚠️ **Sin ancho máximo.** Hubo uno (1400 px, 1584 con la barra plegada) y
     en un monitor grande —o al alejar el zoom— dejaba dos franjas vacías a los
     lados más anchas que la propia barra lateral. La columna ocupa lo que haya;
     lo que necesite medida de lectura (un párrafo, un formulario) la pone él. */

  return (
    <>
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
          className={`mx-auto w-full ${entrada} ${
            anchoCompleto
              ? 'max-w-full p-0'
              : /* En móvil la zona segura del notch ya la reserva la barra de
                   arriba (`BarraSuperior`, M8 de `docs/PLAN-MOVIL.md`): aquí
                   solo el respiro. Desde `md` es lo de siempre (I1). */
                'max-w-full p-4 md:p-6 lg:px-8'
          } ${lleno ? 'flex h-full min-h-0 flex-col' : ''}`}
        >
          {children}
        </div>
      </main>
    </>
  );
}
