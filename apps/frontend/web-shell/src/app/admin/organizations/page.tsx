import { FilterBar } from '@/components/molecules/FilterBar';
import { AdminHeader } from '@/components/organisms/admin/AdminHeader';
import { OrganizationsTable } from '@/components/organisms/admin/OrganizationsTable';
import { type AdminOrganizationPage, FILAS_POR_PAGINA } from '@/lib/admin';
import { AppHeader, Pagination, colors } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Organizaciones' };

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

/**
 * Quién ha contratado qué, en toda la instalación.
 *
 * ## No es el portal de una organización
 *
 * ⚠️ Aquel es **tu** espacio —tus proyectos, tu gente— y lo abre quien pertenece
 * a ella. Esto es la lista de **todas** las que existen, y la abre quien
 * administra la plataforma. Es la misma separación que ya hay entre «tus
 * proyectos» y `/admin/projects`, y por eso son dos pantallas y no una con un
 * filtro.
 *
 * ## Solo lectura, y es una decisión escrita
 *
 * 🔴 No hay aquí ningún botón de suspender ni de borrar, y el endpoint tampoco
 * los ofrece. **La palanca que existe es la del proyecto** y ya está en
 * `/admin/projects`: suspender una organización entera dejaría a varios equipos
 * sin poder escribir de un solo clic, y no hay ninguna pantalla que se lo
 * explique a ninguno de ellos. Cuando haga falta habrá que diseñar antes qué se
 * les dice, igual que se hizo con `PROJECT_SUSPENDED`.
 *
 * Lo que sí responde es la pregunta que no tenía respuesta en ningún sitio:
 * **cuántos asientos hay pagados frente a ocupados**, y en qué plan.
 */
export default async function OrganizationsPage({ searchParams }: PageProps) {
  const { q, page: pageParam } = await searchParams;

  const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  const busqueda = q?.trim() ?? '';

  const params = new URLSearchParams({ page: String(page), limit: String(FILAS_POR_PAGINA) });
  if (busqueda) params.set('search', busqueda);

  const api = createServerApiClient();

  /* La principal lleva su propio `catch`: sin él, billing-service caído tumbaba
     la pantalla entera con un 500 en vez de decir que no se pudo cargar. Es la
     misma nota que en Cuentas y en Proyectos. */
  const listado = await api
    .get<AdminOrganizationPage>(`/admin/organizations?${params.toString()}`)
    .catch(() => null);

  const items = listado?.items ?? [];
  const total = listado?.total ?? 0;

  /* Las cifras se calculan sobre la página, no sobre el total, y por eso dicen
     «en esta página»: contar los asientos de toda la instalación pediría una
     consulta agregada que el endpoint no ofrece, y una cifra que parece global
     y no lo es miente más que no estar. */
  const dePago = items.filter((organizacion) => organizacion.tier !== 'FREE').length;
  const asientosOcupados = items.reduce((suma, organizacion) => suma + organizacion.seatsUsed, 0);

  /** Conserva la búsqueda al cambiar de página. */
  const hrefFor = (destino: number) => {
    const otros = new URLSearchParams();
    if (busqueda) otros.set('q', busqueda);
    if (destino > 1) otros.set('page', String(destino));
    const qs = otros.toString();
    return qs ? `/admin/organizations?${qs}` : '/admin/organizations';
  };

  return (
    <AppHeader title="Administración">
      <div data-tone="dark" className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-16">
        <AdminHeader
          titulo="Organizaciones"
          descripcion="Quién ha contratado qué, y cuántos asientos hay ocupados de los que paga. Solo se mira: la palanca de suspender es la del proyecto."
          cifras={[
            { etiqueta: 'En total', valor: total, tono: colors.textPrimary },
            { etiqueta: 'De pago (esta página)', valor: dePago, tono: colors.success },
            {
              etiqueta: 'Asientos usados (esta página)',
              valor: asientosOcupados,
              tono: colors.warning,
            },
          ]}
        />

        <FilterBar
          basePath="/organizations"
          busqueda={busqueda}
          placeholder="Nombre de la organización"
          total={total}
          nombreSingular="organización"
          nombrePlural="organizaciones"
        />

        {listado === null ? (
          <p className="rounded-xl border border-white/10 bg-[#191919] px-6 py-16 text-center font-sans text-sm text-error">
            No se pudieron cargar las organizaciones. Vuelve a intentarlo.
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-[#191919] px-6 py-16 text-center font-sans text-sm text-white/50">
            {busqueda
              ? 'Ninguna organización encaja con lo que buscas.'
              : 'Todavía no hay ninguna organización en la plataforma.'}
          </p>
        ) : (
          <>
            <OrganizationsTable organizaciones={items} />

            <Pagination
              page={page}
              limit={FILAS_POR_PAGINA}
              total={total}
              hrefFor={hrefFor}
              nombre="organizaciones"
            />
          </>
        )}
      </div>
    </AppHeader>
  );
}
