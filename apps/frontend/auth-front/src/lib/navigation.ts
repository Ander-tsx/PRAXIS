/**
 * Navegación entre zonas del multi-zone.
 *
 * auth-front tiene `basePath: '/auth'`, y Next aplica ese prefijo
 * automáticamente a `next/link`, `useRouter()` y `redirect()`. Es decir:
 *
 *   router.push('/')  →  /auth/     ← NO sale de la zona
 *
 * Para llegar a una ruta que sirve OTRA zona hace falta una navegación dura
 * del navegador, que además fuerza que el shell recargue con la cookie de
 * sesión ya puesta.
 */

/**
 * Dónde aterriza el usuario tras iniciar sesión o registrarse.
 *
 * Es el panel, no la landing: quien acaba de identificarse quiere su área
 * privada. La sirve el web-shell y la protege su `proxy.ts`.
 */
export const POST_AUTH_DESTINATION = '/projects';

/**
 * Navega a una ruta de otra zona.
 *
 * Usa `window.location.assign` a propósito: el router de Next prefijaría la
 * ruta con `/auth` y nos dejaría dando vueltas dentro de auth-front.
 */
export function navigateToZone(path: string): void {
  window.location.assign(path);
}

/** Atajo para el destino posterior al login o al registro. */
export function navigateAfterAuth(): void {
  navigateToZone(POST_AUTH_DESTINATION);
}
