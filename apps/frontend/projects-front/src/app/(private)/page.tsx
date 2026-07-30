import {
  AppHeader,
  type Paginated,
  type Project,
} from '@praxis/commons';
import { createServerApiClient, loadCurrentUser } from '@praxis/commons/auth';
import type { Metadata } from 'next';
import { CreateProjectDialog } from '@/components/organisms/CreateProjectDialog';
import { ProjectGrid } from '@/components/organisms/ProjectGrid';
import { ProjectsEmptyState } from '@/components/organisms/ProjectsEmptyState';

export const metadata: Metadata = {
  title: 'Proyectos',
};

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

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
  const { q } = await searchParams;
  const { userId } = await loadCurrentUser();
  const api = createServerApiClient();

  const search = q?.trim() ?? '';
  const page = await api.get<Paginated<Project>>(
    search ? `/projects?search=${encodeURIComponent(search)}` : '/projects',
  );

  return (
    <AppHeader title="Proyectos" headerSlot={<CreateProjectDialog />}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-3xl text-text-primary">Tus proyectos</h2>
          <p className="font-serif text-lg italic text-text-secondary">
            Los que has creado y aquellos donde te han añadido.
          </p>
        </div>

        {page.items.length === 0 && !search ? (
          <ProjectsEmptyState action={<CreateProjectDialog triggerLabel="Crear mi primer proyecto" triggerSize="lg" />} />
        ) : (
          <ProjectGrid
            projects={page.items}
            total={page.total}
            currentUserId={userId}
            search={search}
          />
        )}
      </div>
    </AppHeader>
  );
}
