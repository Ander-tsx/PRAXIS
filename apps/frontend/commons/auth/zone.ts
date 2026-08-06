import { type NextRequest, NextResponse } from 'next/server';

/**
 * Utilidades para redirigir entre zonas del multi-zone.
 *
 * El problema: el navegador está siempre en el origen del shell
 * (`localhost:4100`), pero cada zona recibe la petición reescrita en su propio
 * puerto. Dentro de auth-front, `request.url` es `http://localhost:4101/...`.
 *
 * Next exige una URL **absoluta** en `NextResponse.redirect`, así que usar
 * `request.url` sacaría al usuario del shell y lo mandaría al puerto interno de
 * la zona. El origen público correcto viaja en `x-forwarded-host`, que el
 * rewrite del shell añade.
 */

/**
 * Origen público desde el que el navegador ve la aplicación.
 * Cae a `host` cuando la zona se sirve directamente, sin shell delante.
 */
export function getPublicOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost ?? request.headers.get('host');

  if (!host) return request.nextUrl.origin;

  const proto =
    request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');

  return `${proto}://${host}`;
}

/**
 * Redirección a una ruta servida por otra zona (o por el shell).
 *
 * `path` se escribe **sin** el basePath de la zona actual: es una ruta del
 * shell, no de esta app.
 */
export function redirectToZone(request: NextRequest, path: string, status = 307): NextResponse {
  return NextResponse.redirect(new URL(path, getPublicOrigin(request)), status);
}
