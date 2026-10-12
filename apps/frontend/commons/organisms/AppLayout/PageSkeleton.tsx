'use client';

import { type ReactNode, useState } from 'react';
import { claseDeEntrada, consumirTransicion } from './transicionDePantalla';

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
 * Y el fondo tampoco coincidía: el esqueleto pintaba `var(--color-background)` —el negro base
 * de la aplicación— y `<main>` es `var(--color-surface)`. O sea que además del salto de
 * disposición había un cambio de fondo a media carga.
 *
 * Ninguna de las dos cosas da un error. Solo parpadean.
 *
 * ⚠️ **El mismo contenedor que `AppHeader`, a ancho completo.** Si divergen, la
 * pantalla salta de anchura al terminar de cargar.
 */
export function PageSkeleton({
  title,
  lleno = false,
  anchoCompleto = false,
  children,
}: PageSkeletonProps) {
  /* La misma entrada que `AppHeader`: si el esqueleto llega primero, se la
     lleva él y la pantalla de verdad ya no vuelve a deslizarse. */
  const [entrada] = useState(() =>
    typeof window === 'undefined' ? '' : claseDeEntrada(consumirTransicion()),
  );
  return (
    /* `aria-busy` y un texto solo para lectores: sin esto, quien navega con uno
       oye un montón de cajas sin nombre y no sabe si la pantalla llegó o falló. */
    <main
      aria-label={title}
      aria-busy="true"
      className={`relative flex-1 bg-surface ${lleno ? 'min-h-0 overflow-hidden' : 'overflow-y-auto'}`}
    >
      <span className="sr-only">Cargando {title}</span>

      <div
        className={`mx-auto w-full ${entrada} ${
          anchoCompleto ? 'max-w-full p-0' : 'max-w-full p-4 md:p-6 lg:px-8'
        } ${lleno ? 'flex h-full min-h-0 flex-col' : ''}`}
      >
        {children}
      </div>
    </main>
  );
}
