import {
  SESSION_COOKIE,
  createSessionRefreshProxy,
  hasValidSessionToken,
  redirectToZone,
} from '@praxis/commons/auth';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Guard de reports-front (en Next 16 este archivo sustituye a
 * `middleware.ts` y la función se llama `proxy`).
 *
 * **Toda la zona es privada**, así que no hay lista de rutas: o hay sesión
 * válida, o al login.
 *
 * Hace dos cosas, y el orden importa:
 *
 * 1. **Renueva la sesión.** El access token dura 15 minutos y el refresh 7
 *    días, así que se renueva de forma transparente mientras el refresh siga
 *    vivo.
 * 2. **Comprueba la firma.** Después de renovar: mirando la cookie original
 *    echaríamos al login a quien llega con el access caducado y el refresh
 *    bueno, que es justo el caso que el paso 1 acaba de arreglar.
 *
 * La zona se protege sola y no delega en el shell. Es lo que hace que se pueda
 * desplegar y probar por su cuenta, servida directamente en su puerto.
 *
 * ⚠️ Esto no sustituye a la autorización. Las Server Functions viajan como POST
 * a la ruta donde se usan, así que un cambio de `matcher` puede dejarlas fuera
 * sin avisar; cada una vuelve a comprobar la sesión por su cuenta. Y la
 * autorización real la hace siempre el gateway.
 * Verificado en:
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 */

const refreshSession = createSessionRefreshProxy();

/** Ruta del **shell**, sin el basePath de esta zona. La sirve auth-front. */
const LOGIN_PATH = '/auth/login';

/**
 * Token de sesión que vale **después** de la renovación.
 *
 * `refreshSession` deja el resultado en las cookies de la respuesta:
 * - renovó → cookie nueva con el token fresco;
 * - el refresh también murió → cookie vacía, para no dejar cookies zombis;
 * - no había nada que renovar → no toca la respuesta, y vale la de la petición.
 */
function resolveToken(request: NextRequest, response: NextResponse): string | undefined {
  const fromResponse = response.cookies.get(SESSION_COOKIE);
  if (fromResponse !== undefined) {
    return fromResponse.value || undefined;
  }
  return request.cookies.get(SESSION_COOKIE)?.value;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const response = await refreshSession(request);

  /**
   * Se verifica la **firma**, no solo que la cookie exista: una cookie caducada
   * o manipulada no puede abrir el área privada.
   */
  if (await hasValidSessionToken(resolveToken(request, response))) {
    return response;
  }

  /**
   * `redirectToZone` y no `request.url`: aquí estamos en el puerto interno de
   * la zona (4104), y redirigir sobre ese origen sacaría al usuario del shell.
   * El origen público viaja en `x-forwarded-host`. Ver ESTADO-ACTUAL §16.
   */
  const redirect = redirectToZone(request, LOGIN_PATH);

  // Arrastramos las cookies que puso el paso 1 — en este camino, el borrado de
  // las muertas. Sin esto se quedarían puestas e intentaríamos renovarlas en
  // cada navegación.
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }

  return redirect;
}

export const config = {
  /**
   * Todas las páginas de la zona. Se excluyen los assets de Next, las fuentes,
   * el favicon y `/api/gateway`, que gestiona su propia renovación al hablar
   * con el gateway y no debe responder con un redirect HTML a quien espera
   * JSON.
   *
   * ⚠️ `'/'` va aparte y es imprescindible: el patrón con lookahead negativo
   * **no casa la raíz**. Aquí eso importa más que en ninguna otra zona, porque
   * la raíz (`/reports`) es la pantalla principal: sin esta entrada se serviría
   * sin sesión mientras que `/reports/<id>` sí redirige, que es justo la forma
   * de fallo más fácil de pasar por alto. Ver ESTADO-ACTUAL §17.6.
   */
  matcher: ['/', '/((?!_next/static|_next/image|favicon.ico|fonts/|api/).*)'],
};
