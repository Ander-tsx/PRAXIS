import { PageSkeleton, Skeleton } from '@praxis/commons';

/**
 * Esqueleto de Facturación: cabecera, pestañas, tu plan y la tabla comparativa.
 *
 * ⚠️ **Las pestañas se dibujan aunque puedan ser una sola.** «Registro» solo
 * aparece con plan de pago y permiso, y aquí no se sabe todavía. Se pintan dos:
 * quedarse corto añade una pestaña al llegar —un salto lateral— y pasarse de
 * dos las quitaría todas de sitio. Dos es el caso más común.
 */

function ColumnaDePlan({ destacada = false }: { destacada?: boolean }) {
  return (
    <div className="flex flex-col gap-4 px-5 py-6">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-6 w-24" fuerte={destacada} />
      <Skeleton className="h-3 w-20" />
      <div className="flex flex-col gap-2.5 pt-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
      <Skeleton className="mt-2 h-9 w-full rounded-lg" fuerte={destacada} />
    </div>
  );
}

export default function BillingLoading() {
  return (
    <PageSkeleton title="Facturación">
      <div className="flex w-full flex-col gap-8 pb-16">
        <header className="flex flex-col gap-3 border-b border-white/[0.08] pb-6">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-96" />
        </header>

        <div className="flex gap-2 border-b border-white/10 pb-px">
          <Skeleton className="h-10 w-28" fuerte />
          <Skeleton className="h-10 w-28" />
        </div>

        {/* El bloque «Tu plan»: nombre, botón de Stripe y el aviso de asientos. */}
        <div className="flex flex-col gap-6 rounded-2xl border border-white/10 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-40" fuerte />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-10 w-44 rounded-lg" />
          </div>

          <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-14 w-full max-w-2xl rounded-r-lg" />
            <div className="flex items-end gap-3 pt-1">
              <Skeleton className="h-[58px] w-40 rounded-lg" />
              <Skeleton className="h-[58px] w-28 rounded-lg" />
            </div>
          </div>
        </div>

        {/* La tabla comparativa. Cuatro columnas: los planes de la escalera. */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-full max-w-2xl" />
          </div>

          <div className="grid grid-cols-2 divide-x divide-white/[0.06] overflow-hidden rounded-xl border border-white/10 lg:grid-cols-4">
            <ColumnaDePlan />
            <ColumnaDePlan destacada />
            <ColumnaDePlan />
            <ColumnaDePlan />
          </div>
        </div>
      </div>
    </PageSkeleton>
  );
}
