'use client';

import type { ReactNode } from 'react';
import { useSidebarPlegada } from './AppShell';

export interface PageSkeletonProps {
  /** Lo mismo que en `AppHeader`: el nombre de la pantalla, para quien no la ve. */
  title: string;
  /** Espejo de `AppHeader.lleno`. La pantalla ocupa el alto y no desplaza. */
  lleno?: boolean;
  /** Espejo de `AppHeader.anchoCompleto`. Sin relleno ni ancho máximo. */
  anchoCompleto?: boolean;
  children: ReactNode;
}

/**
 * El armazón de un `loading.tsx`: exactamente la caja que va a ocupar la
 * pantalla real.
 *
 * ## Vive aquí, pegado a `AppHeader`, y ese es el punto
 *
 * Un esqueleto solo sirve si su caja **es** la caja del contenido. Cuando las
 * dos se escriben por separado divergen sin que nada falle, y el resultado es
 * un salto al terminar de cargar — que es peor que no tener esqueleto, porque
 * promete una disposición y entrega otra. Teniéndolos en el mismo directorio,
 * quien toque el relleno o el ancho de uno ve el otro.
 *
 * ## 🔴 Habían divergido, y se notaba en todas las pantallas
 *
 * Los cuatro `loading.tsx` que había dibujaban una **franja de cabecera de
 * `h-16` con borde inferior**, y `AppHeader` ya no tiene cabecera: se retiró
 * entera y lo que hacía falta se reubicó (el menú flota en móvil, PRAX abajo a
 * la derecha). Así que al cargar cualquier pantalla aparecía una barra que
 * luego desaparecía.
 *
 * Y el fondo tampoco coincidía: el esqueleto pintaba `#0c0c0b` —el negro base
 * de la aplicación— y `<main>` es `#191919`. O sea que además del salto de
 * disposición había un cambio de fondo a media carga.
 *
 * Ninguna de las dos cosas da un error. Solo parpadean.
 *
 * ⚠️ **`useSidebarPlegada` es seguro fuera del armazón**: devuelve `false` si no
 * hay contexto en vez de lanzar (a diferencia de `useAppShell`). Se usa por lo
 * mismo que en `AppHeader` — con la barra plegada el contenido reclama los
 * ~184 px que se liberan, y sin esto el esqueleto mediría 1400 y la pantalla
 * 1584.
 */
export function PageSkeleton({
  title,
  lleno = false,
  anchoCompleto = false,
  children,
}: PageSkeletonProps) {
  const plegada = useSidebarPlegada();

  return (
    /* `aria-busy` y un texto solo para lectores: sin esto, quien navega con uno
       oye un montón de cajas sin nombre y no sabe si la pantalla llegó o falló. */
    <main
      aria-label={title}
      aria-busy="true"
      className={`relative flex-1 bg-[#191919] ${lleno ? 'min-h-0 overflow-hidden' : 'overflow-y-auto'}`}
    >
      <span className="sr-only">Cargando {title}</span>

      <div
        className={`mx-auto w-full ${
          anchoCompleto
            ? 'max-w-full p-0'
            : `px-4 pb-4 pt-16 sm:p-6 ${plegada ? 'max-w-[1584px]' : 'max-w-[1400px]'}`
        } ${lleno ? 'flex h-full min-h-0 flex-col' : ''}`}
      >
        {children}
      </div>
    </main>
  );
}
