import {
  APP_NAV_ITEMS,
  AppLayout,
  DUE_SOON_DAYS,
  LogoutButton,
  type MyInvitation,
  type Paginated,
  type Project,
  type Task,
  displayName,
  dueState,
} from '@praxis/commons';
import type { Metadata } from 'next';
import { CreateProjectDialog } from '@/components/organisms/CreateProjectDialog';
import { DashboardEmptyState } from '@/components/organisms/DashboardEmptyState';
import { DashboardMetrics } from '@/components/organisms/DashboardMetrics';
import { DashboardWelcome } from '@/components/organisms/DashboardWelcome';
import { MyInvitations } from '@/components/organisms/MyInvitations';
import { ProjectList } from '@/components/organisms/ProjectList';
import { TaskAlerts } from '@/components/organisms/TaskAlerts';
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
  /**
   * Una sola petición cubre los dos avisos.
   *
   * Se pide la ventana entera —hasta dentro de `DUE_SOON_DAYS` días— y el
   * reparto entre «vencidas» y «vencen pronto» se hace aquí comparando con
   * ahora. Pedirlas por separado serían dos viajes para los mismos datos.
   */
  const dueBefore = new Date(Date.now() + DUE_SOON_DAYS * 86_400_000).toISOString();

  const [page, invitations, dueTasks] = await Promise.all([
    api.get<Paginated<Project>>('/projects'),
    /* Si fallan, el panel sigue siendo útil: no se tumba por una insignia. */
    api.get<MyInvitation[]>('/me/invitations').catch(() => [] as MyInvitation[]),
    api
      /* `excludeDone`: una tarea que ya está en la columna de cierre —la verde—
         no es un pendiente por mucho que su fecha haya pasado. Sin esto, cerrar
         el trabajo no quitaba el aviso y el panel mentía. */
      .get<Paginated<Task>>(
        `/me/tasks?dueBefore=${encodeURIComponent(dueBefore)}&excludeDone=true&limit=50`,
      )
      .catch(() => ({ items: [] as Task[], total: 0 })),
  ]);
  const projects = page.items;

  /**
   * Vencidas y por vencer, separadas.
   *
   * `dueState` decide con la misma regla que usa la tarjeta del tablero, así
   * que un aviso y su tarjeta nunca se contradicen. Las sin fecha no llegan
   * aquí: `dueBefore` ya las deja fuera en el backend.
   */
  const overdue = dueTasks.items.filter((task) => dueState(task.dueDate) === 'overdue');
  const dueSoon = dueTasks.items.filter((task) => dueState(task.dueDate) === 'soon');

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

        {/* Antes que nada: es lo único que espera una decisión, y el único
            sitio donde se entera de que le han invitado. */}
        <MyInvitations invitations={invitations} />

        {/* Después de las invitaciones: aquellas esperan una decisión, esto
            solo avisa. Pero antes de las métricas, que no urgen. */}
        <TaskAlerts
          overdue={overdue}
          soon={dueSoon}
          projectsById={new Map(projects.map((project) => [project.id, project]))}
          soonDays={DUE_SOON_DAYS}
        />

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
