import { PageSkeleton, Skeleton, SkeletonCircle } from '@praxis/commons';

/**
 * Esqueleto del proyecto abierto: cabecera, tira de tableros y columnas.
 *
 * ⚠️ **Va con `lleno`, igual que la pantalla cuando hay tablero.** La página
 * decide (`lleno={esTablero}`) y aquí no se puede saber todavía cuál de las dos
 * vistas va a salir, porque eso depende de los datos que están cargando. Se
 * elige el tablero porque es lo que se abre por defecto: acertar en el caso
 * común y que el otro ajuste al llegar es mejor que fallar en los dos.
 *
 * Las columnas llevan **distinto número de tarjetas** a propósito. Un tablero
 * con cuatro columnas iguales no se parece a ninguno real, y el ojo lo lee como
 * una tabla vacía en vez de como un tablero a medio cargar.
 */

const COLUMNAS = [4, 2, 3, 1];

/**
 * ⚠️ **La columna es una caja, no una lista suelta.**
 *
 * `BoardColumns` la pinta como `w-72 rounded-2xl bg-surface-2` con las tarjetas
 * (`bg-surface`) dentro. Sin ese contenedor el esqueleto enseñaba tarjetas
 * flotando sobre el fondo y, al llegar el tablero, aparecían cuatro cajas
 * grandes de golpe.
 *
 * ⚠️ **Los dos tonos van con el mismo literal que el tablero, a propósito**, y
 * es la excepción a «usa los tokens» de CLAUDE.md. El primer intento usó
 * `colors.surface`, que es lo correcto en abstracto y aquí salía **azulado**: el
 * tablero no vive bajo `[data-tone="dark"]`, así que el token resuelve al
 * `#161b27` de la paleta general mientras `BoardColumns` pinta un `var(--color-surface-2)`
 * fijo. Un esqueleto que cambia de color al cargar es peor que uno feo.
 *
 * Mientras el tablero escriba sus colores a pelo, esto los escribe igual. El
 * día que pase a tokens, este archivo va detrás — y es el único sitio donde
 * mirarlo.
 */
function Columna({ tarjetas }: { tarjetas: number }) {
  return (
    <div className="flex h-fit max-h-full w-72 shrink-0 flex-col gap-3 overflow-hidden rounded-2xl bg-surface-2 p-3">
      <div className="flex items-center gap-2 px-1">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-6" />
      </div>

      {Array.from({ length: tarjetas }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: cajas decorativas
          key={i}
          className="flex flex-col gap-2.5 rounded-xl bg-surface p-3"
        >
          <Skeleton className="h-4 w-4/5" />
          <div className="flex gap-1.5">
            <Skeleton className="h-4 w-14 rounded-full" />
            <Skeleton className="h-4 w-20 rounded-full" />
          </div>
          <div className="flex -space-x-1 pt-0.5">
            <SkeletonCircle className="h-6 w-6" fuerte />
            <SkeletonCircle className="h-6 w-6" fuerte />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProjectLoading() {
  return (
    <PageSkeleton title="Proyecto" lleno>
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        {/* `ProjectHeader`: volver, monograma, nombre y descripción en cursiva. */}
        <div className="flex shrink-0 items-center gap-3">
          <Skeleton className="h-7 w-7 shrink-0" />
          <Skeleton className="h-9 w-9 shrink-0 rounded-xl" fuerte />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-3.5 w-80" />
          </div>
          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
        </div>

        {/* La tira de tableros y espacios. */}
        <div className="flex shrink-0 items-center gap-2">
          <Skeleton className="h-8 w-28 rounded-lg" fuerte />
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>

        {/* Las columnas. `overflow-hidden` y no `auto`: el esqueleto no se
            desplaza — no hay nada que buscar dentro de él. */}
        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
          {COLUMNAS.map((tarjetas, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: cajas decorativas
            <Columna key={i} tarjetas={tarjetas} />
          ))}
        </div>
      </div>
    </PageSkeleton>
  );
}
