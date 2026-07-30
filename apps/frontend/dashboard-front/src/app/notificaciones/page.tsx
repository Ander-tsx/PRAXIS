import {
  APP_NAV_ITEMS,
  AppLayout,
  LogoutButton,
  type NotificationPage,
  type Paginated,
  type UserProfile,
  displayName,
} from '@praxis/commons';
import { createServerApiClient, loadCurrentUser } from '@praxis/commons/auth';
import type { Metadata } from 'next';
import { AutoRefresh } from '@/components/molecules/AutoRefresh';
import { NotificationList } from '@/components/organisms/NotificationList';

export const metadata: Metadata = {
  title: 'Avisos',
};

/** Cada cuánto se vuelve a pedir la bandeja. Ver `AutoRefresh`. */
const REFRESH_SECONDS = 60;

/**
 * Bandeja de avisos.
 *
 * Es una página del panel y no una zona propia: son una lista y dos botones, y
 * montar una zona son nueve pasos de checklist (§17.7) para servir eso. La
 * entrada de la barra lateral apunta aquí.
 *
 * **Las invitaciones siguen en el panel, con sus botones.** Aquí aparece el
 * aviso de que llegaron, pero responder se hace allí: duplicar los botones
 * crearía dos sitios donde aceptar lo mismo y el segundo en enterarse fallaría.
 */
export default async function NotificationsPage() {
  const { profile } = await loadCurrentUser();
  const api = createServerApiClient();

  const inbox = await api
    .get<NotificationPage>('/me/notifications?limit=50')
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

  const navItems = APP_NAV_ITEMS.map((item) =>
    item.href === '/dashboard/notificaciones' ? { ...item, badge: inbox.unread } : item,
  );

  return (
    <AppLayout
      navItems={navItems}
      activePath="/dashboard/notificaciones"
      title="Avisos"
      user={{ name: displayName(profile), email: profile.credential.email }}
      footerSlot={<LogoutButton />}
    >
      <AutoRefresh seconds={REFRESH_SECONDS} />

      <NotificationList
        notifications={inbox.items}
        unread={inbox.unread}
        usersById={usersById}
      />
    </AppLayout>
  );
}
