import { PageSkeleton, Skeleton, SkeletonCircle, SkeletonRow } from '@praxis/commons';

/**
 * Esqueleto de Equipo: cabecera, las dos pestañas y el directorio de miembros.
 *
 * Filas y no tarjetas, que es como se pinta el directorio de verdad
 * (`kyloo-design/SKILL.md` §4). Cinco: llenan la primera pantalla sin prometer
 * un equipo grande a quien tiene tres.
 */
export default function TeamLoading() {
  return (
    <PageSkeleton title="Equipo">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16">
        <header className="flex flex-col gap-3 border-b border-white/[0.08] pb-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-full max-w-2xl" />
        </header>

        <div className="flex gap-2 border-b border-white/10 pb-px">
          <Skeleton className="h-10 w-32" fuerte />
          <Skeleton className="h-10 w-40" />
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-52" />
            <Skeleton className="h-4 w-80" />
          </div>

          {/* El botón de invitar, que en la pantalla real va sobre la lista. */}
          <Skeleton className="h-10 w-44 rounded-lg" fuerte />

          <div className="flex flex-col">
            {Array.from({ length: 5 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: cajas decorativas
              <SkeletonRow key={i}>
                <SkeletonCircle className="h-10 w-10 shrink-0" fuerte />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-8 w-32 shrink-0 rounded-lg" />
              </SkeletonRow>
            ))}
          </div>
        </div>
      </div>
    </PageSkeleton>
  );
}
