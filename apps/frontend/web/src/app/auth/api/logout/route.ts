import { KYLOO_RELOGIN_COOKIE, KYLOO_RELOGIN_SEGUNDOS, configKyloo } from '@/lib/auth/kyloo';
import { REFRESH_COOKIE, SESSION_COOKIE, clearSessionCookies } from '@/lib/auth/session-cookie';
import { fetchAlGateway } from '@praxis/commons/api/despertar';
import { type NextRequest, NextResponse } from 'next/server';

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:3000';

/**
 * BFF — POST /auth/api/logout
 *
 * 1. Avisa al gateway (POST /api/auth/logout) para que credentials-service
 *    borre la sesión de Redis — eso invalida el refresh token del lado servidor
 * 2. Borra las cookies del navegador
 *
 * El paso 1 es best-effort: si el gateway no responde igualmente cerramos la
 * sesión local, porque dejar la cookie puesta es peor que dejar huérfana una
 * entrada en Redis (que caduca sola a los 7 días).
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (token) {
    /**
     * ⚠️ **Aquí había una llamada a `PUT /api/me/presence` para marcarse
     * ausente, y esa ruta no existe en el gateway.**
     *
     * La presencia se cambiaba con `PATCH /users/:id`. O sea que esto respondía
     * 404 en cada cierre de sesión, el `catch` se lo tragaba y el parche de
     * «ponerse ausente al salir» **nunca hizo nada** — solo añadía un viaje de
     * red a un camino que el usuario está esperando.
     *
     * Ya no hace falta ninguna llamada: la presencia la gobierna el servidor y
     * depende de tener el flujo de eventos abierto. Al cerrar sesión el
     * navegador abandona la página, el flujo se cierra y el gateway marca
     * ausente por su cuenta, sin que nadie tenga que acordarse de avisar.
     */
    try {
      /**
       * ⚠️ **Hay que mirar el `ok`, no solo el `catch`.**
       *
       * `fetch` solo lanza si no llega a hablar con el servidor: un 400 o un 500
       * son respuestas normales para él, así que este `try/catch` **no ve un
       * rechazo del gateway**. Y eso no es hipotético — es exactamente lo que
       * pasó: `POST /auth/logout` respondía 400 siempre (tipaba el `@Body()` con
       * el DTO del microservicio, que exige un `userId` que el controlador saca
       * del token), y aquí nadie se enteró. La cookie se borraba abajo, la
       * persona veía que había salido, y su refresh token seguía canjeable en
       * Redis **siete días**. Un token robado sobrevivía al cierre de sesión.
       *
       * Se sigue borrando la cookie pase lo que pase —quien pide salir, sale—,
       * pero el fallo deja de ser invisible.
       */
      const respuesta = await fetchAlGateway(`${GATEWAY_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        /**
         * El refresh token dice **cuál** de las sesiones se cierra.
         *
         * Una cuenta puede tener varias abiertas a la vez, así que salir en el
         * portátil no debe echar del móvil. Sin este cuerpo, el backend las
         * cerraría todas —que es lo que hacía antes, y lo que sigue haciendo si
         * la cookie no está—.
         */
        body: JSON.stringify(refreshToken ? { refreshToken } : {}),
        cache: 'no-store',
      });

      if (!respuesta.ok) {
        console.error(
          `[logout] el gateway rechazó el cierre de sesión con ${respuesta.status}: la sesión del servidor sigue viva`,
        );
      }
    } catch (error) {
      console.warn('[logout] no se pudo notificar al gateway', error);
    }
  }

  const response = NextResponse.json({ success: true });
  clearSessionCookies(response);
  /* La sesión de Kyloo sigue abierta (es de todos sus productos): se anota que la próxima
     entrada con Kyloo tiene que pedir credenciales. Ver `KYLOO_RELOGIN_COOKIE`. */
  if (configKyloo()) {
    response.cookies.set(KYLOO_RELOGIN_COOKIE, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: KYLOO_RELOGIN_SEGUNDOS,
    });
  }
  return response;
}
