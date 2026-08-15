import {
  borradorDePlantillaAction,
  crearProyectoDesdePlantillaAction,
  createProjectAction,
} from '@/app/actions';
import { ProjectGrid } from '@/components/organisms/ProjectGrid';
import { ProjectsEmptyState } from '@/components/organisms/ProjectsEmptyState';
import {
  AppHeader,
  CreateProjectDialog,
  type Paginated,
  Pagination,
  type Project,
} from '@praxis/commons';
import { createServerApiClient, loadCurrentUser } from '@praxis/commons/auth';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Proyectos',
};

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

/**
 * Cuántos proyectos por página.
 *
 * ⚠️ **Antes se pedía sin `limit` y no era gratis.** El backend cae a 20 por
 * defecto, así que con 21 proyectos el último no se veía y no había forma de
 * llegar a él: no era una precaución para el futuro, era una lista truncada en
 * silencio. Se manda explícito para que el número esté a la vista de quien lea
 * esto y no escondido en un `?? 20` de otro repositorio.
 */
const POR_PAGINA = 12;

/**
 * Lista de proyectos.
 *
 * Server Component: aquí vive el fetch. La búsqueda va por query param y la
 * resuelve el backend (`GET /projects?search=`), no un filtro en memoria: la
 * lista está paginada y filtrar aquí solo miraría la página actual.
 *
 * ⚠️ En Next 16 `searchParams` es una promesa y hay que esperarla.
 */
export default async function ProjectsPage({ searchParams }: PageProps) {
  const { q, page: pageParam } = await searchParams;
  const { userId } = await loadCurrentUser();
  const api = createServerApiClient();

  const search = q?.trim() ?? '';
  /* Un `?page=abc` o `?page=-1` escrito a mano cae a la primera en vez de
     llegar al backend y dar un 400 sobre una pantalla en blanco. */
  const pagina = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);

  const params = new URLSearchParams({
    page: String(pagina),
    limit: String(POR_PAGINA),
  });
  if (search) params.set('search', search);

  const page = await api.get<Paginated<Project>>(`/projects?${params}`);

  /** El `href` de cada salto, conservando la búsqueda. Perderla es el fallo clásico. */
  const hrefDePagina = (n: number) => {
    const otros = new URLSearchParams();
    if (search) otros.set('q', search);
    if (n > 1) otros.set('page', String(n));
    const cadena = otros.toString();
    return cadena ? `/projects?${cadena}` : '/projects';
  };

  return (
    <AppHeader
      title="Proyectos"
      headerSlot={
        <CreateProjectDialog
          action={createProjectAction}
          borradorAction={borradorDePlantillaAction}
          aplicarAction={crearProyectoDesdePlantillaAction}
        />
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-3xl text-text-primary">Tus proyectos</h2>
          <p className="font-serif text-lg italic text-text-secondary">
            Los que has creado y aquellos donde te han añadido.
          </p>
        </div>

        {page.items.length === 0 && !search ? (
          <ProjectsEmptyState
            action={
              <CreateProjectDialog
                action={createProjectAction}
                borradorAction={borradorDePlantillaAction}
                aplicarAction={crearProyectoDesdePlantillaAction}
                triggerLabel="Crear mi primer proyecto"
                triggerSize="lg"
              />
            }
          />
        ) : (
          <>
            <ProjectGrid
              projects={page.items}
              total={page.total}
              currentUserId={userId}
              search={search}
            />
            <Pagination
              page={pagina}
              limit={POR_PAGINA}
              total={page.total}
              hrefFor={hrefDePagina}
              nombre="proyectos"
            />
          </>
        )}
      </div>
    </AppHeader>
  );
}
