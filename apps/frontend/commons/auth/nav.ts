import { hasAdminRole } from '../api/domain';
import type { NotificationPage } from '../api/domain';
import type { OrgDelSelector } from '../organisms/AppLayout/AppShell';
import {
  APP_NAV_ITEMS,
  type AppNavItem,
  SECTION_ADMINISTRACION,
} from '../organisms/AppLayout/navigation';
import { getOrganizacionActiva } from '../theme/organizacion';
import { type CurrentUser, loadCurrentUser } from './current-user';
import { createServerApiClient } from './server-client';

/**
 * Dónde va la insignia de avisos sin leer: **en el Panel** (E4.3).
 *
 * La bandeja era una pantalla propia con su entrada de menú. Ahora es una
 * sección del panel, así que la entrada se ha ido y su insignia se muda a la del
 * Panel — que es donde lleva ese número si lo pulsas.
 *
 * ⚠️ Tiene que coincidir **exactamente** con el `href` de la entrada en
 * `navigation.tsx`: el emparejamiento es por igualdad de cadena, así que un
 * desajuste no da error, simplemente deja la insignia a cero para siempre.
 */
const AVISOS_HREF = '/dashboard';

/** Href de los mensajes directos, que llevan su propia insignia. */
const CHAT_HREF = '/chat';

export interface AppNavOptions {
  /**
   * Roles globales de quien mira. Sin ellos, la entrada de administración **no**
   * se enseña: es el valor seguro, y quien no los pase no la verá aunque le
   * corresponda.
   */
  roles?: readonly string[];
}

/**
 * Cuántas notificaciones sin leer, o cero si no se pudo saber.
 *
 * Petición mínima —`unreadOnly` con `limit=1`, solo interesa el contador— y
 * **degrada a cero** si falla: no saber cuántas hay no es motivo para tumbar una
 * página entera.
 */
async function loadUnreadCount(): Promise<number> {
  try {
    const inbox = await createServerApiClient().get<NotificationPage>(
      '/me/notifications?unreadOnly=true&limit=1',
    );
    return inbox.unread;
  } catch {
    return 0;
  }
}

/**
 * Cuántos mensajes sin leer hay en total: **privados y de equipo**.
 *
 * ⚠️ **No sale de la bandeja**, y por eso hacen falta peticiones aparte: un
 * mensaje de chat viaja por el flujo de eventos pero **no es un
 * `NotificationType`** y no deja fila en `notifications` — cincuenta mensajes
 * serían cincuenta avisos por persona. Lo que sí hay es el `unread` por canal
 * que devuelven `GET /me/chats` y `GET /me/chats/projects`.
 *
 * ⚠️ **Contaba solo los privados, y esa era la discrepancia.** La entrada de la
 * barra lateral se llama «Mensajes» y lleva a una pantalla con las dos pestañas
 * —Directos y Proyectos—, así que dejar fuera los de equipo hacía que un mensaje
 * en el chat de un proyecto sonara, apareciera en la lista y **no moviera la
 * insignia**: el número decía menos de lo que la propia pantalla enseñaba.
 *
 * Las dos en paralelo, y cada una degrada a cero por su cuenta: no saber cuántos
 * hay no puede tumbar la página, y que falle una no debe llevarse a la otra.
 */
async function loadChatUnreadCount(): Promise<number> {
  const api = createServerApiClient();

  const [directos, proyectos] = await Promise.all([
    api.get<{ unread?: number }[]>('/me/chats').catch(() => []),
    api.get<{ unread?: number }[]>('/me/chats/projects').catch(() => []),
  ]);

  return [...directos, ...proyectos].reduce((suma, canal) => suma + (canal.unread ?? 0), 0);
}

/**
 * La lista canónica adaptada a quien mira. Sin red: solo decide.
 *
 * Dos ajustes, y los dos tienen que pasar aquí y no en `APP_NAV_ITEMS`, que no
 * sabe quién está delante:
 *
 * - el grupo de administración entero se cae si la cuenta no administra —las
 *   tres pantallas (`Cuentas`, `Proyectos`, `Actividad`) comparten sección, así
 *   que se filtra por `section` y no comparando tres `href` sueltos;
 * - la insignia de avisos solo aparece con algo sin leer, porque una insignia que
 *   enseña un cero es una insignia que enseña nada.
 */
function buildNavItems({
  roles,
  unread,
  mensajes,
}: { roles: readonly string[]; unread: number; mensajes: number }) {
  const puedeAdministrar = hasAdminRole(roles);

  return APP_NAV_ITEMS.filter(
    (item) => item.section !== SECTION_ADMINISTRACION || puedeAdministrar,
  ).map((item) => {
    if (item.href === AVISOS_HREF && unread > 0) return { ...item, badge: unread };
    /* Los mensajes llevan la suya, y por el mismo criterio: sin nada sin leer no
       hay insignia, porque una que enseña un cero no informa de nada. */
    if (item.href === CHAT_HREF && mensajes > 0) return { ...item, badge: mensajes };
    return item;
  });
}

/**
 * La navegación del área privada, con el contador puesto y la entrada de
 * administración solo si corresponde.
 *
 * Existe porque **la insignia tiene que verse desde cualquier pantalla**, no solo
 * desde las dos que ya pedían la bandeja.
 *
 * Para una zona privada usa mejor `loadPrivateChrome()`, que resuelve esto y el
 * usuario de una vez y en paralelo.
 */
export async function loadAppNavItems(options: AppNavOptions = {}): Promise<AppNavItem[]> {
  const [unread, mensajes] = await Promise.all([loadUnreadCount(), loadChatUnreadCount()]);
  return buildNavItems({ roles: options.roles ?? [], unread, mensajes });
}

export interface PrivateChrome extends CurrentUser {
  navItems: AppNavItem[];
  /**
   * Las organizaciones a las que perteneces, para el selector de la barra.
   *
   * ⚠️ **Vacío si no se pudieron leer**, no `null`. El selector sin lista se
   * comporta como el marcador de antes: enseña tu espacio y no ofrece cambiar.
   * Un fallo aquí no puede dejar sin barra lateral a nadie.
   */
  organizaciones: OrgDelSelector[];
  /** Cuál se está mirando. `null` es **todas**, no la personal. */
  organizacionActivaId: string | null;
}

/**
 * Todo lo que necesita el armazón de una zona privada, en una sola llamada.
 *
 * ## Por qué existe
 *
 * Los cuatro `layout.tsx` privados hacían
 * `Promise.all([loadCurrentUser(), loadAppNavItems()])`, y eso se rompe en cuanto
 * la navegación depende del rol: los roles los devuelve `loadCurrentUser`, así
 * que las dos llamadas tendrían que encadenarse y se pagaría un salto de red de
 * más **en cada zona**.
 *
 * Aquí no se encadenan. Lo único que hacía falta de `loadCurrentUser` era la
 * lista de roles, que **no** interviene en pedir el contador de avisos, así que
 * las dos peticiones salen juntas y el filtro se aplica al final, ya sin red. El
 * coste es el mismo que antes de que la navegación dependiera del rol.
 *
 * Y con cuatro copias del mismo `Promise.all` repartidas por las zonas, la
 * alternativa era arreglar lo mismo cuatro veces.
 */
export async function loadPrivateChrome(): Promise<PrivateChrome> {
  /* Las tres en paralelo: ninguna depende de las otras, y encadenarlas pagaría
     dos saltos de red de más en cada zona. */
  /* Las cuatro en paralelo: ninguna depende de las otras, y encadenarlas
     pagaría saltos de red de más en cada zona.

     ⚠️ La lista de organizaciones entra aquí y no en cada `layout.tsx` por lo
     mismo que la navegación: con seis copias del mismo `Promise.all` repartidas
     por las zonas, la alternativa era arreglar lo mismo seis veces. Y aquí es
     gratis — no encadena nada. */
  const [user, unread, mensajes, organizaciones, organizacionActivaId] = await Promise.all([
    loadCurrentUser(),
    loadUnreadCount(),
    loadChatUnreadCount(),
    createServerApiClient()
      .get<OrgDelSelector[]>('/me/organizations')
      .catch(() => [] as OrgDelSelector[]),
    getOrganizacionActiva(),
  ]);

  return {
    ...user,
    navItems: buildNavItems({ roles: user.roles, unread, mensajes }),
    organizaciones,
    organizacionActivaId,
  };
}
