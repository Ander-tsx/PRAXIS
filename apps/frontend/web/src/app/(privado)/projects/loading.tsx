import { PageSkeleton, Skeleton, SkeletonCircle } from '@praxis/commons';

/**
 * Esqueleto del listado de proyectos.
 *
 * 🔴 **Dibuja la LISTA, no la rejilla, y eso se comprobó mirando la pantalla.**
 *
 * La primera versión de este archivo pintaba una rejilla de tarjetas, que es lo
 * que uno supone que hay detrás de «proyectos». No es lo que sale: la vista por
 * defecto es la lista (`vista === 'grilla' ? 'grilla' : 'lista'` en la página),
 * y la rejilla solo aparece con `?vista=grilla` en la URL. O sea que el
 * esqueleto prometía una disposición y llegaba la contraria — el salto que un
 * esqueleto viene a evitar, provocado por el propio esqueleto.
 *
 * ⚠️ **Y no se puede acertar leyendo la URL**: un `loading.tsx` no recibe
 * `searchParams`. Hay que elegir una, y la correcta es la de por defecto: quien
 * pide `?vista=grilla` ya pidió algo, y es la minoría.
 *
 * Las columnas aparecen por tramos igual que en la tabla real —Equipo desde
 * `md`, Espacios desde `lg`, Creado desde `sm`— porque si no, en un portátil
 * estrecho el esqueleto enseñaría columnas que la tabla no va a pintar.
 */

function Fila() {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-white/[0.06] px-4 py-3.5 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-lg" fuerte />
        <div className="flex min-w-0 flex-col gap-1.5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>

      <span className="hidden w-28 justify-end md:flex">
        <span className="flex -space-x-1.5">
          <SkeletonCircle className="h-6 w-6" fuerte />
          <SkeletonCircle className="h-6 w-6" fuerte />
        </span>
      </span>

      <span className="hidden w-20 justify-end lg:flex">
        <Skeleton className="h-3 w-16" />
      </span>

      <span className="hidden w-28 justify-end sm:flex">
        <Skeleton className="h-3 w-20" />
      </span>
    </div>
  );
}

export default function ProjectsLoading() {
  return (
    <PageSkeleton title="Proyectos">
      <div className="flex flex-col gap-5">
        {/* Buscador, conmutador lista/grilla y «Nuevo proyecto». */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Skeleton className="h-9 w-full max-w-sm" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-40" fuerte />
        </div>

        <Skeleton className="h-4 w-28" />

        <div className="flex flex-col overflow-hidden rounded-xl border border-white/[0.08]">
          {/* La cabecera de la tabla: cuatro epígrafes en versalitas. */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-white/[0.06] px-4 py-2.5">
            <Skeleton className="h-2.5 w-20" />
            <span className="hidden w-28 justify-end md:flex">
              <Skeleton className="h-2.5 w-14" />
            </span>
            <span className="hidden w-20 justify-end lg:flex">
              <Skeleton className="h-2.5 w-16" />
            </span>
            <span className="hidden w-28 justify-end sm:flex">
              <Skeleton className="h-2.5 w-14" />
            </span>
          </div>

          {Array.from({ length: 5 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: cajas decorativas, sin identidad ni orden que pueda cambiar
            <Fila key={i} />
          ))}
        </div>
      </div>
    </PageSkeleton>
  );
}
