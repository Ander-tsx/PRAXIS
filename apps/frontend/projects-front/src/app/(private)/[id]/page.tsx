import { PendingInvitationGate } from '@/components/organisms/PendingInvitationGate';
import { ProjectChatPreview } from '@/components/organisms/ProjectChat';
import { ProjectHeader } from '@/components/organisms/ProjectHeader';
import { ProjectMembers } from '@/components/organisms/ProjectMembers';
import { ProjectRoles } from '@/components/organisms/ProjectRoles';
import { SuspendedProjectNotice } from '@/components/organisms/SuspendedProjectNotice';
import { WorkspaceCanvas } from '@/components/organisms/WorkspaceCanvas';
import {
  AppHeader,
  type ChatMessagePage,
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
  projectPath,
  tabLinkClasses,
} from '@praxis/commons';
import { createServerApiClient, loadCurrentUser } from '@praxis/commons/auth';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    ws?: string;
    board?: string;
    task?: string;
    mias?: string;
  }>;
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

/**
 * Las pestañas, en orden de uso.
 *
 * ⚠️ **El chat va el último y no el segundo.** Las otras tres son configuración
 * y contenido del proyecto —dónde está el trabajo, quién lo hace, bajo qué
 * reglas—; el chat es una conversación, se entra a leer y no a decidir, y su
 * insignia de no leídos ya lo reclama cuando toca. En segunda posición partía en
 * dos el recorrido natural «espacios → equipo → roles».
 *
 * ⚠️ **Ya no hay pestaña «Etiquetas».** Se administran desde el diálogo de la
 * tarea, que es donde se usan: ver §36.
 */
const TABS = [
  { id: 'espacios', label: 'Espacios' },
  { id: 'equipo', label: 'Equipo' },
  { id: 'roles', label: 'Roles' },
  { id: 'chat', label: 'Chat' },
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
  const { tab, ws, board, task, mias } = await searchParams;
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

  const [effective, members, labels, invitations, chat] = await Promise.all([
    api.get<EffectivePermissions>(`/projects/${project.id}/permissions/me`),
    api.get<ProjectMember[]>(`/projects/${project.id}/members`).catch(() => [] as ProjectMember[]),
    /* Se piden siempre —son una fila por etiqueta— porque las necesita el
       diálogo de la tarea, que es donde ahora se ponen **y** se administran, y
       el inventario del borrado del proyecto, que dice cuántas se van. */
    api
      .get<Label[]>(`/projects/${project.id}/labels`)
      .catch(() => [] as Label[]),
    /**
     * Las invitaciones se piden **aquí y no después de resolver a las personas**,
     * porque quien está invitado también necesita nombre y correo: sus ids
     * entran en la misma tanda que los de los miembros. Pedirlas más abajo
     * obligaba a resolver los perfiles antes de saber a quién había que
     * resolver, y esa era justo la causa de que la invitación pendiente
     * saliera con el UUID crudo.
     *
     * Solo quien gestiona el equipo puede listarlas; para el resto es un 403
     * esperado y la sección simplemente no las muestra.
     */
    activeTab === 'equipo'
      ? api
          .get<ProjectInvitation[]>(`/projects/${project.id}/invitations`)
          .catch(() => [] as ProjectInvitation[])
      : Promise.resolve([] as ProjectInvitation[]),

    /**
     * El chat.
     *
     * Se pide **siempre**, pero con `limit=1` fuera de su pestaña: la respuesta
     * trae `unread`, que es lo que pinta la insignia, y esa tiene que verse
     * estando en cualquier otra pestaña — es medio motivo de que el chat exista.
     * Traer un mensaje en vez de cincuenta es la diferencia entre pagar el
     * contador y pagar la conversación entera en cada carga.
     *
     * Cae a página vacía si falla: perder el chat no puede llevarse por delante
     * el proyecto.
     */
    api
      .get<ChatMessagePage>(
        `/projects/${project.id}/chat/messages?limit=${activeTab === 'chat' ? 50 : 1}`,
      )
      .catch(() => ({ items: [], hasMore: false, unread: 0, muted: false }) as ChatMessagePage),
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
   * Las personas del proyecto, resueltas **una por una desde sus ids**.
   *
   * ⚠️ **Antes esto pedía `/users?limit=100` y cruzaba en el cliente.** Eso no
   * es una lista: es la primera página del directorio de **toda la plataforma**,
   * y `limit` está topado en 100 por el DTO. En cuanto hubo más de cien cuentas,
   * los miembros de este proyecto dejaron de estar ahí y la pestaña Equipo pasó
   * a enseñar el UUID crudo y «Correo no disponible», mientras el selector de
   * encargados se quedaba vacío — sin ningún error de por medio.
   *
   * Lo destapó la suite de pruebas al crear cuentas de usar y tirar, pero no era
   * suyo: habría pasado igual el día que la plataforma llegara a 101 cuentas.
   *
   * Ahora se piden **solo los ids que hacen falta**, en paralelo. El coste va
   * con el tamaño del proyecto, no con el de la plataforma, y quien falle cae a
   * `null` sin llevarse la página por delante.
   *
   * ⚠️ **Las personas invitadas cuentan, y no son miembros.** Una invitación
   * `PENDING` no crea `ProjectMember` —eso pasa al aceptarla—, así que su id no
   * está en `members` y hay que sumarlo aparte. Mientras se cruzaba contra el
   * directorio entero salía bien de casualidad, porque la primera página lo
   * traía; al pasar a pedir ids sueltos, la invitación se quedó fuera de la
   * lista y volvió a enseñar el UUID crudo con «Correo no disponible» —el mismo
   * síntoma que este bloque arregló para los miembros—.
   */
  /**
   * ⚠️ **Quien escribió en el chat cuenta, y puede no ser miembro.** A alguien
   * a quien sacaron del proyecto sus mensajes se le quedan, así que su id no
   * está en `members` y hay que sumarlo aparte o la burbuja saldría con el UUID
   * crudo — el mismo síntoma que ya tuvieron las invitaciones pendientes.
   */
  const idsDePersonas =
    activeTab === 'equipo' || activeTab === 'espacios' || activeTab === 'chat'
      ? [
          ...new Set([
            ...members.map((m) => m.userId),
            ...invitations.map((invitation) => invitation.userId),
            ...(activeTab === 'chat' ? chat.items.map((message) => message.authorId) : []),
            project.ownerId,
          ]),
        ]
      : [];

  const personas = await Promise.all(
    idsDePersonas.map((id) => api.get<UserProfile>(`/users/${id}`).catch(() => null)),
  );

  const directory = {
    items: personas.filter((u): u is UserProfile => u !== null),
    total: idsDePersonas.length,
  };

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
  /**
   * «Solo mis tareas».
   *
   * ⚠️ **Se filtra al pintar, no al pedir.** Podría hacerse en el gateway con un
   * parámetro, y sería menos datos por la red; se hace aquí a propósito porque
   * el tablero necesita **saber cuántas se están escondiendo** para poder
   * decirlo. Un filtro que deja columnas vacías sin explicar por qué se lee como
   * un tablero roto, y esa es la forma más rápida de que alguien crea que ha
   * perdido su trabajo.
   *
   * Filtra por encargado y no por quien la creó: lo que se busca al pulsarlo es
   * «lo que me toca», no «lo que abrí yo».
   */
  const soloMias = mias === '1';
  const tasksByBoard = new Map(
    soloMias
      ? boardTasks.map(
          ([boardId, tareas]) =>
            [
              boardId,
              tareas.filter((tarea) => tarea.assignees?.some((a) => a.userId === userId)),
            ] as const,
        )
      : boardTasks,
  );

  /* Cuántas se están escondiendo, para poder decirlo en vez de dejar columnas
     vacías sin explicación. */
  const totalDelEspacio = boardTasks.reduce((suma, [, tareas]) => suma + tareas.length, 0);
  const misTareasDelEspacio = boardTasks.reduce(
    (suma, [, tareas]) =>
      suma + tareas.filter((tarea) => tarea.assignees?.some((a) => a.userId === userId)).length,
    0,
  );

  /** Quién puede aparecer como encargado: los miembros más el dueño. */
  const memberIds = new Set([...members.map((member) => member.userId), project.ownerId]);
  const assignableMembers = directory.items.filter((user) => memberIds.has(user.id));
  const usersById = new Map(directory.items.map((user) => [user.id, user]));

  /**
   * El número de cada pestaña.
   *
   * El del chat es **lo no leído**, no el total de mensajes: cuántos mensajes
   * hay acumulados desde que existe el proyecto no le sirve a nadie, y lo que
   * hace mirar es que haya algo nuevo.
   */
  const counts: Record<TabId, number> = {
    espacios: project.workspaces.length,
    equipo: members.length,
    roles: project.roles.length,
    chat: chat.unread,
  };

  return (
    /* El nombre del proyecto **no** va aquí: lo pinta la propia página, en
       grande y editable (`EditableProjectFields`). Repetirlo en la cabecera
       gastaba la única línea que dice dónde estás en decir dos veces lo mismo,
       y con un nombre largo además se truncaba. La cabecera nombra la sección,
       igual que el enlace de la barra lateral por el que se llega. */
    <AppHeader title="Proyectos">
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
            /**
             * El filtro de «mis tareas», **dentro de la cabecera del tablero y
             * junto a «Ampliar»**.
             *
             * Estuvo suelto encima del lienzo y ahí no se leía como lo que es.
             * Los dos son controles de **vista del tablero** —qué se ve y de qué
             * tamaño— así que van juntos y con el mismo tratamiento; separados,
             * el filtro parecía una acción del proyecto entero.
             *
             * Es un enlace y no un interruptor: el estado vive en la URL
             * (`?mias=1`), así que recargar lo mantiene, el botón atrás lo
             * deshace y un enlace compartido lleva a la misma vista. Misma
             * regla que la pestaña activa.
             */
            filtroMisTareas={
              <Link
                href={projectPath(project, {
                  tab: 'espacios',
                  ws: activeWorkspace?.id,
                  ...(soloMias ? {} : { mias: '1' }),
                })}
                replace
                aria-pressed={soloMias}
                title={
                  soloMias
                    ? `Ver todas las tareas (${totalDelEspacio})`
                    : `Ver solo las mías (${misTareasDelEspacio} de ${totalDelEspacio})`
                }
                className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 font-sans text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  soloMias
                    ? 'bg-primary text-primary-foreground'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                }`}
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                {soloMias ? `Solo mías · ${misTareasDelEspacio}` : 'Solo mías'}
              </Link>
            }
            projectId={project.id}
            projectSlug={project.slug}
            workspaces={project.workspaces}
            activeWorkspace={activeWorkspace}
            canManage={can.canCreateBoard}
            /* Renombrar y eliminar **espacios y tableros** cuelgan de estos dos,
               no de `canCreateBoard`: el gateway pide `canEditBoard` para los
               dos `PATCH` y `canDeleteBoard` para los dos `DELETE`, incluidos
               los del espacio. Antes «Eliminar espacio» se enseñaba con
               `canCreateBoard` y un rol que pudiera crear pero no borrar veía
               un botón que siempre respondía 403. */
            canEditBoard={can.canEditBoard}
            canDeleteBoard={can.canDeleteBoard}
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
            /* Las etiquetas se administran desde el diálogo de la tarea, que es
               donde se usan. Permiso propio: quien edita tareas no rehace por
               ello el vocabulario del proyecto entero. */
            canManageLabels={can.canManageLabels}
            canDeleteTask={can.canDeleteTask}
          />
        )}

        {activeTab === 'chat' && (
          /* Solo una muestra: la conversación entera vive en Mensajes, donde
             tiene la pantalla para ella. Ver `ProjectChatPreview`. */
          <ProjectChatPreview
            projectId={project.id}
            projectName={project.name}
            page={chat}
            usersById={usersById}
            currentUserId={userId}
          />
        )}

        {activeTab === 'equipo' && (
          <ProjectMembers
            projectId={project.id}
            members={members}
            roles={project.roles}
            usersById={usersById}
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
    </AppHeader>
  );
}
