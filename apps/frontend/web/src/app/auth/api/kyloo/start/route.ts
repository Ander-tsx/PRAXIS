import {
  KYLOO_FLOW_COOKIE,
  configKyloo,
  nuevoIntento,
  opcionesCookieIntento,
  rutaSegura,
  sellarIntento,
  urlDeAutorizacion,
} from '@/lib/auth/kyloo';
import { getPublicOrigin } from '@praxis/commons/auth';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * BFF — GET /auth/api/kyloo/start
 *
 * Empieza la entrada con Kyloo Accounts: prepara PKCE, `state` y `nonce`, los
 * guarda en una cookie firmada y manda a la persona a Accounts. Es una
 * **navegación**, no un `fetch`: el botón es un enlace, que es lo que un
 * navegador sabe seguir hacia otro origen sin CORS.
 */
export async function GET(request: NextRequest) {
  const origen = getPublicOrigin(request);
  const config = configKyloo();
  if (!config) {
    return NextResponse.redirect(new URL('/auth/login?kyloo_error=no_disponible', origen), 303);
  }

  const next = rutaSegura(request.nextUrl.searchParams.get('next'));
  const intento = nuevoIntento(next);
  const destino = urlDeAutorizacion(config, intento, `${origen}/auth/api/kyloo/callback`);

  const response = NextResponse.redirect(destino, 303);
  response.cookies.set(KYLOO_FLOW_COOKIE, await sellarIntento(intento), opcionesCookieIntento);
  return response;
}
