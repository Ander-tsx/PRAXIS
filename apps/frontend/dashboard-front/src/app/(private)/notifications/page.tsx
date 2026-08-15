import { AutoRefresh } from '@/components/molecules/AutoRefresh';
import { NotificationList } from '@/components/organisms/NotificationList';
import {
  AppHeader,
  type NotificationPage,
  type Paginated,
  Pagination,
  type UserProfile,
} from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type { Metadata } from 'next';

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

interface PageProps {
  searchParams: Promise<{ page?: string }>;
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
 */
export default async function NotificationsPage({ searchParams }: PageProps) {
  const api = createServerApiClient();
  const { page: pageParam } = await searchParams;
  const pagina = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);

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
    .get<NotificationPage>(`/me/notifications?page=${pagina}&limit=${POR_PAGINA}`)
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

  return (
    <AppHeader title="Notificaciones">
      <AutoRefresh seconds={REFRESH_SECONDS} />

      <NotificationList notifications={inbox.items} unread={inbox.unread} usersById={usersById} />

      {/* `unread` viaja aparte del `total` y sigue contando la bandeja entera,
          no la página: es lo que pinta la insignia de la barra lateral. */}
      <div className="mt-6">
        <Pagination
          page={pagina}
          limit={POR_PAGINA}
          total={inbox.total}
          hrefFor={(n) =>
            n > 1 ? `/dashboard/notifications?page=${n}` : '/dashboard/notifications'
          }
          nombre="avisos"
        />
      </div>
    </AppHeader>
  );
}
