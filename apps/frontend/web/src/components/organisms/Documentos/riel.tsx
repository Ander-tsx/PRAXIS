import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Las piezas del **riel lateral** de las tres páginas de lectura —Ayuda, Términos y Privacidad—.
 *
 * Existen para que se vean y se comporten igual: un grupo con su título en versalitas y filas con
 * un estado activo marcado. Sin flechas ni adornos: la fila activa se lee por su fondo y su
 * barra de color.
 */
export function GrupoDeRiel({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="px-3 pb-1.5 font-sans text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
        {titulo}
      </h2>
      {children}
    </div>
  );
}

const BASE = 'relative rounded-lg px-3 py-1.5 font-sans text-[13px] leading-snug transition-colors';
const ACTIVO = 'bg-surface-2 font-semibold text-text-primary';
const INACTIVO = 'text-text-secondary hover:bg-surface-2 hover:text-text-primary';

/** Una fila del riel que lleva a otra página. */
export function EnlaceDeRiel({
  href,
  activo = false,
  children,
}: {
  href: string;
  activo?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={activo ? 'page' : undefined}
      className={`${BASE} ${activo ? ACTIVO : INACTIVO}`}
    >
      {activo && (
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
        />
      )}
      {children}
    </Link>
  );
}

/** Una fila del riel que salta a un ancla de la misma página. */
export function AnclaDeRiel({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className={`${BASE} ${INACTIVO}`}>
      {children}
    </a>
  );
}
