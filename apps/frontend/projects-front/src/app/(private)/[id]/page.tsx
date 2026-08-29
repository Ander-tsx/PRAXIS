import { TabIcon } from '@/components/atoms/TabIcon';
import { PendingInvitationGate } from '@/components/organisms/PendingInvitationGate';
import { ProjectChatPreview } from '@/components/organisms/ProjectChat';
import { ProjectHeader } from '@/components/organisms/ProjectHeader';
import { ProjectMembers } from '@/components/organisms/ProjectMembers';
import { ProjectRoles } from '@/components/organisms/ProjectRoles';
import { ProjectRules } from '@/components/organisms/ProjectRules';
import { SuspendedProjectNotice } from '@/components/organisms/SuspendedProjectNotice';
import { WorkspaceCanvas } from '@/components/organisms/WorkspaceCanvas';
import type { AutomationCatalog } from '@/lib/automation-catalog';
import {
  AppHeader,
  type AutomationExecutionPage,
  type AutomationRule,
  type ChatMessagePage,
  type EffectivePermissions,
  type Label,
  type MyInvitation,
  PERSONA_ELIMINADA,
  type Paginated,
  type ProjectDetail,
  type ProjectInvitation,
  type ProjectMember,
  TabNav,
  type Task,
  personLabel,
  projectPath,
  resolveProfiles,
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
    vista?: string;
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
 *
 * ⚠️ **La sección de automatización ha cambiado de nombre dos veces**, y las
 * dos URLs anteriores siguen vivas: `?tab=automatizaciones` (el primer nombre)
 * y `?tab=reglas` (el segundo) aterrizan en `automation`, que es el definitivo.
 * Se resuelven como alias más abajo, al calcular `activeTab`.
 *
 * Un enlace compartido no puede morir porque en esta casa hayamos cambiado de
 * opinión sobre cómo llamar a una pestaña, y mantener dos alias cuesta dos
 * líneas.
 *
 * ⚠️ **El identificador va en inglés y la etiqueta en español**, como manda la
 * convención del repositorio: `id` viaja en la URL y en el código —es una
 * interfaz— y `label` es lo único que se lee en pantalla.
 */
const TABS = [
  { id: 'espacios', label: 'Espacios', icon: 'workspaces' },
  { id: 'equipo', label: 'Equipo', icon: 'team' },
  { id: 'roles', label: 'Roles', icon: 'roles' },
  /* En plural: la pestaña no es una capacidad abstracta, es la lista de las
     automatizaciones que tiene el proyecto — igual que Espacios y Roles. El
     `id` no se toca: viaja en la URL y hay enlaces compartidos con él. */
  { id: 'automation', label: 'Automatizaciones', icon: 'automation' },
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
  const { tab, ws, board, task, mias, vista } = await searchParams;
  const { userId } = await loadCurrentUser();
  const api = createServerApiClient();

  const activeTab: TabId = TABS.some((t) => t.id === tab)
    ? (tab as TabId)
    : /* Los dos nombres que tuvo esta sección antes. Ver `TABS`. */
      tab === 'automatizaciones' || tab === 'reglas'
      ? 'automation'
      : 'espacios';

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
      .get<ChatMessagePage>(`/projects/${project.id}/chat/messages?limit=1`)
      /* `channelId` vacío: si la carga falló no sabemos de qué canal es, y ese
         id es lo que el panel usa para filtrar los eventos del flujo en vivo.
         Una cadena vacía no coincide con ninguno — mejor sin tiempo real que
         aceptando eventos de un canal desconocido. */
      .catch(
        () =>
          ({
            channelId: '',
            items: [],
            hasMore: false,
            unread: 0,
            muted: false,
          }) as ChatMessagePage,
      ),
  ]);

  const can = effective.permissions;

  /**
   * Reglas de automatización, ejecuciones y catálogo.
   *
   * Nada de esto se pide sin el permiso: sería una petición que siempre da 403.
   *
   * ⚠️ **Las reglas se piden siempre; lo caro, solo con la pestaña abierta.**
   *
   * Se pedían las tres cosas solo dentro de la pestaña, y eso dejaba el
   * contador de la pestaña **a cero mientras no estuvieras dentro de ella** —
   * justo cuando sirve para algo, que es para saber si hay reglas sin entrar a
   * mirar. La lista es una fila por regla y ninguna la tiene por decenas; las
   * ejecuciones y el catálogo sí pesan, y esos siguen esperando a que se abra.
   */
  /**
   * 🔴 **`null` y no `[]` cuando el servicio no responde.**
   *
   * Esto caía a lista vacía, y una lista vacía **ya significa otra cosa**: «no
   * tienes ninguna regla». Con el servicio caído, quien tuviera diez reglas
   * veía la pantalla de bienvenida diciéndole que no había ninguna — el recorte
   * mudo que este repositorio prohíbe en cualquier otro sitio.
   */
  const automationRules = can.canManageAutomations
    ? await api.get<AutomationRule[]>(`/projects/${project.id}/automations`).catch(() => null)
    : [];

  const [automationExecutions, automationCatalog] =
    activeTab === 'automation' && can.canManageAutomations
      ? await Promise.all([
          api
            .get<AutomationExecutionPage>(`/projects/${project.id}/automations/executions`)
            .catch(() => null),
          /* El catálogo manda: qué disparadores, condiciones y acciones se
             pueden elegir sale del servidor, no de una copia en el cliente. */
          api
            .get<AutomationCatalog>(`/projects/${project.id}/automations/catalog`)
            .catch(() => null),
        ])
      : [{ items: [], total: 0, limit: 0 } as AutomationExecutionPage, null];

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
    activeTab === 'equipo' || activeTab === 'espacios' || activeTab === 'automation'
      ? [
          ...new Set([
            ...members.map((m) => m.userId),
            ...invitations.map((invitation) => invitation.userId),
            project.ownerId,
          ]),
        ]
      : [];

  /* ⚠️ En **una** petición, no una por persona. Un equipo de veinte eran veinte
     peticiones por carga, todas con la IP del servidor de Next: agotaban el
     limitador del gateway y las que caían se leían como cuentas borradas. Ver
     `commons/api/directory.ts`. */
  const directorio = await resolveProfiles(api, idsDePersonas);
  const directory = {
    items: [...directorio.perfiles.values()],
    total: directorio.perfiles.size,
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
    automation: automationRules?.length ?? 0,
  };

  /**
   * La pestaña de espacios **no desplaza la página**: el tablero es la pantalla.
   *
   * ⚠️ Este `lleno` es la pieza que arregla el defecto que más se notaba al usar
   * esto: había tres desplazamientos anidados —la página, la tira de columnas y
   * la lista de tareas de cada columna— y la rueda del ratón hacía una cosa u
   * otra según dónde estuviera el cursor. Con la página quieta solo quedan dos,
   * y cada uno en un eje distinto, así que ya no se pisan.
   *
   * Las otras tres pestañas siguen desplazándose: son documentos —una lista de
   * gente, una de roles, una conversación— y ahí recortar el alto solo añadiría
   * un contenedor más que desplazar.
   */
  const esTablero = activeTab === 'espacios';

  return (
    /* El nombre del proyecto **no** va aquí: lo pinta la propia página, en
       grande, junto a su icono (`ProjectHeader`). Repetirlo en la cabecera
       gastaba la única línea que dice dónde estás en decir dos veces lo mismo,
       y con un nombre largo además se truncaba. La cabecera nombra la sección,
       igual que el enlace de la barra lateral por el que se llega. */
    <AppHeader title="Proyectos" lleno={esTablero}>
      <div className={esTablero ? 'flex min-h-0 flex-1 flex-col gap-3' : 'flex flex-col gap-6'}>
        {/* Antes de la cabecera: es la condición que explica todo lo que sigue. */}
        {suspendido && (
          <div className="shrink-0">
            <SuspendedProjectNotice
              reason={effective.suspendedReason}
              isOwner={effective.isOwner}
            />
          </div>
        )}

        <ProjectHeader
          /* Todas las pestañas usan ahora la cabecera compacta por consistencia visual. */
          compacto={true}
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

        {/* `shrink-0`: en la pestaña del tablero esta columna es de alto fijo y
            el que reparte es el tablero. Sin esto, con la ventana baja las
            pestañas se aplastan antes que el lienzo. */}
        <div className="shrink-0 flex items-center justify-between border-b border-border">
          <TabNav
            ariaLabel="Secciones del proyecto"
            tabs={TABS.map((t) => ({
              ...t,
              count: counts[t.id],
              icon: <TabIcon nombre={t.icon} />,
            }))}
            activeId={activeTab}
            renderLink={(t, isActive, content) => (
              <Link
                key={t.id}
                href={projectPath(project, { tab: t.id as TabId })}
                aria-current={isActive ? 'page' : undefined}
                className={tabLinkClasses(isActive)}
                replace
              >
                {content}
              </Link>
            )}
          />
          <div className="hidden sm:flex items-center gap-2">
            <a
              href={`/chat/proyecto/${project.id}`}
              className="flex items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3.5 py-1.5 font-sans text-sm font-medium text-white/80 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              Abrir Chat{' '}
              {chat.unread > 0 && (
                <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] text-white font-semibold">
                  {chat.unread}
                </span>
              )}
            </a>
          </div>
        </div>

        {activeTab === 'espacios' && (
          <WorkspaceCanvas
            /* Los recuentos del filtro salen de aquí, que es quien tiene las
               tareas sin filtrar; el control lo dibuja el lienzo, que es quien
               sabe qué tablero está abierto. Ver `WorkspaceCanvas`. */
            soloMias={soloMias}
            misTareasDelEspacio={misTareasDelEspacio}
            totalDelEspacio={totalDelEspacio}
            projectId={project.id}
            projectSlug={project.slug}
            workspaces={project.workspaces}
            activeWorkspace={activeWorkspace}
            /* Solo el punto de partida: a partir de ahí el tablero se elige en
               el cliente, sin navegar. Ver `WorkspaceCanvas`. */
            boardIdInicial={targetBoard ?? null}
            vistaInicial={vista}
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
            /* A quién se puede invitar sale de aquí: quien entra en un proyecto
               necesita asiento en su organización. Ver `InviteMemberDialog`. */
            organizationId={project.organizationId}
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

        {activeTab === 'automation' && (
          <ProjectRules
            projectId={project.id}
            rules={automationRules}
            executions={automationExecutions}
            catalog={automationCatalog}
            /**
             * Las listas de las que salen los valores de una condición o de una
             * acción.
             *
             * ⚠️ **Ninguna consulta nueva.** Las columnas vienen embebidas en
             * `GET /projects/:id`, y las etiquetas y la gente ya se piden para
             * otras secciones. El catálogo dice *de qué lista* sale cada campo;
             * los valores los pone quien ya los tiene en pantalla.
             */
            proyecto={{
              columns: project.workspaces.flatMap((workspace) =>
                workspace.boards.flatMap((board) =>
                  board.columns.map((column) => ({
                    value: column.id,
                    /* Con el tablero delante: dos tableros pueden tener cada uno
                       su «Por hacer», y un desplegable con dos entradas iguales
                       no se puede usar. */
                    label: `${board.name} · ${column.name}`,
                  })),
                ),
              ),
              labels: labels.map((label) => ({ value: label.id, label: label.name })),
              members: members.map((member) => {
                const user = usersById.get(member.userId);
                return {
                  value: member.userId,
                  label: user ? personLabel(user) : PERSONA_ELIMINADA,
                };
              }),
            }}
            canManage={can.canManageAutomations}
            isSuspended={suspendido}
          />
        )}
      </div>
    </AppHeader>
  );
}
