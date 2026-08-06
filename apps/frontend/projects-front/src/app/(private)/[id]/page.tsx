import {
  AppHeader,
  type EffectivePermissions,
  type Label,
  type MyInvitation,
  type Paginated,
  type ProjectDetail,
  type ProjectInvitation,
  type ProjectMember,
  TabNav,
  type Task,
  type UserProfile,
  tabLinkClasses,
  projectPath,
} from '@praxis/commons';
import { createServerApiClient, loadCurrentUser } from '@praxis/commons/auth';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PendingInvitationGate } from '@/components/organisms/PendingInvitationGate';
import { ProjectHeader } from '@/components/organisms/ProjectHeader';
import { ProjectLabels } from '@/components/organisms/ProjectLabels';
import { ProjectMembers } from '@/components/organisms/ProjectMembers';
import { ProjectRoles } from '@/components/organisms/ProjectRoles';
import { SuspendedProjectNotice } from '@/components/organisms/SuspendedProjectNotice';
import { WorkspaceCanvas } from '@/components/organisms/WorkspaceCanvas';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; ws?: string; board?: string; task?: string }>;
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
  const { tab, ws, board, task } = await searchParams;
  const { userId } = await loadCurrentUser();
  const api = createServerApiClient();

  const activeTab: TabId = TABS.some((t) => t.id === tab) ? (tab as TabId) : 'espacios';

  /**
   * El proyecto, o la puerta de la invitación.
   *
   * Un enlace de invitación apunta aquí, pero **la membresía se crea al
   * aceptar**: hasta entonces `GET /projects/:id` responde 403 y la página
   * moría con un error por algo que no lo era. Si el fallo coincide con una
   * invitación pendiente, lo que toca no es un error sino el botón de aceptar.
   */
  const project = await api.get<ProjectDetail>(`/projects/${id}`).catch(() => null);

  if (!project) {
    const invitation = await api
      .get<MyInvitation[]>('/me/invitations')
      .then((list) =>
        /* `id` es lo que venga en la URL: puede ser el UUID o el slug, así que
           se comparan los dos. */
        list.find((candidate) => candidate.project.id === id || candidate.project.slug === id),
      )
      .catch(() => undefined);

    // Sin invitación no hay nada que ofrecer: que suba el error de siempre.
    if (!invitation) return notFound();

    return (
      <AppHeader title="Invitación">
        <PendingInvitationGate invitation={invitation} />
      </AppHeader>
    );
  }

  const [effective, members, labels] = await Promise.all([
    api.get<EffectivePermissions>(`/projects/${project.id}/permissions/me`),
    api.get<ProjectMember[]>(`/projects/${project.id}/members`).catch(() => [] as ProjectMember[]),
    /* Hacen falta en dos pestañas —para gestionarlas y para ponerlas en una
       tarea—, así que se piden siempre; son una fila por etiqueta. */
    api
      .get<Label[]>(`/projects/${project.id}/labels`)
      .catch(() => [] as Label[]),
  ]);

  const can = effective.permissions;

  /**
   * ¿Está suspendido?
   *
   * Se lee de `permissions/me` y no de `project.status` porque **es la misma
   * respuesta que ya trae el mapa recortado**: si vinieran de sitios distintos
   * podrían discrepar —una caché de 5 minutos por medio— y saldría el caso peor de
   * todos, una pantalla sin botones y sin aviso.
   *
   * No hace falta apagar nada más: el mapa llega con todas las escrituras en `false`,
   * así que cada organismo esconde lo suyo por la vía de siempre.
   */
  const suspendido = effective.projectStatus === 'SUSPENDED';

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
          .get<ProjectInvitation[]>(`/projects/${project.id}/invitations`)
          .catch(() => [] as ProjectInvitation[])
      : ([] as ProjectInvitation[]);

  const boardCount = project.workspaces.reduce(
    (total, workspace) => total + workspace.boards.length,
    0,
  );

  /**
   * Las columnas del proyecto entero.
   *
   * Solo la necesita la confirmación de borrado, que tiene que decir cuánto se
   * va con números reales. Sale del árbol que ya está en memoria, así que no
   * cuesta ninguna petición; las tareas sí, y por eso se cuentan al abrir el
   * diálogo y no aquí (§24.3).
   */
  const columnCount = project.workspaces.reduce(
    (total, workspace) =>
      total + workspace.boards.reduce((sum, board) => sum + board.columns.length, 0),
    0,
  );

  /**
   * Espacio abierto.
   *
   * Tres formas de decidirlo, en orden:
   *
   * 1. `?ws=` — lo eligió la persona en el selector.
   * 2. `?board=` — **viene de fuera**, típicamente de un aviso del panel. El
   *    aviso solo conoce el tablero de la tarea, así que el espacio se resuelve
   *    aquí buscando cuál lo contiene. Sin esto, una tarea del espacio B abría
   *    el espacio A y parecía que el enlace estaba roto.
   * 3. El primero, para que la pestaña nunca quede en blanco teniendo espacios.
   *
   * `?ws=` gana sobre `?board=` porque si los dos vienen, el explícito es el
   * que acaba de pulsar quien mira.
   */
  /**
   * ⚠️ **Si llega `?task=` sin `?board=`, hay que preguntar por la tarea.**
   *
   * Los avisos de vencimiento mandan los dos porque conocen el tablero. Los de
   * notificación solo guardan la tarea, y sin el tablero se abría siempre el
   * primer espacio: una tarea del espacio «QA» aterrizaba en «Desarrollo» y sin
   * diálogo, porque `ColumnTasks` solo abre la tarea si está en su columna.
   *
   * Se resuelve aquí y no guardando el `boardId` en el aviso: así funciona
   * cualquier enlace con `?task=`, venga de donde venga, y una tarea que cambió
   * de tablero sigue llevando al sitio correcto en vez de al de entonces.
   */
  const boardOfTask =
    task && !board
      ? await api
          .get<Task>(`/tasks/${task}`)
          .then((found) => found.boardId)
          .catch(() => undefined)
      : undefined;

  const targetBoard = board ?? boardOfTask;

  const workspaceOfBoard = targetBoard
    ? project.workspaces.find((workspace) =>
        workspace.boards.some((candidate) => candidate.id === targetBoard),
      )
    : undefined;

  const activeWorkspace =
    project.workspaces.find((workspace) => workspace.id === ws) ??
    workspaceOfBoard ??
    project.workspaces[0] ??
    null;

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
    <AppHeader title={project.name}>
      <div className="flex flex-col gap-6">
        {/* Antes de la cabecera: es la condición que explica todo lo que sigue. */}
        {suspendido && (
          <SuspendedProjectNotice reason={effective.suspendedReason} isOwner={effective.isOwner} />
        )}

        <ProjectHeader
          project={project}
          isOwner={effective.isOwner}
          memberCount={members.length}
          boardCount={boardCount}
          columnCount={columnCount}
          labelCount={labels.length}
          /* Se lee del mapa efectivo, no de `isOwner`: un rol con
             `canDeleteProject` también puede, y no vamos a provocar un 403 para
             averiguarlo. */
          canDelete={can.canDeleteProject}
          /* `canEditProject`, permiso propio desde esta sesión: el `PATCH`
             pedía `canEditBoard`, que es de otra cosa. */
          canEdit={can.canEditProject}
        />

        <TabNav
          tabs={TABS.map((t) => ({ ...t, count: counts[t.id] }))}
          activeId={activeTab}
          renderLink={(t, isActive, content) => (
            <Link
              key={t.id}
              /* Misma zona: sin el basePath, Next añade `/projects`.
                 Con el `id` en vez del `slug`, cambiar de pestaña reescribía
                 una URL bonita por el UUID. */
              href={projectPath(project, { tab: t.id as TabId })}
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
            projectSlug={project.slug}
            workspaces={project.workspaces}
            activeWorkspace={activeWorkspace}
            canManage={can.canCreateBoard}
            /* Las columnas tienen sus propios permisos, y hasta ahora todo
               colgaba de `canCreateBoard`: quien podía crear columnas pero no
               tableros no veía el botón. `canEditColumn` además estrena uso: no
               lo pedía ningún endpoint hasta el `PATCH` de esta sesión. */
            canCreateColumn={can.canCreateColumn}
            canEditColumn={can.canEditColumn}
            canDeleteColumn={can.canDeleteColumn}
            tasksByBoard={tasksByBoard}
            members={assignableMembers}
            labels={labels}
            usersById={usersById}
            currentUserId={userId}
            canCreateTask={can.canCreateTask}
            /* Mover no es editar: quien solo tiene `canMoveTask` arrastra
               tarjetas pero abre el diálogo en modo lectura. */
            canMoveTask={can.canMoveTask}
            /* Llega de un aviso del panel: la tarea se abre sola al aterrizar. */
            openTaskId={task ?? null}
            canEditTask={can.canEditTask}
            /* Comentar deja de exigir editar: el observador ya puede responder. */
            canComment={can.canComment}
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
          /* Etiquetas con su propio permiso: hasta ahora las gestionaba
             `canEditTask`, así que quien tocaba una tarea rehacía el vocabulario
             del proyecto entero. */
          <ProjectLabels projectId={project.id} labels={labels} canManage={can.canManageLabels} />
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
    </AppHeader>
  );
}
