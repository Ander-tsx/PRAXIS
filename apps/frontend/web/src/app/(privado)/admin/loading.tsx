import { PageSkeleton, Skeleton, SkeletonCircle, SkeletonRow } from '@praxis/commons';

/**
 * Esqueleto de las cuatro pantallas de administración.
 *
 * ⚠️ **Uno solo, y aquí es correcto.** Un `loading.tsx` cubre su segmento y
 * todos los hijos que no traigan el suyo, y las cuatro —cuentas, proyectos,
 * organizaciones y actividad— comparten forma exacta: `AdminHeader` con título,
 * entradilla y tres cifras; `FilterBar`; y una tabla. Partirlo en cuatro copias
 * idénticas sería garantizar que se separen.
 *
 * ⚠️ **`data-tone="dark"` como en las páginas de verdad.** Esa sección fuerza la
 * paleta monocroma en su contenedor (`theme.css`), y sin él el esqueleto
 * resolvería los tokens contra el tema general: mismos bloques, otro tono, y un
 * cambio de color al terminar de cargar.
 */
export default function AdminLoading() {
  return (
    <PageSkeleton title="Administración">
      <div data-tone="dark" className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-16">
        {/* AdminHeader: título y entradilla a la izquierda, tres cifras a la derecha. */}
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-white/[0.08] pb-6">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full max-w-xl" />
          </div>
          <div className="flex gap-8">
            {Array.from({ length: 3 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: cajas decorativas
              <div key={i} className="flex flex-col items-end gap-2">
                <Skeleton className="h-7 w-12" fuerte />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        </div>

        {/* FilterBar: buscador a la izquierda, píldoras de filtro a la derecha. */}
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-10 w-full max-w-sm rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20 rounded-full" fuerte />
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-white/10 px-5">
          {Array.from({ length: 8 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: cajas decorativas
            <SkeletonRow key={i}>
              <SkeletonCircle className="h-9 w-9 shrink-0" fuerte />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="hidden h-6 w-24 shrink-0 rounded-full sm:block" />
              <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
            </SkeletonRow>
          ))}
        </div>
      </div>
    </PageSkeleton>
  );
}
