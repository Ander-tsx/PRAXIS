import { ActivityTable } from '@/components/organisms/ActivityTable';
import { ActivityToolbar } from '@/components/organisms/ActivityToolbar';
import { AdminTabs } from '@/components/organisms/AdminTabs';
import { type AdminActivityPage, FILAS_POR_PAGINA } from '@/lib/admin';
import { ADMIN_ACTIONS, type AdminActionName, AppHeader, Pagination } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Actividad' };

interface PageProps {
  searchParams: Promise<{
    accion?: string;
    actor?: string;
    objetivo?: string;
    desde?: string;
    hasta?: string;
    page?: string;
  }>;
}

/**
 * El registro de lo que se hace en el panel.
 *
 * ## No es tiempo real, y no lo finge
 *
 * El repo no tiene WebSocket ni SSE —la bandeja de avisos reconsulta cada 60 s— y
 * este registro tampoco. Se recarga al navegar y con el botón de la barra. Un
 * refresco automático cada pocos segundos sería fácil de añadir con
 * `AutoRefresh`, pero aquí no aporta: a un registro de auditoría se entra a
 * *buscar* algo que ya pasó, y una tabla que se reordena sola mientras lees es
 * peor que una quieta.
 *
 * ## Los filtros son los cuatro ejes, y viven en la URL
 *
 * Quién (`actor`), sobre quién (`objetivo`), qué (`accion`) y cuándo
 * (`desde`/`hasta`). El «por qué» no se filtra: es texto libre, y una caja de
 * búsqueda sobre él prometería más de lo que puede cumplir.
 */
export default async function ActivityPage({ searchParams }: PageProps) {
  const { accion, actor, objetivo, desde, hasta, page: pageParam } = await searchParams;

  const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  const accionFiltro = ADMIN_ACTIONS.includes(accion as never)
    ? (accion as AdminActionName)
    : undefined;

  const params = new URLSearchParams({
    page: String(page),
    limit: String(FILAS_POR_PAGINA),
  });
  if (accionFiltro) params.set('action', accionFiltro);
  if (actor) params.set('actorId', actor);
  if (objetivo) params.set('targetId', objetivo);
  /* `desde` llega como `2026-08-04` y el DTO espera algo que `new Date()` entienda:
     una fecha sin hora se interpreta a medianoche UTC, que es lo que se quiere
     para «desde este día». Para `hasta` se toma el final del día, o el filtro
     dejaría fuera todo lo ocurrido ese mismo día. */
  if (desde) params.set('from', `${desde}T00:00:00.000Z`);
  if (hasta) params.set('to', `${hasta}T23:59:59.999Z`);

  const registro = await createServerApiClient()
    .get<AdminActivityPage>(`/admin/activity?${params.toString()}`)
    .catch(() => null);

  const hrefFor = (destino: number) => {
    const otros = new URLSearchParams();
    if (accionFiltro) otros.set('accion', accionFiltro);
    if (actor) otros.set('actor', actor);
    if (objetivo) otros.set('objetivo', objetivo);
    if (desde) otros.set('desde', desde);
    if (hasta) otros.set('hasta', hasta);
    if (destino > 1) otros.set('page', String(destino));
    const qs = otros.toString();
    return qs ? `/admin/actividad?${qs}` : '/admin/actividad';
  };

  const hayFiltros = Boolean(accionFiltro || actor || objetivo || desde || hasta);

  return (
    <AppHeader title="Administración">
      <div className="flex flex-col gap-6">
        <AdminTabs activo="actividad" />

        <div className="flex flex-col gap-2">
          <h2 className="font-display text-2xl text-text-primary">Registro de actividad</h2>
          <p className="font-serif text-sm italic text-text-secondary">
            Quién hizo qué, sobre quién, cuándo y por qué. No se puede editar ni borrar.
          </p>
        </div>

        <ActivityToolbar accion={accionFiltro} desde={desde} hasta={hasta} />

        {!registro ? (
          <p className="rounded-2xl border border-dashed border-error/40 px-6 py-12 text-center font-sans text-sm text-error">
            No se pudo leer el registro. Vuelve a intentarlo.
          </p>
        ) : registro.items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-6 py-12 text-center font-sans text-sm text-text-secondary">
            {hayFiltros
              ? 'Ninguna acción encaja con estos filtros.'
              : 'Todavía no se ha registrado ninguna acción de administración.'}
          </p>
        ) : (
          <>
            <ActivityTable entradas={registro.items} />

            <Pagination
              page={page}
              limit={FILAS_POR_PAGINA}
              total={registro.total}
              hrefFor={hrefFor}
              nombre="acciones"
            />
          </>
        )}
      </div>
    </AppHeader>
  );
}
