import { AppHeader, Pagination, type ProjectStatusName } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type { Metadata } from 'next';
import { AdminTabs } from '@/components/organisms/AdminTabs';
import { ProjectsTable } from '@/components/organisms/ProjectsTable';
import { ProjectsToolbar } from '@/components/organisms/ProjectsToolbar';
import { type AdminProjectPage, FILAS_POR_PAGINA } from '@/lib/admin';

export const metadata: Metadata = { title: 'Proyectos' };

interface PageProps {
  searchParams: Promise<{ q?: string; estado?: string; page?: string }>;
}

const ESTADOS_VALIDOS: readonly string[] = ['ACTIVE', 'SUSPENDED', 'DELETED'];

/**
 * Inventario de proyectos de la plataforma: listar, buscar, suspender y archivar.
 *
 * ## Es la única pantalla que ve los archivados
 *
 * Un proyecto en `DELETED` no aparece en `GET /projects`, ni en el selector de
 * Análisis, ni para su dueño. Aquí sí, y por eso el filtro por defecto es «Todos»:
 * si el único sitio donde existe lo escondiera tras un filtro que hay que descubrir,
 * un archivado por error parecería perdido para siempre.
 *
 * ## Los filtros viven en la URL
 *
 * `?q=`, `?estado=` y `?page=`. Así «los proyectos suspendidos» se puede pegar en un
 * mensaje, el botón atrás hace lo que se espera, y esta página sigue siendo un Server
 * Component que pinta datos frescos del gateway en cada navegación.
 *
 * ## Sin `loadCurrentUser`
 *
 * A diferencia de Cuentas, aquí no hace falta saber quién mira: no hay regla de
 * jerarquía que aplicar —los proyectos no tienen nivel— y no existe el caso «tu
 * propia fila». Cualquier administrador puede suspender cualquier proyecto, incluido
 * uno suyo, y el guard del gateway se lo aplicará como a todos.
 */
export default async function ProjectsPage({ searchParams }: PageProps) {
  const { q, estado, page: pageParam } = await searchParams;

  const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  const busqueda = q?.trim() ?? '';
  const estadoFiltro = ESTADOS_VALIDOS.includes(estado ?? '')
    ? (estado as ProjectStatusName)
    : undefined;

  const params = new URLSearchParams({
    page: String(page),
    limit: String(FILAS_POR_PAGINA),
  });
  if (busqueda) params.set('search', busqueda);
  if (estadoFiltro) params.set('status', estadoFiltro);

  const { items, total } = await createServerApiClient().get<AdminProjectPage>(
    `/admin/projects?${params.toString()}`,
  );

  /** Conserva los filtros al cambiar de página: perderlos es el fallo clásico. */
  const hrefFor = (destino: number) => {
    const otros = new URLSearchParams();
    if (busqueda) otros.set('q', busqueda);
    if (estadoFiltro) otros.set('estado', estadoFiltro);
    if (destino > 1) otros.set('page', String(destino));
    const qs = otros.toString();
    return qs ? `/admin/proyectos?${qs}` : '/admin/proyectos';
  };

  return (
    <AppHeader title="Administración">
      <div className="flex flex-col gap-6">
        <AdminTabs activo="proyectos" />

        <ProjectsToolbar busqueda={busqueda} estado={estadoFiltro} total={total} />

        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-6 py-12 text-center font-sans text-sm text-text-secondary">
            {busqueda || estadoFiltro
              ? 'Ningún proyecto encaja con lo que buscas.'
              : 'Todavía no hay proyectos en la plataforma.'}
          </p>
        ) : (
          <>
            <ProjectsTable proyectos={items} />

            <Pagination
              page={page}
              limit={FILAS_POR_PAGINA}
              total={total}
              hrefFor={hrefFor}
              nombre="proyectos"
            />
          </>
        )}
      </div>
    </AppHeader>
  );
}
