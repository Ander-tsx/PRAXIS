import { AutoRefresh } from '@/components/molecules/AutoRefresh';
import { NotificationList } from '@/components/organisms/NotificationList';
import { agruparPorDia } from '@/lib/notifications';
import { AppHeader, type NotificationPage, Pagination, type UserProfile } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Notificaciones',
};

/**
 * Cada cuánto se repasa la bandeja **por si acaso**.
 *
 * Eran 60 s de cuando este sondeo era la única forma de enterarse. Hoy el flujo
 * SSE de `AvisosEnVivo` refresca la ruta en cuanto llega un aviso, así que esto
 * solo cubre lo que se pierda si el flujo se cae: cinco minutos es de sobra para
 * eso, y ahorra los refrescos que competían con las Server Actions. Ver
 * `AutoRefresh`.
 */
const REFRESH_SECONDS = 300;

/**
 * Cuántos avisos por página.
 *
 * Antes se pedían 50 sin más, y el backend no aceptaba `page`: a partir del 51
 * no había forma de llegar. Una bandeja crece sola —cada asignación, cada
 * invitación, cada comentario— así que es de las listas que antes se pasan de
 * cualquier tope.
 */
const POR_PAGINA = 20;

/** El valor del filtro en la URL. Cualquier otra cosa cae en «todas». */
const SIN_LEER = 'sin-leer';

interface PageProps {
  searchParams: Promise<{ page?: string; filtro?: string }>;
}

/**
 * Bandeja de notificaciones.
 *
 * Es una página del panel y no una zona propia: son una lista y dos botones, y
 * montar una zona son nueve pasos de checklist (§17.7) para servir eso. La
 * entrada de la barra lateral apunta aquí.
 *
 * **Las invitaciones siguen en el panel, con sus botones.** Aquí aparece el
 * aviso de que llegaron, pero responder se hace allí: duplicar los botones
 * crearía dos sitios donde aceptar lo mismo y el segundo en enterarse fallaría.
 *
 * ## El filtro vive en la URL, y lo aplica el backend
 *
 * `?filtro=sin-leer` se traduce a `unreadOnly=true`, que el gateway ya aceptaba
 * (`FindNotificationsQueryDto`) y nadie usaba desde aquí. **Filtrar en el
 * cliente habría sido mentira**: la lista está paginada de 20 en 20, así que
 * esconder las leídas de esta página dejaría «3 sin leer» arriba y una sola fila
 * abajo, con las otras dos escondidas en la página 2.
 *
 * Y por eso el filtro es de estado y no de tipo: `unreadOnly` es el único que el
 * backend sabe aplicar. Un desplegable de «solo tareas» solo podría ordenar lo
 * que ya vino en la página, que es exactamente el mismo engaño.
 */
export default async function NotificationsPage({ searchParams }: PageProps) {
  const api = createServerApiClient();
  const { page: pageParam, filtro } = await searchParams;
  const pagina = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  const soloSinLeer = filtro === SIN_LEER;

  /**
   * ⚠️ **`null` es «no se pudo leer», no «no hay nada».**
   *
   * Esto caía a `{items: [], total: 0, unread: 0}`, y con la bandeja vacía
   * `NotificationList` pinta «Nada por aquí». Es decir: con el gateway caído, la
   * pantalla decía tranquilamente que no tenías avisos — y como esta página se
   * autorrefresca cada minuto, lo repetía indefinidamente sin que nada cambiara
   * de aspecto.
   *
   * Es el mismo fallo de `57d1d91` y del «Alguien» de esta misma bandeja: un
   * hueco que se lee bien no se reporta. El modelo a seguir es
   * `admin-front/actividad`, que distingue los tres estados —error, vacío y con
   * datos— desde el primer día.
   */
  const inbox = await api
    .get<NotificationPage>(
      `/me/notifications?page=${pagina}&limit=${POR_PAGINA}${soloSinLeer ? '&unreadOnly=true' : ''}`,
    )
    .catch(() => null);

  if (!inbox) {
    return (
      <AppHeader title="Notificaciones">
        {/* Sin `AutoRefresh`: reintentar solo tiene sentido si lo pide quien
            mira. Un refresco automático sobre un error convierte un corte en un
            martilleo, y encima esconde que hubo error — la página parpadea y
            vuelve a decir lo mismo. */}
        <p className="rounded-2xl border border-dashed border-error/40 px-6 py-12 text-center font-sans text-sm text-error">
          No se pudieron cargar tus avisos. Vuelve a intentarlo.
        </p>
      </AppHeader>
    );
  }

  /**
   * Los nombres de quienes aparecen en la bandeja, **pedidos por id**.
   *
   * Los avisos guardan `actorId`, como los encargados y los autores de
   * comentarios: projects-service no conoce a las personas.
   *
   * ⚠️ Esto pedía `/users?limit=100` y cruzaba en memoria — la primera página del
   * directorio de **toda la plataforma**, con el `limit` topado en 100 por el
   * DTO. Pasadas cien cuentas, quien te escribía dejaba de estar ahí y todos los
   * avisos decían «Alguien». Sigue siendo cierto y legible, que es justo lo que
   * hacía que nadie lo notara.
   *
   * Es el mismo fallo que tenían la pestaña Equipo y la pantalla del asistente.
   * Ahora se piden solo los actores de esta página: como mucho, uno por aviso.
   * Y desde esta pasada el perfil se usa entero, no solo el nombre: la fila
   * lleva **la cara** de quien hizo la cosa.
   */
  const idsDeActores = [
    ...new Set(inbox.items.map((aviso) => aviso.actorId).filter((id): id is string => !!id)),
  ];

  const actores = await Promise.all(
    idsDeActores.map((id) => api.get<UserProfile>(`/users/${id}`).catch(() => null)),
  );

  const usersById = new Map(
    actores.filter((u): u is UserProfile => u !== null).map((user) => [user.id, user]),
  );

  /* Agrupar es del servidor: es donde ya se resuelve todo lo demás de la fila y
     donde no hay riesgo de que el reloj del navegador pinte otra cosa que la
     que se sirvió. Ver `lib/notifications.ts`. */
  const grupos = agruparPorDia(inbox.items);

  return (
    <AppHeader title="Notificaciones">
      <AutoRefresh seconds={REFRESH_SECONDS} />

      <NotificationList
        grupos={grupos}
        unread={inbox.unread}
        usersById={usersById}
        soloSinLeer={soloSinLeer}
        filtroSlot={<Filtro unread={inbox.unread} soloSinLeer={soloSinLeer} />}
      />

      {/* `unread` viaja aparte del `total` y sigue contando la bandeja entera,
          no la página: es lo que pinta la insignia de la barra lateral.

          ⚠️ El paginador **conserva el filtro**: perder el parámetro al pasar de
          página es el fallo clásico de esto, y aquí saltaría a la vista —de
          «sin leer» a «todas» sin tocar el filtro.

          `total` ya viene filtrado —el backend lo cuenta con el mismo `where`
          que la consulta— así que con el filtro puesto pagina sobre las no
          leídas, que es lo correcto. */}
      <div className="mt-6">
        <Pagination
          page={pagina}
          limit={POR_PAGINA}
          total={inbox.total}
          hrefFor={(n) => hrefBandeja(n, soloSinLeer)}
          nombre="avisos"
        />
      </div>
    </AppHeader>
  );
}

/**
 * El filtro, como dos enlaces.
 *
 * Vive en la URL, así que son enlaces de verdad: se comparten, el botón atrás
 * hace lo que se espera y la pantalla sigue siendo un Server Component. Con
 * `next/link` y **sin** el prefijo de zona, que lo pone Next (ESTADO-ACTUAL §16).
 *
 * ⚠️ **«Todas» no lleva número, y no es un olvido.** `total` viene contado con
 * el **mismo `where` que la consulta**, así que con `unreadOnly=true` vale lo
 * mismo que `unread`: pintarlo ahí diría «Todas 3» cuando hay treinta, y solo
 * mientras el otro filtro está puesto — un número que miente a ratos es peor
 * que ninguno. El de «Sin leer» sí es fiable siempre: `unread` cuenta la bandeja
 * entera pase lo que pase con el filtro, porque es el mismo que pinta la
 * insignia de la barra lateral.
 */
function Filtro({ unread, soloSinLeer }: { unread: number; soloSinLeer: boolean }) {
  return (
    /* `<nav>` y no un `div` con `role="group"`: son dos enlaces que cambian de
       vista, que es literalmente navegación, y el elemento ya trae el papel. */
    <nav
      className="flex items-center gap-0.5 rounded-lg border border-border p-0.5"
      aria-label="Filtrar avisos"
    >
      <Link
        href="/notifications"
        aria-current={soloSinLeer ? undefined : 'page'}
        className={pastilla(!soloSinLeer)}
      >
        Todas
      </Link>
      <Link
        href={`/notifications?filtro=${SIN_LEER}`}
        aria-current={soloSinLeer ? 'page' : undefined}
        className={pastilla(soloSinLeer)}
      >
        Sin leer
        {unread > 0 && (
          <span
            className={`tabular-nums ${soloSinLeer ? 'text-primary' : 'text-text-disabled'}`}
            aria-hidden="true"
          >
            {unread}
          </span>
        )}
      </Link>
    </nav>
  );
}

function pastilla(activa: boolean): string {
  return [
    'flex items-center gap-1.5 rounded-md px-3 py-1.5 font-sans text-xs font-semibold transition-colors',
    activa
      ? 'bg-primary-muted text-primary'
      : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
  ].join(' ');
}

/** La ruta de la bandeja conservando el filtro. Absoluta: la consume `Pagination`. */
function hrefBandeja(page: number, soloSinLeer: boolean): string {
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (soloSinLeer) params.set('filtro', SIN_LEER);

  const query = params.toString();
  return query ? `/dashboard/notifications?${query}` : '/dashboard/notifications';
}
