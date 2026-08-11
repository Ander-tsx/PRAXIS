import { ApiError } from '@praxis/commons/api';
import { type NextRequest, NextResponse } from 'next/server';
import { gatewayAuthPost } from '@/lib/gateway';
import { setSessionCookies } from '@/lib/session-cookie';

/**
 * BFF — POST /auth/api/google
 *
 * 1. Recibe { idToken } que Google Identity Services generó en el navegador
 * 2. Llama al gateway POST /api/auth/google, que verifica la firma
 * 3. Guarda accessToken y refreshToken en cookies httpOnly
 *
 * Mismo recorrido que `/auth/api/login`, y a propósito: la sesión que sale de
 * aquí es idéntica a la de una entrada con contraseña. A partir de este punto
 * el resto de la aplicación no distingue —ni necesita distinguir— cómo entró
 * la persona.
 *
 * ⚠️ El `idToken` no se decodifica aquí. Podría hacerse —es un JWT y su carga
 * se lee sin la clave— pero leerlo sin verificar la firma invitaría a confiar
 * en lo que diga. Quien lo valida es credentials-service, contra las claves
 * públicas de Google. Este archivo solo transporta.
 */
export async function POST(request: NextRequest) {
  let body: { idToken?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Cuerpo de la solicitud inválido.' }, { status: 400 });
  }

  const { idToken } = body;

  if (typeof idToken !== 'string' || !idToken) {
    return NextResponse.json({ message: 'Falta el token de Google.' }, { status: 400 });
  }

  let tokens: Awaited<ReturnType<typeof gatewayAuthPost>>;

  try {
    tokens = await gatewayAuthPost('/auth/google', { idToken });
  } catch (error) {
    if (error instanceof ApiError) {
      /**
       * El 409 se reenvía con su mensaje entero, y es el único caso en que
       * merece la pena ser explícito: significa que ese correo ya tiene cuenta
       * con contraseña y que **no se vincula sola**. Sin ese texto, la persona
       * ve un error genérico y no entiende por qué su cuenta de Google «no
       * funciona» cuando el correo es suyo.
       */
      if (error.status === 409) {
        return NextResponse.json({ message: error.message }, { status: 409 });
      }

      /* Google no configurado en este entorno. */
      if (error.status === 503) {
        return NextResponse.json(
          { message: 'La entrada con Google no está disponible ahora mismo.' },
          { status: 503 },
        );
      }

      if (error.status === 401) {
        return NextResponse.json(
          { message: 'No se pudo verificar tu cuenta de Google. Inténtalo de nuevo.' },
          { status: 401 },
        );
      }

      /**
       * Límite de intentos del gateway: 10 por minuto en las rutas de
       * autenticación.
       *
       * Necesita mensaje propio. Sin él caía en el genérico de abajo y la
       * persona leía «no se pudo iniciar sesión» — que suena a que su cuenta
       * falla, cuando lo único que hace falta es esperar. Vuelve a intentarlo,
       * gasta otro intento, y la sensación es que el sistema está roto.
       */
      if (error.status === 429) {
        return NextResponse.json(
          { message: 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.' },
          { status: 429 },
        );
      }

      return NextResponse.json({ message: 'No se pudo iniciar sesión con Google.' }, { status: 400 });
    }

    console.error('[google] error inesperado', error);
    return NextResponse.json({ message: 'Ocurrió un error al iniciar sesión.' }, { status: 500 });
  }

  const response = NextResponse.json({ success: true, userId: tokens.userId });
  setSessionCookies(response, tokens);
  return response;
}
