import {
  APP_NAV_ITEMS,
  AppLayout,
  type EffectivePermissions,
  LogoutButton,
  type Paginated,
  type ProjectDetail,
  type ProjectMember,
  type UserProfile,
  displayName,
} from '@praxis/commons';
import { createServerApiClient, loadCurrentUser } from '@praxis/commons/auth';
import type { Metadata } from 'next';
import { ProjectHeader } from '@/components/organisms/ProjectHeader';
import { ProjectMembers } from '@/components/organisms/ProjectMembers';
import { ProjectRoles } from '@/components/organisms/ProjectRoles';
import { ProjectWorkspaces } from '@/components/organisms/ProjectWorkspaces';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const project = await createServerApiClient().get<ProjectDetail>(`/projects/${id}`);
    return { title: project.name };
  } catch {
    // Sin permiso o inexistente: el título no es el sitio para explicarlo.
    return { title: 'Proyecto' };
  }
}

/**
 * Detalle de un proyecto: espacios, roles y equipo.
 *
 * Server Component; todo el fetch vive aquí.
 *
 * La clave está en `permissions/me`: **la interfaz decide qué enseñar antes de
 * intentarlo.** Hasta que ese endpoint existió, la única forma de saber si
 * podías algo era pulsar el botón y comerte un 403.
 */
export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { profile } = await loadCurrentUser();
  const api = createServerApiClient();

  /**
   * En paralelo. `members` degrada a lista vacía porque no es esencial para
   * pintar la pantalla; el proyecto y los permisos sí lo son y se dejan
   * explotar hacia el `error.tsx`.
   */
  const [project, effective, members] = await Promise.all([
    api.get<ProjectDetail>(`/projects/${id}`),
    api.get<EffectivePermissions>(`/projects/${id}/permissions/me`),
    api.get<ProjectMember[]>(`/projects/${id}/members`).catch(() => [] as ProjectMember[]),
  ]);

  /**
   * Los miembros llegan con `userId` pero sin nombre ni correo, así que hay que
   * cruzarlos con `GET /users`. Se pide una sola vez y se indexa.
   *
   * No es ideal —traería toda la página de usuarios aunque el proyecto tenga
   * dos miembros—, pero no hay endpoint que resuelva varios ids de golpe.
   */
  const directory = await api
    .get<Paginated<UserProfile>>('/users?limit=100')
    .catch(() => ({ items: [] as UserProfile[], total: 0 }));

  const usersById = new Map(directory.items.map((user) => [user.id, user]));

  const can = effective.permissions;

  return (
    <AppLayout
      navItems={APP_NAV_ITEMS}
      activePath="/projects"
      title={project.name}
      user={{ name: displayName(profile), email: profile.credential.email }}
      footerSlot={<LogoutButton />}
    >
      <div className="flex flex-col gap-10">
        <ProjectHeader
          project={project}
          isOwner={effective.isOwner}
          memberCount={members.length}
        />

        <ProjectWorkspaces
          projectId={project.id}
          workspaces={project.workspaces}
          canCreate={can.canCreateBoard}
        />

        <ProjectRoles
          projectId={project.id}
          roles={project.roles}
          members={members}
          canManage={can.canManageRoles}
        />

        <ProjectMembers
          projectId={project.id}
          members={members}
          roles={project.roles}
          usersById={usersById}
          candidates={directory.items}
          ownerId={project.ownerId}
          canManage={can.canManageMembers}
        />
      </div>
    </AppLayout>
  );
}
