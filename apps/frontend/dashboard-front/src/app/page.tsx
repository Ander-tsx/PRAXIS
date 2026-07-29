import {
  APP_NAV_ITEMS,
  AppLayout,
  LogoutButton,
  type Paginated,
  type Project,
  displayName,
} from '@praxis/commons';
import type { Metadata } from 'next';
import { CreateProjectDialog } from '@/components/organisms/CreateProjectDialog';
import { DashboardEmptyState } from '@/components/organisms/DashboardEmptyState';
import { DashboardMetrics } from '@/components/organisms/DashboardMetrics';
import { DashboardWelcome } from '@/components/organisms/DashboardWelcome';
import { ProjectList } from '@/components/organisms/ProjectList';
import { createServerApiClient, loadCurrentUser } from '@praxis/commons/auth';

export const metadata: Metadata = {
  title: 'Panel',
};

/**
 * Panel del área privada.
 *
 * Server Component: aquí vive todo el fetch. Los organismos reciben datos por
 * props y no saben de dónde salen.
 *
 * La ruta la protege `src/proxy.ts`; `loadCurrentUser` vuelve a exigir sesión
 * porque la autorización nunca debe depender de una sola capa.
 */
export default async function DashboardPage() {
  const { userId, profile, roles } = await loadCurrentUser();
  const api = createServerApiClient();

  /**
   * Ya viene filtrado por el backend: proyectos donde el usuario es **dueño o
   * miembro**. Antes había que filtrar aquí por `ownerId` porque `GET /projects`
   * devolvía todos los del sistema, y el coste era que no aparecían los
   * proyectos a los que te habían añadido.
   */
  const page = await api.get<Paginated<Project>>('/projects');
  const projects = page.items;

  const owned = projects.filter((project) => project.ownerId === userId);

  const totals = projects.reduce(
    (acc, project) => ({
      workspaces: acc.workspaces + project._count.workspaces,
      members: acc.members + project._count.members,
    }),
    { workspaces: 0, members: 0 },
  );

  const name = displayName(profile);

  return (
    <AppLayout
      navItems={APP_NAV_ITEMS}
      activePath="/dashboard"
      title="Panel"
      user={{ name, email: profile.credential.email }}
      headerSlot={projects.length > 0 ? <CreateProjectDialog /> : undefined}
      footerSlot={<LogoutButton />}
    >
      <div className="flex flex-col gap-8">
        <DashboardWelcome name={name} email={profile.credential.email} roles={roles} />

        {projects.length === 0 ? (
          <DashboardEmptyState
            action={<CreateProjectDialog triggerLabel="Crear mi primer proyecto" triggerSize="lg" />}
          />
        ) : (
          <>
            <DashboardMetrics
              projects={projects.length}
              owned={owned.length}
              workspaces={totals.workspaces}
              members={totals.members}
            />
            <ProjectList projects={projects} currentUserId={userId} />
          </>
        )}
      </div>
    </AppLayout>
  );
}
