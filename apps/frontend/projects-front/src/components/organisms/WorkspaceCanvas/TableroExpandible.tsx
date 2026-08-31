import type { ReactNode } from 'react';

export interface TableroExpandibleProps {
  /** Nombre del tablero, para el `aria-label` y el rótulo si no hay `titulo`. */
  nombre: string;
  /** «4 columnas · 12 tareas». Lo compone quien nos monta. */
  resumen: string;
  /**
   * Sustituye al nombre y al resumen en la cabecera.
   *
   * En un espacio con varios tableros lo que tiene que haber ahí **no es el
   * nombre del tablero abierto, sino la forma de cambiar de tablero**. Escribir
   * el nombre y además una fila de pestañas debajo gasta dos líneas en decir lo
   * mismo.
   */
  titulo?: ReactNode;
  /**
   * Controles de vista de la cabecera —el selector de vista (Kanban/Calendario/
   * Tabla), el filtro de «solo mis tareas»—. Llega como slot porque lo que va
   * aquí depende de la pantalla que monta el tablero.
   */
  accionesDeVista?: ReactNode;
  /** Las acciones del tablero en sí —renombrarlo, eliminarlo—, a la derecha. */
  menu?: ReactNode;
  /** El contenido del tablero (columnas, tabla o calendario). */
  children: ReactNode;
}

/**
 * Cabecera del tablero.
 *
 * ⚠️ **Ya no tiene botón de «Ampliar».** El tablero a pantalla completa se
 * retiró en el rediseño de la pantalla de proyecto: con las tres vistas
 * (Kanban, Calendario, Tabla) y la página sin cromo de sobra, ampliar dejó de
 * aportar. El nombre del componente se conserva porque lo importan varios
 * ficheros; hoy es solo la fila de cabecera.
 */
export function TableroExpandible({
  nombre,
  resumen,
  titulo,
  accionesDeVista,
  menu,
  children,
}: TableroExpandibleProps) {
  return (
    <>
      <header className="flex shrink-0 flex-wrap items-center gap-2">
        {titulo ?? (
          <>
            <h4 className="font-sans text-base font-semibold text-white">{nombre}</h4>
            <span className="font-sans text-xs text-white">{resumen}</span>
          </>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <div className="hidden items-center gap-1 sm:flex">{accionesDeVista}</div>
          {menu}
        </div>
      </header>

      {children}
    </>
  );
}

/**
 * `maximize-2` de Lucide: dos flechas en diagonal. Lo sigue usando el menú de
 * columna para abrir **una columna** a pantalla completa (otra cosa, y esa sí se
 * mantiene).
 */
export function MaximizarIcono() {
  return (
    <IconoLucide>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" x2="14" y1="3" y2="10" />
      <line x1="3" x2="10" y1="21" y2="14" />
    </IconoLucide>
  );
}

/** `minimize-2` de Lucide: la pareja de arriba, para salir. */
export function MinimizarIcono() {
  return (
    <IconoLucide>
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" x2="21" y1="10" y2="3" />
      <line x1="3" x2="10" y1="21" y2="14" />
    </IconoLucide>
  );
}

function IconoLucide({ children }: { children: ReactNode }) {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
