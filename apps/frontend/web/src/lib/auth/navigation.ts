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
 * privada. La sirve esta misma aplicación y la protege su `proxy.ts`.
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

/**
 * El destino que pidió quien mandó aquí (`?next=`), si es una ruta **de esta
 * aplicación**. Un documento compartido manda al login con su propia URL para
 * volver a él (E8 de `docs/PLAN-DOCUMENTOS.md`).
 *
 * ⚠️ Solo rutas que empiezan por una sola `/`: `//otro.com` o `https://…`
 * serían una redirección abierta —el enlace de un correo de phishing que pasa
 * por nuestro login para parecer nuestro—.
 */
export function destinoTrasEntrar(): string {
  if (typeof window === 'undefined') return POST_AUTH_DESTINATION;
  const pedido = new URLSearchParams(window.location.search).get('next');
  if (pedido && /^\/(?!\/)/.test(pedido) && !pedido.includes('\\')) return pedido;
  return POST_AUTH_DESTINATION;
}

/** Atajo para el destino posterior al login o al registro. */
export function navigateAfterAuth(): void {
  navigateToZone(destinoTrasEntrar());
}
