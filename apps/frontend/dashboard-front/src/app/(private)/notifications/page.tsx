import {
  AppHeader,
  type NotificationPage,
  Pagination,
  type Paginated,
  type UserProfile,
} from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type { Metadata } from 'next';
import { AutoRefresh } from '@/components/molecules/AutoRefresh';
import { NotificationList } from '@/components/organisms/NotificationList';

export const metadata: Metadata = {
  title: 'Notificaciones',
};

/** Cada cuánto se vuelve a pedir la bandeja. Ver `AutoRefresh`. */
const REFRESH_SECONDS = 60;

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

  const inbox = await api
    .get<NotificationPage>(`/me/notifications?page=${pagina}&limit=${POR_PAGINA}`)
    .catch(() => ({ items: [], total: 0, unread: 0 }) as NotificationPage);

  /**
   * El directorio pone nombre a los `actorId`.
   *
   * Los avisos guardan ids, como los encargados y los autores de comentarios:
   * projects-service no conoce a las personas. Si falla, cada aviso dice
   * «Alguien», que sigue siendo cierto y legible.
   */
  const directory = await api
    .get<Paginated<UserProfile>>('/users?limit=100')
    .catch(() => ({ items: [] as UserProfile[], total: 0 }));

  const usersById = new Map(directory.items.map((user) => [user.id, user]));

  return (
    <AppHeader title="Notificaciones">
      <AutoRefresh seconds={REFRESH_SECONDS} />

      <NotificationList
        notifications={inbox.items}
        unread={inbox.unread}
        usersById={usersById}
      />

      {/* `unread` viaja aparte del `total` y sigue contando la bandeja entera,
          no la página: es lo que pinta la insignia de la barra lateral. */}
      <div className="mt-6">
        <Pagination
          page={pagina}
          limit={POR_PAGINA}
          total={inbox.total}
          hrefFor={(n) =>
            n > 1
              ? `/dashboard/notifications?page=${n}`
              : '/dashboard/notifications'
          }
          nombre="avisos"
        />
      </div>
    </AppHeader>
  );
}
