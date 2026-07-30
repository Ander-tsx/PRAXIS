import { APP_NAV_ITEMS, type AppNavItem } from '../organisms/AppLayout/navigation';
import type { NotificationPage } from '../api/domain';
import { createServerApiClient } from './server-client';

/** Href de la bandeja. En un solo sitio para no repetir la cadena. */
const NOTIFICATIONS_HREF = '/dashboard/notificaciones';

/**
 * La navegación del área privada con el contador de notificaciones puesto.
 *
 * Existe porque **la insignia tiene que verse desde cualquier pantalla**, no
 * solo desde las dos que ya pedían la bandeja. Cada página que monta `AppLayout`
 * llama aquí, y así ni se duplica el `fetch` ni se olvida en la siguiente
 * pantalla que alguien añada.
 *
 * Es una petición mínima —`unreadOnly` con `limit=1`, solo interesa el
 * contador— y **degrada a la navegación sin número** si falla: no saber cuántas
 * notificaciones hay no es motivo para tumbar una página entera.
 */
export async function loadAppNavItems(): Promise<AppNavItem[]> {
  let unread = 0;

  try {
    const inbox = await createServerApiClient().get<NotificationPage>(
      '/me/notifications?unreadOnly=true&limit=1',
    );
    unread = inbox.unread;
  } catch {
    // Sin número, pero con navegación.
  }

  if (unread === 0) return APP_NAV_ITEMS;

  return APP_NAV_ITEMS.map((item) =>
    item.href === NOTIFICATIONS_HREF ? { ...item, badge: unread } : item,
  );
}
