import {
  borradorDePlantillaAction,
  crearProyectoDesdePlantillaAction,
  createProjectAction,
} from '@/app/actions';
import { FiltroDeAvisos } from '@/components/molecules/FiltroDeAvisos';
import { DashboardEmptyState } from '@/components/organisms/DashboardEmptyState';
import { DashboardMetrics } from '@/components/organisms/DashboardMetrics';
import { DashboardWelcome } from '@/components/organisms/DashboardWelcome';
import { MyInvitations } from '@/components/organisms/MyInvitations';
import { NotificationList } from '@/components/organisms/NotificationList';
import { ProjectList } from '@/components/organisms/ProjectList';
import { TaskAlerts } from '@/components/organisms/TaskAlerts';
import { VoiceCallout } from '@/components/organisms/VoiceCallout';
import { agruparPorDia } from '@/lib/notifications';
import { type VoiceLink, estaActiva } from '@/lib/voice';
import {
  AppHeader,
  CreateProjectDialog,
  DUE_SOON_DAYS,
  type MyInvitation,
  type NotificationPage,
  type Paginated,
  Pagination,
  type Project,
  type Task,
  displayName,
  dueState,
  resolverPerfiles,
} from '@praxis/commons';
import { createServerApiClient, loadCurrentUser } from '@praxis/commons/auth';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Panel',
};

/**
 * Cuántos avisos por página en la sección de la bandeja.
 *
 * Antes se pedían 50 sin más, y el backend no aceptaba `page`: a partir del 51
 * no había forma de llegar. Una bandeja crece sola —cada asignación, cada
 * invitación, cada comentario— así que es de las listas que antes se pasan de
 * cualquier tope.
 */
const AVISOS_POR_PAGINA = 20;

/** El valor del filtro en la URL. Cualquier otra cosa cae en «todas». */
const SIN_LEER = 'sin-leer';

/**
 * ⚠️ **Los parámetros de la bandeja van prefijados** (E4.2).
 *
 * Al mudarse al panel, la bandeja deja de tener la URL para ella sola: comparte
 * pantalla con el resto de secciones. Un `?page=` a secas sería de quien
 * llegara primero, y el día que otra sección pagine, pasar de página en una
 * movería la otra sin que nadie entienda por qué.
 *
 * Hoy el panel no lee ningún otro parámetro, así que no hay choque **todavía**
 * — que es exactamente cuando sale barato ponerse el prefijo.
 */
const PARAM_PAGINA = 'avisos_page';
const PARAM_FILTRO = 'avisos_filtro';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * El estado de la bandeja como query, sin la ruta.
 *
 * 🔴 **Hay que construir dos rutas distintas para el mismo sitio, y mezclarlas
 * da un 404.** Dentro de una zona con `basePath`, `next/link` **añade el
 * prefijo** y un `<a>` plano **no**. Así que:
 *
 * | Quién | Elemento | Necesita |
 * |---|---|---|
 * | `FiltroDeAvisos` | `next/link` | ruta **interna**: `/?…` |
 * | `Pagination` | `<a>` plano | ruta **absoluta**: `/dashboard?…` |
 *
 * Darle la absoluta al `<Link>` produce `/dashboard/dashboard?…`, que es un 404
 * — y no lo ve el compilador, porque las dos son `string`. Es la misma trampa
 * que mordió al mudar el chat de zona (E3.3), aquí con el matiz de que **las dos
 * formas conviven en la misma pantalla**.
 */
function queryDeAvisos(page: number, soloSinLeer: boolean): string {
  const params = new URLSearchParams();
  if (page > 1) params.set(PARAM_PAGINA, String(page));
  if (soloSinLeer) params.set(PARAM_FILTRO, SIN_LEER);

  const query = params.toString();
  return query ? `?${query}` : '';
}

/** Para `next/link`: **sin** el prefijo de zona, que lo pone Next. */
function hrefInterno(page: number, soloSinLeer: boolean): string {
  return `/${queryDeAvisos(page, soloSinLeer)}`;
}

/** Para un `<a>` duro: con el prefijo completo. La consume `Pagination`. */
function hrefAbsoluto(page: number, soloSinLeer: boolean): string {
  return `/dashboard${queryDeAvisos(page, soloSinLeer)}`;
}

/**
 * Panel del área privada.
 *
 * Server Component: aquí vive todo el fetch. Los organismos reciben datos por
 * props y no saben de dónde salen.
 *
 * La ruta la protege `src/proxy.ts`; `loadCurrentUser` vuelve a exigir sesión
 * porque la autorización nunca debe depender de una sola capa.
 */
export default async function DashboardPage({ searchParams }: PageProps) {
  const { userId, profile, roles } = await loadCurrentUser();
  const api = createServerApiClient();

  const params = await searchParams;
  const paginaAvisos = Math.max(1, Number.parseInt(String(params[PARAM_PAGINA] ?? '1'), 10) || 1);
  const soloSinLeer = params[PARAM_FILTRO] === SIN_LEER;

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

  const [page, invitations, voiceLinks, dueTasks, inbox] = await Promise.all([
    api.get<Paginated<Project>>('/projects'),
    /* Si fallan, el panel sigue siendo útil: no se tumba por una insignia. */
    api
      .get<MyInvitation[]>('/me/invitations')
      .catch(() => [] as MyInvitation[]),
    /* Si alexa-service no responde no se enseña el aviso: es mejor no decir
       nada que invitar a vincular contra un servicio que está caído. */
    api
      .get<VoiceLink[]>('/alexa/links')
      .catch(() => [] as VoiceLink[]),
    api
      /* `excludeDone`: una tarea que ya está en la columna de cierre —la verde—
         no es un pendiente por mucho que su fecha haya pasado. Sin esto, cerrar
         el trabajo no quitaba el aviso y el panel mentía. */
      .get<Paginated<Task>>(
        `/me/tasks?dueBefore=${encodeURIComponent(dueBefore)}&excludeDone=true&limit=50`,
      )
      .catch(() => ({ items: [] as Task[], total: 0 })),
    /**
     * ⚠️ **`null` es «no se pudo leer», no «no hay nada».**
     *
     * Con la bandeja vacía, `NotificationList` pinta «Nada por aquí». Si esto
     * cayera a una página vacía, el panel diría tranquilamente que no tienes
     * avisos con el gateway caído — y el resto del panel seguiría pintándose,
     * así que nada delataría el corte. Distinguir los dos casos es lo que
     * permite decir «no se pudieron cargar» en su sitio y dejar el resto en pie.
     */
    api
      .get<NotificationPage>(
        `/me/notifications?page=${paginaAvisos}&limit=${AVISOS_POR_PAGINA}${
          soloSinLeer ? '&unreadOnly=true' : ''
        }`,
      )
      .catch(() => null),
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

  /* El aviso de voz solo mientras no haya ninguna vinculación viva. Una
     revocada o caducada no cuenta: si la única que había se revocó, volver a
     ofrecerlo es justo lo que toca. */
  const sinVoz = !voiceLinks.some(estaActiva);

  /**
   * Las caras y los nombres de quienes salen en la bandeja.
   *
   * Los avisos guardan `actorId`: projects-service no conoce a las personas. Se
   * piden **en una** petición y solo los de esta página —como mucho, uno por
   * aviso—. Ver `commons/api/directorio.ts` para el fallo que evita hacerlo de
   * uno en uno.
   */
  const actores = inbox
    ? [...new Set(inbox.items.map((aviso) => aviso.actorId).filter((id): id is string => !!id))]
    : [];
  const avisosPorPersona = (await resolverPerfiles(api, actores)).perfiles;

  /* Agrupar es del servidor: donde ya se resuelve el resto de la fila y donde no
     hay riesgo de que el reloj del navegador pinte otra cosa que la servida. */
  const gruposDeAvisos = inbox ? agruparPorDia(inbox.items) : [];

  return (
    <AppHeader
      title="Panel"
      headerSlot={
        projects.length > 0 ? (
          <CreateProjectDialog
            action={createProjectAction}
            borradorAction={borradorDePlantillaAction}
            aplicarAction={crearProyectoDesdePlantillaAction}
          />
        ) : undefined
      }
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

        {/* Detrás de invitaciones y avisos de tareas: aquello es trabajo que
            espera, esto es una función que descubrir. Delante de las métricas
            porque ahí abajo ya no lo ve nadie. */}
        {sinVoz && <VoiceCallout />}

        {projects.length === 0 ? (
          <DashboardEmptyState
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
            <DashboardMetrics
              projects={projects.length}
              owned={owned.length}
              workspaces={totals.workspaces}
              members={totals.members}
            />
            <ProjectList projects={projects} currentUserId={userId} />
          </>
        )}

        {/**
         * La bandeja, **al final y no en medio** (E4.1).
         *
         * Era una pantalla propia (`/dashboard/notifications`) y ahora es una
         * sección de aquí: son una lista y dos botones, y el panel tenía sitio
         * de sobra.
         *
         * Va la última a propósito. Es una lista de veinte filas: puesta arriba
         * empuja los proyectos —que son el objeto principal de la aplicación—
         * fuera de la pantalla. Y por orden de urgencia también le toca el
         * final: las invitaciones esperan una decisión y los avisos de tareas
         * apremian, mientras que esto es el registro de lo que ya pasó.
         */}
        <section className="flex flex-col gap-4" aria-labelledby="titulo-avisos">
          <h2 id="titulo-avisos" className="font-display text-2xl text-text-primary">
            Avisos
          </h2>

          {inbox === null ? (
            <p className="rounded-2xl border border-dashed border-error/40 px-6 py-12 text-center font-sans text-sm text-error">
              No se pudieron cargar tus avisos. Vuelve a intentarlo.
            </p>
          ) : (
            <>
              <NotificationList
                grupos={gruposDeAvisos}
                unread={inbox.unread}
                usersById={avisosPorPersona}
                soloSinLeer={soloSinLeer}
                filtroSlot={
                  <FiltroDeAvisos
                    unread={inbox.unread}
                    soloSinLeer={soloSinLeer}
                    hrefTodas={hrefInterno(1, false)}
                    hrefSinLeer={hrefInterno(1, true)}
                  />
                }
              />

              {/* ⚠️ El paginador **conserva el filtro**: perder el parámetro al
                  pasar de página es el fallo clásico de esto, y aquí saltaría a
                  la vista — de «sin leer» a «todas» sin tocar el filtro.

                  `total` ya viene filtrado —el backend lo cuenta con el mismo
                  `where` que la consulta— así que con el filtro puesto pagina
                  sobre las no leídas, que es lo correcto. */}
              <Pagination
                page={paginaAvisos}
                limit={AVISOS_POR_PAGINA}
                total={inbox.total}
                hrefFor={(n) => hrefAbsoluto(n, soloSinLeer)}
                nombre="avisos"
              />
            </>
          )}
        </section>
      </div>
    </AppHeader>
  );
}
