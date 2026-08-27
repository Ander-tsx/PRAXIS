import {
  borradorDePlantillaAction,
  crearProyectoDesdePlantillaAction,
  createProjectAction,
} from '@/app/actions';
import { FiltroDeAvisos } from '@/components/molecules/FiltroDeAvisos';
import { DashboardEmptyState } from '@/components/organisms/DashboardEmptyState';
import { DashboardHero, resumenDelDia } from '@/components/organisms/DashboardHero';
import { DashboardProjects } from '@/components/organisms/DashboardProjects';
import { MyInvitations } from '@/components/organisms/MyInvitations';
import { NotificationList } from '@/components/organisms/NotificationList';
import { QuickAccess } from '@/components/organisms/QuickAccess';
import { TaskAlerts } from '@/components/organisms/TaskAlerts';
import { WorkPulse } from '@/components/organisms/WorkPulse';
import { agruparPorDia } from '@/lib/notifications';
import { MAX_TAREAS_DEL_PANEL, splitWork } from '@/lib/work';
import {
  AppHeader,
  CreateProjectSlideOver,
  DUE_SOON_DAYS,
  type MyInvitation,
  type NotificationPage,
  type Paginated,
  Pagination,
  type Project,
  type Task,
  type UserProfile,
  colors,
  displayName,
  resolveProfiles,
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

/**
 * Las anclas de la propia página, a las que apuntan las cifras del pulso.
 *
 * Van como constantes y no escritas a mano en los dos sitios porque el `id` y el
 * `href` tienen que coincidir **exactamente** y un desajuste no da ningún error:
 * la cifra simplemente deja de llevar a ninguna parte, que es lo que hacía toda
 * la pantalla antes de esta pasada.
 */
const ANCLA_TRABAJO = 'trabajo';
const ANCLA_AVISOS = 'avisos';

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

/**
 * Para un `<a>` duro: con el prefijo completo. La consume `Pagination`.
 *
 * ⚠️ Y **acaba en el ancla de la bandeja**. Sin eso, pasar de página devolvía al
 * principio del panel y había que volver a bajar hasta la lista que se estaba
 * leyendo — un fallo que solo aparece desde que la bandeja no es la pantalla
 * entera sino su última sección.
 */
function hrefAbsoluto(page: number, soloSinLeer: boolean): string {
  return `/dashboard${queryDeAvisos(page, soloSinLeer)}#${ANCLA_AVISOS}`;
}

/**
 * Panel del área privada.
 *
 * Server Component: aquí vive todo el fetch. Los organismos reciben datos por
 * props y no saben de dónde salen.
 *
 * La ruta la protege `src/proxy.ts`; `loadCurrentUser` vuelve a exigir sesión
 * porque la autorización nunca debe depender de una sola capa.
 *
 * ## La forma de la pantalla, y por qué esta
 *
 * Era una **pila de siete secciones a 1400 px**: bienvenida, invitaciones,
 * avisos de tareas, aviso de voz, métricas, proyectos y bandeja, una debajo de
 * otra. Todo del mismo ancho y del mismo peso, así que la jerarquía había que
 * deducirla del orden, y los proyectos —que son el objeto principal de la
 * aplicación— quedaban a medio scroll con veinte filas de bandeja debajo.
 *
 * Ahora son cuatro alturas con un criterio:
 *
 * 1. **La cabecera dice en una frase qué pasa hoy** (`resumenDelDia`), en vez de
 *    un subtítulo idéntico para todo el mundo todos los días.
 * 2. **Lo que espera una decisión** —las invitaciones— sigue lo primero, porque
 *    es lo único de la pantalla donde alguien está esperando por ti.
 * 3. **Cuatro cifras que se pueden pulsar**, y debajo el reparto de tu trabajo.
 * 4. **Dos columnas**: a la izquierda lo que hay que mirar (tareas y proyectos),
 *    a la derecha a dónde ir. La bandeja cierra, a lo ancho, como antes.
 */
export default async function DashboardPage({ searchParams }: PageProps) {
  const { userId, profile, roles } = await loadCurrentUser();
  const api = createServerApiClient();

  const params = await searchParams;
  const paginaAvisos = Math.max(1, Number.parseInt(String(params[PARAM_PAGINA] ?? '1'), 10) || 1);
  const soloSinLeer = params[PARAM_FILTRO] === SIN_LEER;

  const [page, invitations, misTareas, inbox] = await Promise.all([
    /**
     * Ya viene filtrado por el backend: proyectos donde el usuario es **dueño o
     * miembro**. Antes había que filtrar aquí por `ownerId` porque `GET /projects`
     * devolvía todos los del sistema, y el coste era que no aparecían los
     * proyectos a los que te habían añadido.
     */
    api.get<Paginated<Project>>('/projects'),
    /* Si fallan, el panel sigue siendo útil: no se tumba por una insignia. */
    api
      .get<MyInvitation[]>('/me/invitations')
      .catch(() => [] as MyInvitation[]),
    /**
     * Tu trabajo abierto, **de una sola petición**.
     *
     * ⚠️ Antes eran dos consultas y ahora es una, y el motivo está en el
     * `orderBy` de `findMyTasks`: ordena por `dueDate ASC`, y en Postgres los
     * nulos de un `ASC` van **al final**. O sea que las primeras que llegan son
     * las que vencen antes —que es justo lo que el panel necesita destacar— y lo
     * que se queda fuera del tope es la cola de las lejanas y las sin fecha.
     *
     * Aquella pedía `dueBefore=<hoy+7d>` para sacar los dos avisos; quitando ese
     * filtro sale lo mismo, **más** el reparto completo con el que se dibuja la
     * tira del pulso. Ver `lib/work.ts` para el detalle, incluido por qué el
     * `total` de la respuesta no se puede usar aquí.
     *
     * `excludeDone`: una tarea que ya está en la columna de cierre —la verde— no
     * es un pendiente por mucho que su fecha haya pasado. Sin esto, cerrar el
     * trabajo no quitaba el aviso y el panel mentía.
     */
    api
      .get<Paginated<Task>>(`/me/tasks?excludeDone=true&limit=${MAX_TAREAS_DEL_PANEL}`)
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
   * Vencidas, por vencer, lejanas y sin fecha.
   *
   * `splitWork` decide con `dueState`, la misma regla que usa la tarjeta del
   * tablero, así que un aviso y su tarjeta nunca se contradicen.
   */
  const work = splitWork(misTareas.items);

  const totals = projects.reduce(
    (acc, project) => ({
      workspaces: acc.workspaces + project._count.workspaces,
      members: acc.members + project._count.members,
    }),
    { workspaces: 0, members: 0 },
  );

  const name = displayName(profile);

  /**
   * Las caras de esta pantalla, en **una sola** petición.
   *
   * ⚠️ Aquí se juntan dos necesidades que antes no coexistían: quienes salen en
   * la bandeja (`actorId` de cada aviso) y los equipos de las tarjetas de
   * proyecto (los cuatro primeros `members` que trae `GET /projects`). Pedirlos
   * por separado serían dos viajes, y hacerlo de uno en uno es el N+1 que
   * documenta `commons/api/directory.ts` y que ya escribió «Alguien que ya no
   * está» sobre gente que estaba perfectamente.
   *
   * El `Set` deduplica: quien te ha asignado una tarea suele estar además en el
   * equipo del proyecto, así que la lista cruda repite bastante.
   */
  const idsDeAvisos = inbox
    ? inbox.items.map((aviso) => aviso.actorId).filter((id): id is string => !!id)
    : [];
  const idsDeEquipos = projects.flatMap((project) =>
    (project.members ?? []).map((miembro) => miembro.userId),
  );
  const directorio = await resolveProfiles(api, [...new Set([...idsDeAvisos, ...idsDeEquipos])]);

  /**
   * Proyecto → su equipo resuelto, con quien mira el primero.
   *
   * ⚠️ **`null` cuando el directorio no respondió**, y no una lista vacía: la
   * tarjeta lo distingue y vuelve al número de miembros en vez de dibujar un
   * equipo de cero personas sobre un proyecto que tiene ocho.
   */
  const equiposPorProyecto = new Map<string, UserProfile[] | null>(
    projects.map((project) => {
      if (!directorio.completo) return [project.id, null];

      const equipo = (project.members ?? [])
        .map((miembro) => directorio.perfiles.get(miembro.userId))
        .filter((persona): persona is UserProfile => !!persona)
        /* Tú primero: es la cara que se busca para saber si estás dentro, y el
           `Avatar` la pinta en rojo. Mismo criterio que en la rejilla. */
        .sort((a, b) => Number(b.id === userId) - Number(a.id === userId));

      return [project.id, equipo];
    }),
  );

  /* Agrupar es del servidor: donde ya se resuelve el resto de la fila y donde no
     hay riesgo de que el reloj del navegador pinte otra cosa que la servida. */
  const gruposDeAvisos = inbox ? agruparPorDia(inbox.items) : [];

  return (
    <AppHeader title="Panel">
      <div className="flex flex-col gap-8">
        <DashboardHero
          name={name}
          email={profile.credential.email}
          roles={roles}
          resumen={resumenDelDia({
            vencidas: work.vencidas.length,
            pronto: work.pronto.length,
            invitaciones: invitations.length,
            proyectos: projects.length,
          })}
        />

        {/* Antes que nada: es lo único que espera una decisión, y el único
            sitio donde se entera de que le han invitado. */}
        <MyInvitations invitations={invitations} />

        <WorkPulse
          work={work}
          sinLeer={inbox?.unread ?? null}
          hrefTrabajo={`#${ANCLA_TRABAJO}`}
          hrefAvisos={`#${ANCLA_AVISOS}`}
        />

        {projects.length === 0 ? (
          <DashboardEmptyState
            action={
              <a
                href="/assistant"
                className="inline-flex items-center justify-center font-sans font-medium transition-all duration-150 cursor-pointer select-none bg-primary text-primary-foreground hover:bg-primary-hover active:scale-[0.98] h-12 px-6 text-base rounded-xl gap-2.5"
              >
                Crear mi primer proyecto con PRAX
              </a>
            }
          />
        ) : (
          /**
           * Dos columnas a partir de `xl`, y no antes.
           *
           * En `lg` la columna de la izquierda se quedaría en unos 600 px, que es
           * menos de lo que necesita una rejilla de tarjetas de proyecto para
           * caber a dos por fila sin partir los nombres. Por debajo de eso todo
           * se apila, que es lo correcto en una tableta en vertical.
           */
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)] xl:items-start">
            <div id={ANCLA_TRABAJO} className="flex min-w-0 flex-col gap-6 scroll-mt-6">
              <TaskAlerts
                overdue={work.vencidas}
                soon={work.pronto}
                projectsById={new Map(projects.map((project) => [project.id, project]))}
                soonDays={DUE_SOON_DAYS}
              />

              {/**
               * Cuando no hay nada que avisar, `TaskAlerts` devuelve `null` y el
               * ancla se quedaba apuntando a un hueco. Decirlo con todas las
               * letras vale más que un vacío: las cifras de arriba llevan aquí,
               * y aterrizar en la nada se lee como que el enlace está roto.
               */}
              {work.vencidas.length === 0 && work.pronto.length === 0 && (
                <p
                  className="rounded-2xl border border-dashed px-6 py-8 text-center font-sans text-sm"
                  style={{ borderColor: colors.border, color: colors.textSecondary }}
                >
                  {work.total === 0
                    ? 'No tienes ninguna tarea asignada ahora mismo.'
                    : 'Nada vencido ni por vencer esta semana. Tu trabajo abierto está más adelante.'}
                </p>
              )}

              <DashboardProjects
                projects={projects}
                currentUserId={userId}
                equiposPorProyecto={equiposPorProyecto}
                total={page.total}
              />
            </div>

            <aside className="flex min-w-0 flex-col gap-6">
              <QuickAccess
                roles={roles}
                proyectos={page.total}
                espacios={totals.workspaces}
                miembros={totals.members}
              />
            </aside>
          </div>
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
         *
         * Lo que sí ganó es una forma de llegar sin scroll: la cifra de «sin
         * leer» del pulso apunta a este ancla.
         */}
        <section id={ANCLA_AVISOS} className="flex flex-col gap-4 scroll-mt-6">
          <h2 className="font-display text-2xl text-text-primary">Avisos</h2>

          {inbox === null ? (
            <p className="rounded-2xl border border-dashed border-error/40 px-6 py-12 text-center font-sans text-sm text-error">
              No se pudieron cargar tus avisos. Vuelve a intentarlo.
            </p>
          ) : (
            <>
              <NotificationList
                grupos={gruposDeAvisos}
                unread={inbox.unread}
                usersById={directorio.perfiles}
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
