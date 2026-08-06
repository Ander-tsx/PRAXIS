import { alpha, colors } from '../../tokens';

/**
 * El paginador de los listados.
 *
 * ## Son enlaces, no botones
 *
 * La página vive en la **URL**, no en estado de cliente, y eso decide la forma:
 * son `<a>` de verdad. Se puede compartir el enlace de la página 3, el botón
 * «atrás» del navegador hace lo que se espera, y las pantallas que lo usan
 * siguen siendo Server Components sin tener que volverse cliente solo para
 * cambiar de página.
 *
 * Por lo mismo **no lleva `next/link`**: estos listados viven en zonas distintas
 * del multi-zone y `next/link` le pondría delante el `basePath` de la zona (ver
 * ESTADO-ACTUAL §16). Un `<a>` con la ruta que ya calcula quien lo monta no
 * tiene esa ambigüedad.
 *
 * ## Qué enseña, y qué no
 *
 * Enseña **de cuántos** («21–40 de 57»), que es lo único que hace falta para
 * saber si merece la pena seguir. No hay lista de números de página: con un
 * listado que crece hasta cientos, veinte cuadraditos son ruido, y nadie salta
 * a la página 7 a propósito — se busca.
 *
 * No se pinta si todo cabe en una página. Un paginador con los dos botones
 * apagados solo ocupa sitio diciendo que no hay nada que paginar.
 */
export interface PaginationProps {
  /** Página actual, desde 1. */
  page: number;
  /** Cuántos elementos caben en una página. */
  limit: number;
  /** Total de elementos, no de páginas. Lo devuelve el backend. */
  total: number;
  /**
   * Construye el `href` de una página. Lo pone quien monta el paginador porque
   * cada listado tiene sus propios parámetros que conservar —la búsqueda, un
   * filtro— y perderlos al pasar de página es el fallo clásico de esto.
   */
  hrefFor: (page: number) => string;
  /** Cómo se llama lo que se lista, en plural. Para el texto y el accesible. */
  nombre?: string;
}

export function Pagination({ page, limit, total, hrefFor, nombre = 'elementos' }: PaginationProps) {
  const paginas = Math.max(1, Math.ceil(total / limit));
  if (paginas <= 1) return null;

  /* Acotada a lo que existe: una URL con `?page=99` escrita a mano no debe
     dejar el paginador diciendo «page 99 de 3». */
  const actual = Math.min(Math.max(1, page), paginas);
  const desde = (actual - 1) * limit + 1;
  const hasta = Math.min(actual * limit, total);

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
      aria-label={`Paginación de ${nombre}`}
    >
      <p className="font-sans text-sm text-text-secondary tabular-nums">
        {desde}–{hasta} de {total} {nombre}
      </p>

      <div className="flex items-center gap-2">
        <Salto href={hrefFor(actual - 1)} disabled={actual === 1}>
          Anterior
        </Salto>
        <span className="font-sans text-sm text-text-disabled tabular-nums">
          {actual} / {paginas}
        </span>
        <Salto href={hrefFor(actual + 1)} disabled={actual === paginas}>
          Siguiente
        </Salto>
      </div>
    </nav>
  );
}

/**
 * Un salto de página.
 *
 * Deshabilitado se pinta como `<span>` y no como un `<a>` apagado: un enlace
 * sigue siendo enfocable y navegable con teclado por más gris que se vea, y
 * llevaría a `?page=0`. Sin `href` no hay adónde ir, que es lo que se quiere
 * decir.
 */
function Salto({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: string;
}) {
  const clases = 'rounded-lg border px-3 py-1.5 font-sans text-sm transition-colors';

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={`${clases} cursor-not-allowed border-border text-text-disabled opacity-50`}
      >
        {children}
      </span>
    );
  }

  return (
    <a
      href={href}
      className={`${clases} border-border text-text-secondary hover:text-text-primary`}
      style={{ borderColor: alpha(colors.border, 100) }}
    >
      {children}
    </a>
  );
}
