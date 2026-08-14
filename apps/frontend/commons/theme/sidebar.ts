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
 * origen —el del web-shell— y las cinco zonas tienen que leer la misma cookie.
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
