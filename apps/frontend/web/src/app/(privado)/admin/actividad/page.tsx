import { ActivityTable } from '@/components/organisms/admin/ActivityTable';
import { ActivityToolbar } from '@/components/organisms/admin/ActivityToolbar';
import { AdminHeader } from '@/components/organisms/admin/AdminHeader';
import { type AdminActivityPage, FILAS_POR_PAGINA } from '@/lib/admin/admin';
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
 * El resto del sistema sí tiene tiempo real —un flujo SSE por persona, abierto
 * desde el armazón— pero este registro no lo usa, y es a propósito: a un
 * registro de auditoría se entra a *buscar* algo que ya pasó, y una tabla que se
 * reordena sola mientras lees es peor que una quieta. Se recarga al navegar y
 * con el botón de la barra.
 *
 * ⚠️ Este párrafo decía «el repo no tiene WebSocket ni SSE» y llevaba tiempo
 * siendo falso; también citaba un componente `AutoRefresh` que ya no existe
 * —se retiró al mudar la bandeja al panel (E4.5)—.
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
      <div data-tone="dark" className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-16">
        {/* Sin cifras: aquí el número que importa es el de la búsqueda en
            curso, y ese ya lo lleva el paginador. Un «12.480 acciones en total»
            no cambiaría ninguna decisión. */}
        <AdminHeader
          titulo="Registro de actividad"
          descripcion="Quién hizo qué, sobre quién, cuándo y por qué. No se puede editar ni borrar."
        />

        <ActivityToolbar accion={accionFiltro} desde={desde} hasta={hasta} />

        {!registro ? (
          <p className="rounded-xl border border-white/10 bg-[#191919] px-6 py-16 text-center font-sans text-sm text-error">
            No se pudo leer el registro. Vuelve a intentarlo.
          </p>
        ) : registro.items.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-[#191919] px-6 py-16 text-center font-sans text-sm text-white/50">
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
