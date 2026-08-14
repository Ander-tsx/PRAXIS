import { POST_AUTH_DESTINATION } from '@/lib/navigation';
import { SESSION_COOKIE, hasValidSessionToken, redirectToZone } from '@praxis/commons/auth';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Guard de auth-front: quien ya tiene sesión no debe ver login ni registro.
 *
 * En Next 16 este archivo sustituye a `middleware.ts` y la función se llama
 * `proxy`. Verificado en:
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 *
 * Se **verifica** la firma del token, no basta con que la cookie exista: si el
 * token está caducado o es inválido el usuario tiene que poder llegar al login
 * para volver a entrar. Comprobar solo la presencia de la cookie lo dejaría
 * encerrado fuera.
 */

/** Rutas públicas de esta zona, ya sin el basePath `/auth`. */
const GUEST_ONLY_ROUTES = new Set(['/login', '/signup']);

/**
 * La verificación vive en `@praxis/commons/auth` para que las dos zonas que
 * hacen este mismo guard no la dupliquen. Si el token está caducado o la firma
 * no cuadra devuelve false, y aquí eso significa dejar pasar al login: es justo
 * lo que ese usuario necesita.
 */
async function hasValidSession(request: NextRequest): Promise<boolean> {
  return hasValidSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!GUEST_ONLY_ROUTES.has(pathname)) {
    return NextResponse.next();
  }

  if (!(await hasValidSession(request))) {
    return NextResponse.next();
  }

  /**
   * `redirectToZone` construye la URL sobre el origen público
   * (`x-forwarded-host`), no sobre `request.url`, que aquí apunta al puerto
   * interno de esta zona y sacaría al usuario del shell.
   */
  return redirectToZone(request, POST_AUTH_DESTINATION);
}

export const config = {
  matcher: ['/login', '/signup'],
};
