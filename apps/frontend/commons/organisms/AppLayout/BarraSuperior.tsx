'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';

/**
 * Qué pantalla es una ruta, para la barra de arriba en móvil: su título y a
 * dónde lleva «atrás». `atras: null` es la raíz de una pestaña de la barra
 * inferior, donde no hay de dónde volver.
 *
 * ⚠️ **Es la misma lista de raíces que usa `GestosMoviles`** para no volver
 * deslizando desde una pestaña: si una pantalla nueva es raíz aquí y no allí,
 * el gesto sacaría de la app desde ella.
 */
export interface PantallaMovil {
  titulo: string;
  atras: string | null;
}

/** Las raíces de las cinco pestañas de abajo. */
export const RAICES_MOVILES: ReadonlyMap<string, string> = new Map([
  ['/projects', 'Inicio'],
  ['/chat', 'Chat'],
  ['/assistant', 'PRAX'],
  ['/main/notifications', 'Avisos'],
  ['/main/me', 'Tú'],
]);

/** Las pantallas que cuelgan de «Tú»: se vuelve a «Tú». */
const DE_TU: ReadonlyArray<readonly [prefijo: string, titulo: string]> = [
  ['/main/team', 'Equipo'],
  ['/main/billing', 'Facturación'],
  ['/main/integrations', 'Integraciones'],
  ['/main/organizations/new', 'Nueva organización'],
  ['/main/organizations', 'Organización'],
  ['/main/profile', 'Perfil'],
  ['/admin', 'Administración'],
  ['/ayuda', 'Ayuda'],
];

export function pantallaMovil(pathname: string): PantallaMovil {
  const raiz = RAICES_MOVILES.get(pathname);
  if (raiz) return { titulo: raiz, atras: null };
  /* `?lista=1`: sin él, `/chat` puede devolver a la conversación que se deja. */
  if (pathname.startsWith('/chat/')) return { titulo: 'Chat', atras: '/chat?lista=1' };
  if (pathname.startsWith('/projects/')) return { titulo: 'Proyecto', atras: '/projects' };
  for (const [prefijo, titulo] of DE_TU) {
    if (pathname === prefijo || pathname.startsWith(`${prefijo}/`)) {
      return { titulo, atras: '/main/me' };
    }
  }
  return { titulo: 'Praxis', atras: '/projects' };
}

/**
 * El título que pide la pantalla montada, por encima del de la ruta.
 *
 * Lo fija `AppHeader` con su `tituloMovil` —el nombre de un proyecto, que la
 * ruta no sabe—. Mientras esa pantalla carga, la barra enseña el de la ruta
 * («Proyecto»), así que nunca se queda vacía.
 */
const TituloMovilContext = createContext<{
  titulo: string | null;
  fijar: (titulo: string | null) => void;
} | null>(null);

export function TituloMovilProvider({ children }: { children: ReactNode }) {
  const [titulo, fijar] = useState<string | null>(null);
  return (
    <TituloMovilContext.Provider value={{ titulo, fijar }}>{children}</TituloMovilContext.Provider>
  );
}

/** Lo usa `AppHeader`: fija el título al montar y lo suelta al desmontar. */
export function useFijarTituloMovil(titulo: string | undefined) {
  const contexto = useContext(TituloMovilContext);
  const fijar = contexto?.fijar;
  useEffect(() => {
    if (!fijar || !titulo) return;
    fijar(titulo);
    return () => fijar(null);
  }, [fijar, titulo]);
}

/**
 * La barra de arriba, **solo en móvil** (D8 de `docs/PLAN-MOVIL.md`, revisada
 * en M8): el nombre de la pantalla y, si no es la raíz de una pestaña, su
 * «atrás».
 *
 * ## Por qué una sola en el armazón, y no una por pantalla
 *
 * D8 la planeaba por pantalla, y así quedó: cada una decidía si traía título, y
 * la mitad no lo traía. Aquí vive en el armazón, que **no se desmonta al
 * navegar**: está también mientras carga el `loading.tsx`, no parpadea al
 * cambiar de pantalla y ninguna se la puede olvidar.
 *
 * Reserva arriba la zona segura del notch (con `viewport-fit=cover` la página
 * empieza bajo la barra de estado), así que el contenido ya no la reserva.
 */
export function BarraSuperior() {
  const pathname = usePathname();
  const contexto = useContext(TituloMovilContext);
  const pantalla = pantallaMovil(pathname);
  const titulo = (pantalla.atras && contexto?.titulo) || pantalla.titulo;
  const raiz = pantalla.atras === null;

  return (
    <header className="shrink-0 border-b border-white/[0.06] bg-[#191919]/95 pt-safe backdrop-blur-md md:hidden">
      <div className={`flex h-12 items-center gap-1 ${raiz ? 'px-4' : 'pl-1 pr-4'}`}>
        {pantalla.atras && (
          <Link
            href={pantalla.atras}
            aria-label="Atrás"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-primary transition-[background-color,transform] active:scale-90 active:bg-white/10"
          >
            <svg
              className="h-[22px] w-[22px]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.25}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
        )}
        {/* `key`: al cambiar de pantalla el título se funde en vez de saltar. */}
        <h1
          key={titulo}
          className={`titulo-entra min-w-0 flex-1 truncate font-sans tracking-tight text-text-primary ${
            raiz ? 'text-[22px] font-bold' : 'text-[17px] font-semibold'
          }`}
        >
          {titulo}
        </h1>
      </div>
    </header>
  );
}
