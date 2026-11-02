import { despertarGateway, gatewayAuthPost } from '@/lib/auth/gateway';
import {
  ERRORES_KYLOO,
  KYLOO_FLOW_COOKIE,
  abrirIntento,
  opcionesCookieIntento,
} from '@/lib/auth/kyloo';
import { setSessionCookies } from '@/lib/auth/session-cookie';
import { ApiError } from '@praxis/commons/api';
import { getPublicOrigin } from '@praxis/commons/auth';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * BFF — GET /auth/api/kyloo/callback
 *
 * Kyloo Accounts devuelve aquí a la persona con `?code&state` (o `?error`).
 *
 * 1. Recupera el intento de la cookie firmada y exige que `state` coincida:
 *    sin eso, cualquiera podría hacerte «entrar» con un código suyo.
 * 2. Entrega al gateway el `code` y los secretos de **este** intento. El
 *    canje y la verificación del id_token los hace credentials-service con el
 *    secreto del cliente; aquí no se decodifica nada.
 * 3. Guarda la misma sesión que cualquier otra entrada y vuelve a `next`.
 *
 * Todo fallo acaba en `/auth/login?kyloo_error=<clave>`: la persona está en una
 * pestaña de navegación, no en un `fetch`, así que un JSON no lo vería nadie.
 */
export async function GET(request: NextRequest) {
  const origen = getPublicOrigin(request);
  const fallo = (clave: keyof typeof ERRORES_KYLOO) => {
    const response = NextResponse.redirect(
      new URL(`/auth/login?kyloo_error=${clave}`, origen),
      303,
    );
    response.cookies.set(KYLOO_FLOW_COOKIE, '', { ...opcionesCookieIntento, maxAge: 0 });
    return response;
  };

  const params = request.nextUrl.searchParams;
  if (params.get('error')) {
    return fallo(params.get('error') === 'access_denied' ? 'cancelado' : 'error');
  }

  const intento = await abrirIntento(request.cookies.get(KYLOO_FLOW_COOKIE)?.value);
  const code = params.get('code');
  if (!intento || !code || params.get('state') !== intento.state) return fallo('intento_invalido');

  /* El código de Kyloo es de un solo uso: con la API dormida el primer POST caía en el 502 de
     Railway y se perdía. Se despierta antes, con un GET que sí se reintenta. */
  await despertarGateway();

  let tokens: Awaited<ReturnType<typeof gatewayAuthPost>>;
  try {
    tokens = await gatewayAuthPost('/auth/kyloo', {
      code,
      codeVerifier: intento.codeVerifier,
      nonce: intento.nonce,
      redirectUri: `${origen}/auth/api/kyloo/callback`,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 409) {
        return fallo(
          error.message.includes('otra cuenta de Kyloo') ? 'vinculada' : 'sin_confirmar',
        );
      }
      if (error.status === 401) return fallo('no_verificado');
      if (error.status === 429) return fallo('limite');
      if (error.status === 503) return fallo('no_disponible');
      return fallo('error');
    }
    console.error('[kyloo] error inesperado', error);
    return fallo('error');
  }

  const response = NextResponse.redirect(new URL(intento.next, origen), 303);
  setSessionCookies(response, tokens);
  response.cookies.set(KYLOO_FLOW_COOKIE, '', { ...opcionesCookieIntento, maxAge: 0 });
  return response;
}
