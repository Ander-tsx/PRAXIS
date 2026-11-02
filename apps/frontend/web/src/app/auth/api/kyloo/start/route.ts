import { despertarGateway } from '@/lib/auth/gateway';
import {
  KYLOO_FLOW_COOKIE,
  KYLOO_RELOGIN_COOKIE,
  configKyloo,
  nuevoIntento,
  opcionesCookieIntento,
  origenCanonico,
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
/** ¿Contesta el servidor de Kyloo? Un fallo o más de 4 s se cuenta como caído. */
async function kylooResponde(issuer: string): Promise<boolean> {
  try {
    const res = await fetch(`${issuer}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const origen = getPublicOrigin(request);
  const config = configKyloo();
  if (!config) {
    return NextResponse.redirect(new URL('/auth/login?kyloo_error=no_disponible', origen), 303);
  }

  /* Antes de crear la cookie del intento: si se hiciera en `www`, el retorno
     caería en el dominio canónico sin ella. */
  const canonico = origenCanonico(origen);
  if (canonico !== origen) {
    return NextResponse.redirect(`${canonico}/auth/api/kyloo/start${request.nextUrl.search}`, 303);
  }

  /* Si Kyloo no responde, no se manda a la persona a una pantalla de error del navegador: se
     queda en Praxis con el aviso y el login de siempre (red de seguridad, solo entrar). */
  if (!(await kylooResponde(config.issuer))) {
    return NextResponse.redirect(new URL('/auth/login?kyloo_error=no_disponible', origen), 303);
  }

  /* La persona va a tardar unos segundos en Kyloo (Google, código 2FA): tiempo de sobra para que
     la API, si estaba dormida, esté lista cuando vuelva. No se espera aquí. */
  void despertarGateway();

  const next = rutaSegura(request.nextUrl.searchParams.get('next'));
  const intento = nuevoIntento(next);
  const screenHint = request.nextUrl.searchParams.get('screen') === 'signup' ? 'signup' : undefined;
  const destino = urlDeAutorizacion(config, intento, `${origen}/auth/api/kyloo/callback`, {
    screenHint,
  });

  /* Si acaba de cerrar sesión en Praxis, primero se cierra la de Kyloo y luego se autoriza: así
     puede entrar con otra cuenta y «Continuar con Google» no entra en bucle. Ver la cookie. */
  const reautenticar = request.cookies.has(KYLOO_RELOGIN_COOKIE);
  const autorizar = new URL(destino);
  const adonde = reautenticar
    ? `${autorizar.origin}/salir?next=${encodeURIComponent(autorizar.pathname + autorizar.search)}`
    : destino;

  const response = NextResponse.redirect(adonde, 303);
  if (reautenticar) response.cookies.delete(KYLOO_RELOGIN_COOKIE);
  response.cookies.set(KYLOO_FLOW_COOKIE, await sellarIntento(intento), opcionesCookieIntento);
  return response;
}
