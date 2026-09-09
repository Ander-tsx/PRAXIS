import { PageSkeleton, Skeleton, SkeletonCircle } from '@praxis/commons';

/**
 * Esqueleto de Tu cuenta.
 *
 * ⚠️ **`anchoCompleto`, igual que la pantalla.** `AccountIdentity` lleva una
 * portada a sangre de borde a borde, así que la página se monta sin relleno ni
 * ancho máximo. Sin esto el esqueleto saldría en la columna de 1400 px y la
 * portada se abriría de golpe al llegar.
 *
 * El avatar monta sobre la portada —desplazado hacia arriba— porque así se
 * pinta de verdad; con el círculo debajo, la ficha entera se recolocaría al
 * cargar.
 */
export default function ProfileLoading() {
  return (
    <PageSkeleton title="Tu cuenta" anchoCompleto>
      <div className="flex flex-col">
        <Skeleton className="h-48 w-full rounded-none sm:h-60" />

        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-16 sm:px-6">
          <div className="-mt-12 flex items-end gap-4">
            <SkeletonCircle className="h-24 w-24 shrink-0 ring-4 ring-[#191919]" fuerte />
            <div className="flex flex-1 flex-col gap-2 pb-2">
              <Skeleton className="h-6 w-52" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-9 w-28 shrink-0 rounded-lg" />
          </div>

          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-32 rounded-full" />
          </div>

          <div className="flex flex-col gap-6 border-t border-white/5 pt-6">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-72" />
              <Skeleton className="mt-1 h-10 w-full max-w-sm rounded-lg" />
            </div>

            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <div className="mt-2 flex flex-wrap gap-8">
                <Skeleton className="h-10 w-36 rounded-lg" />
                <Skeleton className="h-10 w-36 rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageSkeleton>
  );
}
