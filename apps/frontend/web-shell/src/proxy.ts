import { recordarConversacion } from '@/lib/ultimo-chat';
import {
  SESSION_COOKIE,
  createSessionRefreshProxy,
  hasValidSessionToken,
  redirectToZone,
} from '@praxis/commons/auth';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Proxy del shell (en Next 16 sustituye a `middleware.ts`).
 *
 * Hace dos trabajos, y el segundo es nuevo desde F2 de la fusión de zonas:
 *
 * 1. **Mantiene viva la sesión** en todo lo que sirve. El access token dura 15
 *    minutos y el refresh 7 días, así que se renueva de forma transparente
 *    mientras el refresh siga vivo. Sin esto, volver a una pestaña abierta hace
 *    veinte minutos enseñaría «Iniciar sesión» a alguien que sigue dentro.
 * 2. 🔴 **Protege los segmentos privados que ya se han fusionado.** Antes el
 *    shell no protegía nada —cada zona traía su guard— y esto era solo la
 *    renovación. Según entra cada zona (F2–F7), su prefijo se añade a
 *    `PREFIJOS_PRIVADOS` y su `proxy.ts` desaparece.
 *
 * ⚠️ **El orden importa**: primero se renueva, después se comprueba la firma.
 * Al revés, quien llega con el access caducado y el refresh bueno acabaría en
 * el login — que es justo el caso que el paso 1 acaba de arreglar.
 *
 * ⚠️ Esto **no es la autorización**. La hace siempre el gateway, que además
 * comprueba permisos por proyecto y rol global. Aquí se decide qué se sirve;
 * lo que protege los datos está del otro lado.
 *
 * ⚠️ Y las Server Functions viajan como POST a la ruta donde se usan, así que
 * un cambio de `matcher` puede dejarlas fuera sin avisar; cada una vuelve a
 * comprobar la sesión por su cuenta.
 * Verificado en:
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 */

const refreshSession = createSessionRefreshProxy();

/** La sirve `auth-front`, que todavía es zona aparte (entra en F7). */
const LOGIN_PATH = '/auth/login';

/**
 * Los prefijos que exigen sesión **dentro de esta aplicación**.
 *
 * ⚠️ Crece con cada zona que entra, y la que entra borra su `proxy.ts`. Una
 * zona movida cuyo prefijo se olvide aquí se sirve sin guard y no falla nada:
 * la pantalla sale, el gateway devuelve 401 y se lee como una avería, no como
 * una sesión que falta. `e2e/tests/ui/02-guards.spec.ts` lo cubre para las
 * cinco.
 */
const PREFIJOS_PRIVADOS = ['/assistant', '/chat', '/admin', '/main', '/projects'];

/**
 * Rutas que no tienen pantalla: solo llevan a otra.
 *
 * 🔴 **Van aquí y no en un `page.tsx` con `redirect()`, y la diferencia se mide.**
 * Un `redirect()` de servidor dentro de una sección privada se ejecuta *después*
 * de que su `layout.tsx` haya empezado a hacer streaming —montar el armazón pide
 * el perfil y la navegación al gateway—, así que la cabecera ya salió como 200 y
 * Next tiene que degradarlo a una redirección de cliente: **44 KB de HTML y dos
 * llamadas al gateway para una pantalla que nadie llega a ver**. Medido en F5.
 *
 * Desde aquí es un 307 limpio, sin render.
 *
 * ⚠️ Se aplican **después** de comprobar la sesión: sin ella, a estas rutas les
 * toca el login, no el destino.
 */
const REDIRECCIONES_EXACTAS: Record<string, string> = {
  /* El panel dejó de tener pantalla propia: los proyectos tienen la suya y lo
     que queda bajo `/main/*` es la cuenta. */
  '/main': '/projects',
  /* Cortesía: la pantalla pasó de `perfil` a `profile` y los marcadores viejos
     no se pueden corregir desde aquí. */
  '/main/perfil': '/main/profile',
};

/**
 * ⚠️ **`/admin` exige además rol global, y eso NO se comprueba aquí.**
 *
 * Lo hace `app/admin/layout.tsx`, y a propósito: este archivo corre en cada
 * navegación y saber el rol exige preguntar al gateway, mientras que el layout
 * ya está pidiendo el usuario de todas formas. Y un rebote silencioso al panel
 * se lee como un enlace roto; el layout puede explicarlo (`AccessDenied`).
 *
 * Ni lo uno ni lo otro es la autorización de verdad: la hace el gateway, que
 * exige rol `Admin` en las rutas de `/api/admin`.
 */

function esPrivada(pathname: string): boolean {
  return PREFIJOS_PRIVADOS.some(
    (prefijo) => pathname === prefijo || pathname.startsWith(`${prefijo}/`),
  );
}

/**
 * El token que vale **después** de la renovación.
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

  if (!esPrivada(request.nextUrl.pathname)) return response;

  /* Se verifica la **firma**, no solo que la cookie exista: una cookie caducada
     o manipulada no puede abrir el área privada. */
  if (await hasValidSessionToken(resolveToken(request, response))) {
    /**
     * Se anota qué conversación se está abriendo, para poder volver a ella.
     *
     * Va **aquí y no en la página** porque por el proxy pasa toda navegación:
     * no hay que acordarse en cada pantalla ni gastar una petición. Y va
     * **después** de validar la sesión: sin ella no hay nada que recordar.
     *
     * 🔴 ⚠️ **«Toda navegación» incluye los prefetch, y eso era el fallo.** Por
     * aquí pasa una petición por cada `<Link>` del directorio que entra en el
     * viewport, sin que nadie haya pulsado: escribían todas la cookie y ganaba
     * la última en llegar, así que Mensajes abría una conversación al azar.
     * `recordarConversacion` los descarta por cabecera; el porqué entero está
     * en su nota. Si esta llamada se mueve, ese filtro se va con ella.
     *
     * Vino del `proxy.ts` de `chat-front` con F3 de la fusión. ⚠️ Y con la
     * fusión cambió otra vez la ruta que ve: ya no hay `basePath` que Next
     * recorte, así que llega `/chat/<uuid>` entero. La resta la hace
     * `recordarConversacion`.
     */
    recordarConversacion(request, response);

    const destino = REDIRECCIONES_EXACTAS[request.nextUrl.pathname];
    if (destino) {
      const salto = redirectToZone(request, destino);
      for (const cookie of response.cookies.getAll()) salto.cookies.set(cookie);
      return salto;
    }

    return response;
  }

  /**
   * `redirectToZone` y no `request.url`: el origen público viaja en
   * `x-forwarded-host`, y redirigir sobre `request.url` sacaría al usuario al
   * puerto interno. Ver ESTADO-ACTUAL §16.
   */
  const redirect = redirectToZone(request, LOGIN_PATH);

  /* Se arrastran las cookies que puso el paso 1 — en este camino, el borrado de
     las muertas. Sin esto se quedarían puestas e intentaríamos renovarlas en
     cada navegación. */
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }

  return redirect;
}

export const config = {
  /**
   * Lo que sirve esta aplicación, y nada más.
   *
   * Se excluyen los assets de Next, el favicon, las fuentes y `api/` —que
   * incluye tanto `/api/gateway`, que gestiona su propia renovación y no debe
   * responder un redirect HTML a quien espera JSON, como
   * **`/api/webhooks/stripe`, que no lleva sesión ninguna**: su autenticación
   * es la firma de Stripe, y meterlo aquí sería romper el cobro.
   *
   * Y se excluyen **los prefijos de las zonas que todavía no se han fusionado**:
   * las sirve otra app, que ya renueva la sesión en su propio proxy, y sin esta
   * exclusión pagaríamos el salto de red al gateway dos veces por navegación.
   * Cada zona que entra sale de esta lista y entra en `PREFIJOS_PRIVADOS`.
   *
   * ⚠️ `'/'` va aparte y es imprescindible: el patrón con lookahead negativo
   * **no casa la raíz**. Sin esta entrada la landing nunca renovaba la sesión,
   * que es justo el caso para el que nació este proxy.
   */
  matcher: [
    '/',
    '/((?!_next/static|_next/image|favicon.ico|fonts/|api/|auth(?:/|$)).*)',
  ],
};
