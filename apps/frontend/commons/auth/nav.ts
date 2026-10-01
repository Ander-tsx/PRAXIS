import { hasAdminRole } from '../api/domain';
import type { NotificationPage } from '../api/domain';
import type { OrgDelSelector } from '../organisms/AppLayout/AppShell';
import {
  APP_NAV_ITEMS,
  type AppNavItem,
  SECTION_ADMINISTRACION,
} from '../organisms/AppLayout/navigation';
import { getOrganizacionActiva, resolverOrganizacionActiva } from '../theme/organizacion';
import { type CurrentUser, loadCurrentUser } from './current-user';
import { createServerApiClient } from './server-client';

/*
 * 🕳️ Aquí vivían `AVISOS_HREF` y `CHAT_HREF`.
 *
 * 🔴 **Las insignias ya no se emparejan por `href`, y por eso desaparecieron.**
 *
 * El emparejamiento era `item.href === CHAT_HREF`, con el aviso escrito de que
 * un desajuste «no da error, simplemente deja la insignia a cero para siempre».
 * Es exactamente lo que pasó: `ac4caf1` mudó el directorio de chats y la bandeja
 * de avisos a **pestañas de la barra lateral** y borró sus entradas de
 * `APP_NAV_ITEMS`, dejando esta función buscando dos `href` que ya no existían.
 * Se seguían pidiendo cuatro endpoints por carga de página, en las siete zonas,
 * para calcular dos números que no pintaba nadie.
 *
 * Los contadores ya no son de ninguna entrada de menú: son del armazón, que es
 * quien dibuja esas pestañas. Salen de `loadPrivateChrome()` como campos
 * propios —`mensajesSinLeer`, `avisosSinLeer`— y `AppShell` los pinta encima de
 * su pestaña. `AppNavItem.badge` sigue existiendo para quien lo necesite; hoy no
 * lo usa nadie.
 */

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
 * Un solo ajuste, y tiene que pasar aquí y no en `APP_NAV_ITEMS`, que no sabe
 * quién está delante: el grupo de administración entero se cae si la cuenta no
 * administra. Las cuatro pantallas (`Cuentas`, `Proyectos`, `Organizaciones`,
 * `Actividad`) comparten sección, así que se filtra por `section` y no
 * comparando `href` sueltos, que es lo que habría habido que tocar al añadir la
 * cuarta.
 *
 * Las insignias ya no se ponen aquí: ver el hueco de arriba.
 */
function buildNavItems({ roles }: { roles: readonly string[] }) {
  const puedeAdministrar = hasAdminRole(roles);

  return APP_NAV_ITEMS.filter(
    (item) => item.section !== SECTION_ADMINISTRACION || puedeAdministrar,
  );
}

/**
 * La navegación del área privada, con la entrada de administración solo si
 * corresponde.
 *
 * ⚠️ Ya no pide nada: los contadores se fueron a `loadPrivateChrome()`, que es
 * quien los sirve al armazón. Esto se queda porque hay pantallas que solo
 * quieren la lista.
 *
 * Para una zona privada usa mejor `loadPrivateChrome()`, que resuelve esto y el
 * usuario de una vez y en paralelo.
 */
export async function loadAppNavItems(options: AppNavOptions = {}): Promise<AppNavItem[]> {
  return buildNavItems({ roles: options.roles ?? [] });
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
  /**
   * Cuál se está mirando, **ya resuelta**.
   *
   * ⚠️ `null` solo si no tienes ninguna organización, que no debería pasar: todo
   * el mundo tiene la personal. **No significa «todas»** — eso se retiró el
   * 2026-08-28 y el comentario que lo decía aquí se quedó mintiendo. Ver
   * `resolverOrganizacionActiva`.
   */
  organizacionActivaId: string | null;
  /**
   * Mensajes sin leer, privados y de equipo, para la pestaña «Chat».
   *
   * ⚠️ **Es una semilla, no la verdad.** El número se calcula al pintar en el
   * servidor y a partir de ahí lo lleva `useMessageCount` escuchando el flujo:
   * sin eso solo cambiaría al recargar. Ver su nota.
   */
  mensajesSinLeer: number;
  /** Avisos de bandeja sin leer, para la campana junto al avatar. Ídem. */
  avisosSinLeer: number;
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
    navItems: buildNavItems({ roles: user.roles }),
    mensajesSinLeer: mensajes,
    avisosSinLeer: unread,
    organizaciones,
    /* 🔴 **Resuelta, no la cookie en crudo.** Siempre hay una activa desde
       2026-08-28, y la cookie puede apuntar a una de la que ya te fueron: sin
       este repliegue, la pantalla se quedaría vacía en todas partes y las de
       organización darían `403 NOT_IN_ORG` sin explicar nada. Aquí es gratis —la
       lista ya está pedida arriba— y es el único sitio del repositorio por el
       que pasan las ocho zonas. */
    organizacionActivaId: resolverOrganizacionActiva(organizaciones, organizacionActivaId),
  };
}
