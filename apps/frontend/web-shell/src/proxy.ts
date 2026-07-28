import { createSessionRefreshProxy } from '@praxis/commons/auth';

/**
 * Proxy del web-shell (en Next 16 sustituye a middleware.ts).
 *
 * Mantiene viva la sesión: el access token dura 15 minutos, así que se renueva
 * de forma transparente mientras el refresh token siga siendo válido. De lo
 * contrario, volver a una pestaña abierta hace 20 minutos mostraría "Iniciar
 * sesión" a alguien que sigue autenticado.
 */
export const proxy = createSessionRefreshProxy();

export const config = {
  /**
   * Solo páginas: se excluyen los assets de Next, el favicon y las rutas de
   * API — /api/gateway ya gestiona su propia renovación al hablar con el
   * gateway, y no tiene sentido pagar el salto de red dos veces.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
