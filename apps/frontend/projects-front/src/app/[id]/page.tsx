import {
  APP_NAV_ITEMS,
  AppLayout,
  type EffectivePermissions,
  LogoutButton,
  type Paginated,
  type ProjectDetail,
  type ProjectInvitation,
  type ProjectMember,
  TabNav,
  type UserProfile,
  displayName,
  tabLinkClasses,
} from '@praxis/commons';
import { createServerApiClient, loadCurrentUser } from '@praxis/commons/auth';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ProjectHeader } from '@/components/organisms/ProjectHeader';
import { ProjectMembers } from '@/components/organisms/ProjectMembers';
import { ProjectRoles } from '@/components/organisms/ProjectRoles';
import { WorkspaceCanvas } from '@/components/organisms/WorkspaceCanvas';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; ws?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const project = await createServerApiClient().get<ProjectDetail>(`/projects/${id}`);
    return { title: project.name };
  } catch {
    return { title: 'Proyecto' };
  }
}

const TABS = [
  { id: 'espacios', label: 'Espacios' },
  { id: 'equipo', label: 'Equipo' },
  { id: 'roles', label: 'Roles' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/**
 * Detalle de un proyecto.
 *
 * Las secciones van en **pestañas** y no apiladas: cada una trae su cabecera,
 * su acción y su estado vacío, así que apilarlas obligaba a bajar mucho para
 * ver el equipo y ninguna se leía como la principal.
 *
 * La pestaña activa vive en la URL (`?tab=`), no en estado de cliente: así se
 * puede compartir un enlace directo al equipo, el botón atrás funciona y la
 * página sigue renderizándose entera en el servidor.
 *
 * `permissions/me` decide qué se enseña **antes** de intentarlo. Hasta que ese
 * endpoint existió, la única forma de saber si podías algo era pulsar y
 * comerte un 403.
 */
export default async function ProjectDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { tab, ws } = await searchParams;
  const { userId, profile } = await loadCurrentUser();
  const api = createServerApiClient();

  const activeTab: TabId = TABS.some((t) => t.id === tab) ? (tab as TabId) : 'espacios';

  const [project, effective, members] = await Promise.all([
    api.get<ProjectDetail>(`/projects/${id}`),
    api.get<EffectivePermissions>(`/projects/${id}/permissions/me`),
    api.get<ProjectMember[]>(`/projects/${id}/members`).catch(() => [] as ProjectMember[]),
  ]);

  const can = effective.permissions;

  /**
   * El directorio solo hace falta para la pestaña de equipo: cruzar `userId`
   * con nombre y correo, y ofrecer candidatos. Se pide únicamente ahí.
   */
  const [directory, invitations] =
    activeTab === 'equipo'
      ? await Promise.all([
          api
            .get<Paginated<UserProfile>>('/users?limit=100')
            .catch(() => ({ items: [] as UserProfile[], total: 0 })),
          /* Solo quien gestiona el equipo puede listarlas; para el resto es un
             403 esperado y la sección simplemente no las muestra. */
          api
            .get<ProjectInvitation[]>(`/projects/${id}/invitations`)
            .catch(() => [] as ProjectInvitation[]),
        ])
      : [{ items: [] as UserProfile[], total: 0 }, [] as ProjectInvitation[]];

  const boardCount = project.workspaces.reduce(
    (total, workspace) => total + workspace.boards.length,
    0,
  );

  /**
   * Espacio abierto. Sin `?ws=` —o si apunta a uno que ya no existe, por
   * ejemplo tras borrarlo— se cae al primero, para que la pestaña nunca quede
   * en blanco teniendo espacios que enseñar.
   */
  const activeWorkspace =
    project.workspaces.find((workspace) => workspace.id === ws) ?? project.workspaces[0] ?? null;

  const counts: Record<TabId, number> = {
    espacios: project.workspaces.length,
    equipo: members.length,
    roles: project.roles.length,
  };

  return (
    <AppLayout
      navItems={APP_NAV_ITEMS}
      activePath="/projects"
      title={project.name}
      user={{ name: displayName(profile), email: profile.credential.email }}
      footerSlot={<LogoutButton />}
    >
      <div className="flex flex-col gap-6">
        <ProjectHeader
          project={project}
          isOwner={effective.isOwner}
          memberCount={members.length}
          boardCount={boardCount}
        />

        <TabNav
          tabs={TABS.map((t) => ({ ...t, count: counts[t.id] }))}
          activeId={activeTab}
          renderLink={(t, isActive, content) => (
            <Link
              key={t.id}
              /* Misma zona: sin el basePath, Next añade `/projects`. */
              href={`/${project.id}?tab=${t.id}`}
              aria-current={isActive ? 'page' : undefined}
              className={tabLinkClasses(isActive)}
              /* Sustituye la entrada en el historial: cambiar de pestaña no
                 debería llenar el botón atrás. */
              replace
            >
              {content}
            </Link>
          )}
        />

        {activeTab === 'espacios' && (
          <WorkspaceCanvas
            projectId={project.id}
            workspaces={project.workspaces}
            activeWorkspace={activeWorkspace}
            canManage={can.canCreateBoard}
          />
        )}

        {activeTab === 'equipo' && (
          <ProjectMembers
            projectId={project.id}
            members={members}
            roles={project.roles}
            usersById={new Map(directory.items.map((user) => [user.id, user]))}
            candidates={directory.items}
            ownerId={project.ownerId}
            canManage={can.canManageMembers}
            invitations={invitations}
            projectName={project.name}
            currentUserId={userId}
          />
        )}

        {activeTab === 'roles' && (
          <ProjectRoles
            projectId={project.id}
            roles={project.roles}
            members={members}
            canManage={can.canManageRoles}
          />
        )}
      </div>
    </AppLayout>
  );
}
