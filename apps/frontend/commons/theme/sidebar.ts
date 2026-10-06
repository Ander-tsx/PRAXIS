import { cookies } from 'next/headers';

/**
 * Si la barra lateral está plegada, **en una cookie y leída en el servidor**.
 *
 * ## Por qué no vale `localStorage`
 *
 * Ahí empezó, y se veía: `localStorage` no existe durante el renderizado del
 * servidor, así que la barra se servía siempre desplegada y se plegaba en un
 * efecto después de hidratar. El resultado era **un parpadeo en cada
 * navegación** — y en Multi-Zones cada cambio de zona es una carga completa de
 * página, así que pasaba constantemente.
 *
 * Con una cookie el servidor ya sabe el ancho al pintar el HTML: sale plegada
 * desde el primer byte y no hay nada que corregir después. Es exactamente el
 * mismo motivo por el que el tema vive en `praxis_theme` y no en el
 * almacenamiento del navegador, y por eso vive en esta misma carpeta.
 *
 * ⚠️ `path: '/'` por lo mismo que las otras dos: el navegador ve un único
 * origen —el de la aplicación— y todas sus pantallas tienen que leer la misma cookie.
 * Sin eso, plegarla en el panel no la plegaría en proyectos.
 *
 * No es `httpOnly` a propósito: la escribe el botón desde el cliente. No
 * protege nada — es una preferencia de tamaño, no una credencial.
 */
export const SIDEBAR_COOKIE = 'praxis_sidebar';

/** Un año: es una preferencia de la persona, no una sesión. */
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * ¿Está plegada?
 *
 * Solo desde Server Components, layouts o Server Actions. Cualquier valor que
 * no sea exactamente `'1'` cae a desplegada: una cookie corrompida o de una
 * versión vieja deja la barra como estaba, no rota.
 */
export async function getSidebarPlegada(): Promise<boolean> {
  const store = await cookies();
  return store.get(SIDEBAR_COOKIE)?.value === '1';
}

/**
 * Qué pestaña de la barra lateral está abierta —Inicio, Chat o Bandeja—, **en
 * una cookie y por el mismo motivo que el pliegue de arriba**.
 *
 * ## 🔴 Vivía en `localStorage`, y daba un error de hidratación en cada carga
 *
 * `AppShell` la leía dentro del inicializador de `useState`, con un
 * `typeof window !== 'undefined'` — que es **literalmente el primer punto** de
 * la lista que React imprime cuando el árbol no cuadra:
 *
 * ```
 * A tree hydrated but some attributes of the server rendered HTML didn't match
 * the client properties. This can happen if a SSR-ed Client Component used:
 * - A server/client branch `if (typeof window !== 'undefined')`.
 * ```
 *
 * En el servidor no hay `window`, así que salía siempre «Inicio»; en el cliente
 * la preferencia decía «Chat», y el primer render ya no coincidía. React avisa
 * por consola y —lo que importa— **no lo parchea**: se quedaban dos `<button
 * role="tab">` con el `aria-selected` del servidor, así que un lector de
 * pantalla anunciaba seleccionada una pestaña distinta de la que se veía.
 *
 * Con cookie, el servidor ya sabe cuál pintar. Ni error, ni parpadeo, ni
 * `aria-selected` mintiendo.
 *
 * ⚠️ **La ruta manda sobre la preferencia.** Estando en `/chat` se abre Chat
 * aunque la cookie diga otra cosa: la barra tiene que enseñar dónde estás.
 * Quien lo decide es `AppShell`; esto solo transporta la preferencia.
 *
 * ⚠️ Al cambiar de sitio se pierde la preferencia guardada de quien ya tenía
 * una: la vieja está en `localStorage` y esto lee una cookie. Es una pestaña de
 * barra lateral, se vuelve a elegir con un clic, y migrarla obligaría a
 * mantener los dos caminos vivos para siempre.
 */
export const SIDEBAR_TAB_COOKIE = 'praxis_sidebar_tab';

/** Las tres pestañas. Espejo de `SidebarTab` en `AppShell`. */
export type SidebarTabGuardada = 'home' | 'chat' | 'settings';

/**
 * Qué pestaña abrir.
 *
 * Solo desde Server Components, layouts o Server Actions. Cualquier valor que
 * no sea una de las tres cae a `home`: una cookie corrompida —o de una versión
 * que tuviera otra pestaña— deja la barra como estaba, no rota.
 */
export async function getSidebarTab(): Promise<SidebarTabGuardada> {
  const store = await cookies();
  const valor = store.get(SIDEBAR_TAB_COOKIE)?.value;
  /* Una cookie vieja con `inbox` (la bandeja ya no es pestaña) cae a `home`. */
  return valor === 'chat' || valor === 'settings' ? valor : 'home';
}

/**
 * El ancho de la barra lateral en escritorio, **en una cookie y por el mismo
 * motivo que el pliegue**: si el servidor no lo sabe, la barra sale a 320 px y
 * salta al ancho guardado al hidratar, en cada carga.
 *
 * ⚠️ Los límites se repiten en `AppShell` (cliente), por lo de siempre: este
 * módulo usa `next/headers`. Si cambian aquí, cambian allí.
 */
export const SIDEBAR_WIDTH_COOKIE = 'praxis_sidebar_width';
export const SIDEBAR_ANCHO_POR_DEFECTO = 320;
export const SIDEBAR_ANCHO_MIN = 220;
export const SIDEBAR_ANCHO_MAX = 520;

/**
 * El ancho guardado, acotado. Un valor que no sea un número —o uno fuera de
 * rango, de una versión con otros límites— cae al de siempre o al tope.
 */
export async function getSidebarAncho(): Promise<number> {
  const store = await cookies();
  const valor = Number(store.get(SIDEBAR_WIDTH_COOKIE)?.value);
  if (!Number.isFinite(valor) || valor <= 0) return SIDEBAR_ANCHO_POR_DEFECTO;
  return Math.min(SIDEBAR_ANCHO_MAX, Math.max(SIDEBAR_ANCHO_MIN, Math.round(valor)));
}
