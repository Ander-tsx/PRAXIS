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
  type UserProfile,
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

  /**
   * El equipo de cada proyecto, para las caras de la tarjeta. **En una
   * petición.**
   *
   * ## Esto eran 1 + 12 + K peticiones, y ahora son 2
   *
   * `GET /projects` no devolvía a nadie —solo `_count.members`— así que había
   * que pedir `GET /projects/:id/members` por proyecto (doce en una página) y
   * después el perfil de cada id, uno a uno, que es donde vive la foto.
   *
   * Se cerró por el lado del backend, que era donde estaba el problema
   * (PENDIENTES-BACKEND §24, cerrado):
   *
   * | Antes | Ahora |
   * |---|---|
   * | `GET /projects` | igual, pero ya trae `members` con los **cuatro primeros** ids de cada proyecto |
   * | `GET /projects/:id/members` ×12 | — |
   * | `GET /users/:id` ×K | `GET /users?ids=a,b,c` ×1 |
   *
   * ⚠️ **`members` son cuatro, no el equipo entero.** Es justo lo que la tarjeta
   * enseña antes del «+N», y ese resto sale de `_count.members`, que sigue
   * siendo el total de verdad. Contar `members.length` para saber cuánta gente
   * hay daría cuatro como mucho.
   */
  const idsDePersonas = [
    ...new Set([
      ...page.items.flatMap((project) => project.members?.map((m) => m.userId) ?? []),
      /* El dueño entra aparte: nace como miembro (trampa #7 de CLAUDE.md), pero
         con `take: 4` puede quedarse fuera del recorte en un proyecto con mucha
         gente, y su propia tarjeta saldría sin su cara. */
      ...page.items.map((project) => project.ownerId),
    ]),
  ];

  /**
   * Una sola petición para todos los perfiles de la página.
   *
   * Los ids van **deduplicados entre todos los proyectos**: en un equipo real
   * las mismas personas están en casi todos, así que la lista es del tamaño del
   * equipo, no de la suma de miembros.
   *
   * Y **degrada**: si esta falla, `personasPorId` queda vacío y cada tarjeta
   * vuelve a enseñar el número de miembros, que es exactamente lo que enseñaba
   * antes de que hubiera caras. Un directorio que no se puede resolver no tumba
   * la rejilla.
   */
  const directorio = idsDePersonas.length
    ? await api
        .get<Paginated<UserProfile>>(`/users?ids=${idsDePersonas.join(',')}`)
        .catch(() => null)
    : null;

  const personasPorId = new Map((directorio?.items ?? []).map((user) => [user.id, user]));

  /**
   * Proyecto → sus personas, ya resueltas y **contigo la primera**.
   *
   * El orden es el mismo criterio que la tarjeta de tarea: reconocerte a ti es
   * lo más rápido, y el círculo rojo de `Avatar` significa «eres tú» en todo el
   * producto.
   *
   * `null` cuando no hay nada que enseñar —el backend no mandó `members`, o el
   * directorio no se pudo pedir— y entonces la tarjeta cae al contador.
   */
  const equiposPorProyecto = new Map<string, UserProfile[] | null>(
    page.items.map((project) => {
      if (!project.members) return [project.id, null];

      const ids = [...new Set([...project.members.map((m) => m.userId), project.ownerId])];
      const perfiles = ids
        .map((id) => personasPorId.get(id))
        .filter((u): u is UserProfile => u !== undefined);

      if (perfiles.length === 0) return [project.id, null];

      return [
        project.id,
        [...perfiles].sort((a, b) => Number(b.id === userId) - Number(a.id === userId)),
      ];
    }),
  );

  /** El `href` de cada salto, conservando la búsqueda. Perderla es el fallo clásico. */
  const hrefDePagina = (n: number) => {
    const otros = new URLSearchParams();
    if (search) otros.set('q', search);
    if (n > 1) otros.set('page', String(n));
    const cadena = otros.toString();
    return cadena ? `/projects?${cadena}` : '/projects';
  };

  return (
    <AppHeader title="Proyectos">
      {/* Sin «Tus proyectos» en un `h2` debajo de «Proyectos»: eran dos títulos
          y una frase en cursiva antes del primer proyecto, en una pantalla a la
          que se llega pulsando «Proyectos» en la barra lateral. Lo que decía la
          frase —de quién son estos proyectos— se dobló en la línea del
          contador, dentro de `ProjectGrid`. */}
      <div className="flex flex-col gap-6">
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
              equiposPorProyecto={equiposPorProyecto}
              crearSlot={
                <CreateProjectDialog
                  action={createProjectAction}
                  borradorAction={borradorDePlantillaAction}
                  aplicarAction={crearProyectoDesdePlantillaAction}
                  triggerVariant="tarjeta"
                />
              }
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
