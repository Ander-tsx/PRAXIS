import { createSessionRefreshProxy } from '@praxis/commons/auth';

/**
 * Proxy del web-shell (en Next 16 sustituye a middleware.ts).
 *
 * Mantiene viva la sesión: el access token dura 15 minutos, así que se renueva
 * de forma transparente mientras el refresh token siga siendo válido. De lo
 * contrario, volver a una pestaña abierta hace 20 minutos mostraría "Iniciar
 * sesión" a alguien que sigue autenticado.
 *
 * **No protege rutas.** El shell solo sirve la landing pública; cada zona
 * privada trae su propio guard (`dashboard-front/src/proxy.ts`). Es lo que
 * permite desplegar y probar una zona por su cuenta.
 */
export const proxy = createSessionRefreshProxy();

export const config = {
  /**
   * Solo las páginas **del shell**.
   *
   * Se excluyen los assets de Next, el favicon, las rutas de API y **los
   * prefijos de las zonas**: `/auth/*`, `/dashboard/*` y `/projects/*` los sirve otra app, que
   * ya renueva la sesión en su propio proxy. Sin esta exclusión pagaríamos el
   * salto de red al gateway dos veces por navegación.
   */
  matcher: [
    /**
     * ⚠️ `'/'` va aparte: el patrón con lookahead negativo **no casa la raíz**.
     * Sin esta entrada la landing nunca renovaba la sesión, que es justo el
     * caso para el que existe este proxy: volver a una pestaña abierta hace 20
     * minutos y que el navbar siga diciendo "Ir al panel".
     */
    '/',
    '/((?!_next/static|_next/image|favicon.ico|api/|auth(?:/|$)|dashboard(?:/|$)|projects(?:/|$)).*)',
  ],
};
