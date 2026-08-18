import Link from 'next/link';

export interface FiltroDeAvisosProps {
  /** Sin leer en **toda** la bandeja, no en la página actual. */
  unread: number;
  /** Qué pestaña está puesta. */
  soloSinLeer: boolean;
  /** Ruta de «Todas». Interna de la zona: Next le pone el basePath. */
  hrefTodas: string;
  /** Ruta de «Sin leer». Interna de la zona. */
  hrefSinLeer: string;
}

/**
 * El filtro de la bandeja, como dos enlaces.
 *
 * Vive en la URL, así que son enlaces de verdad: se comparten, el botón atrás
 * hace lo que se espera y quien lo pinta sigue siendo un Server Component. Con
 * `next/link` y **sin** el prefijo de zona, que lo pone Next (ESTADO-ACTUAL §16).
 *
 * ⚠️ **Las rutas llegan por props y no se construyen aquí** (E4.2). Al mudar la
 * bandeja al panel, sus parámetros pasan a convivir con los de otras secciones,
 * así que van prefijados (`?avisos_filtro=`) y quien conoce ese prefijo es la
 * page. Un filtro que se inventara la ruta ataría este componente a una pantalla
 * concreta, que es justo lo que hizo falta deshacer para moverlo.
 *
 * ⚠️ **«Todas» no lleva número, y no es un olvido.** `total` viene contado con
 * el **mismo `where` que la consulta**, así que con `unreadOnly=true` vale lo
 * mismo que `unread`: pintarlo ahí diría «Todas 3» cuando hay treinta, y solo
 * mientras el otro filtro está puesto — un número que miente a ratos es peor que
 * ninguno. El de «Sin leer» sí es fiable siempre: `unread` cuenta la bandeja
 * entera pase lo que pase con el filtro, porque es el mismo que pinta la
 * insignia de la barra lateral.
 */
export function FiltroDeAvisos({
  unread,
  soloSinLeer,
  hrefTodas,
  hrefSinLeer,
}: FiltroDeAvisosProps) {
  return (
    /* `<nav>` y no un `div` con `role="group"`: son dos enlaces que cambian de
       vista, que es literalmente navegación, y el elemento ya trae el papel. */
    <nav
      className="flex items-center gap-0.5 rounded-lg border border-border p-0.5"
      aria-label="Filtrar avisos"
    >
      <Link
        href={hrefTodas}
        aria-current={soloSinLeer ? undefined : 'page'}
        className={pastilla(!soloSinLeer)}
      >
        Todas
      </Link>
      <Link
        href={hrefSinLeer}
        aria-current={soloSinLeer ? 'page' : undefined}
        className={pastilla(soloSinLeer)}
      >
        Sin leer
        {unread > 0 && (
          <span
            className={`tabular-nums ${soloSinLeer ? 'text-primary' : 'text-text-disabled'}`}
            aria-hidden="true"
          >
            {unread}
          </span>
        )}
      </Link>
    </nav>
  );
}

function pastilla(activa: boolean): string {
  return [
    'flex items-center gap-1.5 rounded-md px-3 py-1.5 font-sans text-xs font-semibold transition-colors',
    activa
      ? 'bg-primary-muted text-primary'
      : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
  ].join(' ');
}
