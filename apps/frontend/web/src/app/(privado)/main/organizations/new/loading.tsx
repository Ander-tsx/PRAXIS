import { PageSkeleton, Skeleton } from '@praxis/commons';

/**
 * Esqueleto de «Nueva organización»: un formulario de un solo campo.
 *
 * Es el esqueleto más corto del producto, y tiene que serlo. La pantalla real
 * pregunta el nombre y poco más; dibujar aquí una rejilla de cajas prometería
 * un formulario largo que no existe, y eso desorienta más que un rectángulo de
 * menos.
 */
export default function NuevaOrganizacionLoading() {
  return (
    <PageSkeleton title="Nueva organización">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 pb-16">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>

        <div className="flex flex-col gap-5 border-t border-white/10 pt-8">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-full max-w-sm" />
          </div>
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-11 w-40 rounded-lg" fuerte />
        </div>
      </div>
    </PageSkeleton>
  );
}
