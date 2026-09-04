import { FilterBar } from '@/components/molecules/FilterBar';
import { AdminHeader } from '@/components/organisms/admin/AdminHeader';
import { ProjectsTable } from '@/components/organisms/admin/ProjectsTable';
import { type AdminProjectPage, ESTADOS_PROYECTO, FILAS_POR_PAGINA } from '@/lib/admin/admin';
import { AppHeader, Pagination, type ProjectStatusName, colors } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Proyectos' };

interface PageProps {
  searchParams: Promise<{ q?: string; estado?: string; page?: string }>;
}

const ESTADOS_VALIDOS: readonly string[] = ['ACTIVE', 'SUSPENDED', 'DELETED'];

/**
 * Las opciones del filtro.
 *
 * ⚠️ **«Todos» incluye los archivados**, y es a propósito: este es el único sitio
 * de la plataforma donde se ven, así que esconderlos tras un filtro que hay que
 * descubrir haría que un proyecto archivado por error pareciera perdido. En las
 * pantallas de negocio no salen en ninguna lista.
 */
const FILTROS = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'ACTIVE', etiqueta: ESTADOS_PROYECTO.ACTIVE.etiqueta },
  { id: 'SUSPENDED', etiqueta: ESTADOS_PROYECTO.SUSPENDED.etiqueta },
  { id: 'DELETED', etiqueta: ESTADOS_PROYECTO.DELETED.etiqueta },
];

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

  const api = createServerApiClient();

  /* Las tres de contexto salen en paralelo con la principal, con `limit=1`
     —solo se mira el `total`— y cada una degrada por su cuenta. Ver la nota
     equivalente en la pantalla de Cuentas.
     ⚠️ La principal también lleva su propio `catch`, por la misma razón que
     ahí: sin él, admin-service caído tumbaba la pantalla entera con un 500. */
  const [listado, enTotal, suspendidos, archivados] = await Promise.all([
    api.get<AdminProjectPage>(`/admin/projects?${params.toString()}`).catch(() => null),
    contar(api, '/admin/projects?limit=1'),
    contar(api, '/admin/projects?status=SUSPENDED&limit=1'),
    contar(api, '/admin/projects?status=DELETED&limit=1'),
  ]);

  const items = listado?.items ?? [];
  const total = listado?.total ?? 0;

  /** Conserva los filtros al cambiar de página: perderlos es el fallo clásico. */
  const hrefFor = (destino: number) => {
    const otros = new URLSearchParams();
    if (busqueda) otros.set('q', busqueda);
    if (estadoFiltro) otros.set('estado', estadoFiltro);
    if (destino > 1) otros.set('page', String(destino));
    const qs = otros.toString();
    return qs ? `/admin/projects?${qs}` : '/admin/projects';
  };

  return (
    <AppHeader title="Administración">
      <div data-tone="dark" className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-16">
        <AdminHeader
          titulo="Proyectos"
          descripcion="El inventario completo, archivados incluidos. Suspender y archivar son reversibles; el borrado de verdad es del dueño y no vive aquí."
          cifras={[
            { etiqueta: 'En total', valor: enTotal, tono: colors.textPrimary },
            { etiqueta: 'Suspendidos', valor: suspendidos, tono: colors.error },
            { etiqueta: 'Archivados', valor: archivados, tono: colors.warning },
          ]}
        />

        <FilterBar
          basePath="/projects"
          busqueda={busqueda}
          placeholder="Nombre o descripción del proyecto"
          filtros={FILTROS}
          filtroActivo={estadoFiltro}
          idTodos="todos"
          total={total}
          nombreSingular="proyecto"
          nombrePlural="proyectos"
        />

        {listado === null ? (
          <p className="rounded-xl border border-white/10 bg-[#191919] px-6 py-16 text-center font-sans text-sm text-error">
            No se pudieron cargar los proyectos. Vuelve a intentarlo.
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-[#191919] px-6 py-16 text-center font-sans text-sm text-white/50">
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

/** Cuántas filas hay, sin traérselas. Ver la gemela en la pantalla de Cuentas. */
function contar(
  api: ReturnType<typeof createServerApiClient>,
  ruta: string,
): Promise<number | null> {
  return api
    .get<AdminProjectPage>(ruta)
    .then((respuesta) => respuesta.total)
    .catch(() => null);
}
