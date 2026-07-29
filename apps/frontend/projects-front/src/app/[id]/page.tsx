import {
  APP_NAV_ITEMS,
  AppLayout,
  type EffectivePermissions,
  type Label,
  LogoutButton,
  type Paginated,
  type ProjectDetail,
  type ProjectInvitation,
  type ProjectMember,
  TabNav,
  type Task,
  type UserProfile,
  displayName,
  tabLinkClasses,
} from '@praxis/commons';
import { createServerApiClient, loadCurrentUser } from '@praxis/commons/auth';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ProjectHeader } from '@/components/organisms/ProjectHeader';
import { ProjectLabels } from '@/components/organisms/ProjectLabels';
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
  { id: 'etiquetas', label: 'Etiquetas' },
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

  const [project, effective, members, labels] = await Promise.all([
    api.get<ProjectDetail>(`/projects/${id}`),
    api.get<EffectivePermissions>(`/projects/${id}/permissions/me`),
    api.get<ProjectMember[]>(`/projects/${id}/members`).catch(() => [] as ProjectMember[]),
    /* Hacen falta en dos pestañas —para gestionarlas y para ponerlas en una
       tarea—, así que se piden siempre; son una fila por etiqueta. */
    api.get<Label[]>(`/projects/${id}/labels`).catch(() => [] as Label[]),
  ]);

  const can = effective.permissions;

  /**
   * El directorio hace falta en las dos pestañas que enseñan personas: equipo
   * cruza `userId` con nombre y correo, y espacios lo necesita para las
   * iniciales de los encargados y para el selector del diálogo de tarea.
   */
  const directory =
    activeTab === 'equipo' || activeTab === 'espacios'
      ? await api
          .get<Paginated<UserProfile>>('/users?limit=100')
          .catch(() => ({ items: [] as UserProfile[], total: 0 }))
      : { items: [] as UserProfile[], total: 0 };

  const invitations =
    activeTab === 'equipo'
      ? /* Solo quien gestiona el equipo puede listarlas; para el resto es un
           403 esperado y la sección simplemente no las muestra. */
        await api
          .get<ProjectInvitation[]>(`/projects/${id}/invitations`)
          .catch(() => [] as ProjectInvitation[])
      : ([] as ProjectInvitation[]);

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

  /**
   * Tareas del espacio abierto, un `GET` por tablero.
   *
   * No hay una ruta que devuelva las de un espacio entero —las tareas cuelgan
   * del tablero—, así que se piden en paralelo y solo las del espacio visible:
   * pedir las de todos los espacios sería trabajo tirado, porque solo se ve uno.
   *
   * Un tablero que falle cae a lista vacía en vez de tumbar la página: perder
   * un tablero es mucho mejor que perder el proyecto entero.
   */
  const visibleBoards = activeTab === 'espacios' ? (activeWorkspace?.boards ?? []) : [];
  const boardTasks = await Promise.all(
    visibleBoards.map((board) =>
      api
        .get<Paginated<Task>>(`/boards/${board.id}/tasks?limit=100`)
        .then((page) => [board.id, page.items] as const)
        .catch(() => [board.id, [] as Task[]] as const),
    ),
  );
  const tasksByBoard = new Map(boardTasks);

  /** Quién puede aparecer como encargado: los miembros más el dueño. */
  const memberIds = new Set([...members.map((member) => member.userId), project.ownerId]);
  const assignableMembers = directory.items.filter((user) => memberIds.has(user.id));
  const usersById = new Map(directory.items.map((user) => [user.id, user]));

  const counts: Record<TabId, number> = {
    espacios: project.workspaces.length,
    equipo: members.length,
    etiquetas: labels.length,
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
            tasksByBoard={tasksByBoard}
            members={assignableMembers}
            labels={labels}
            usersById={usersById}
            canCreateTask={can.canCreateTask}
            canEditTask={can.canEditTask}
            canDeleteTask={can.canDeleteTask}
          />
        )}

        {activeTab === 'equipo' && (
          <ProjectMembers
            projectId={project.id}
            members={members}
            roles={project.roles}
            usersById={usersById}
            candidates={directory.items}
            ownerId={project.ownerId}
            canManage={can.canManageMembers}
            invitations={invitations}
            projectName={project.name}
            currentUserId={userId}
          />
        )}

        {activeTab === 'etiquetas' && (
          <ProjectLabels projectId={project.id} labels={labels} canManage={can.canEditTask} />
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
