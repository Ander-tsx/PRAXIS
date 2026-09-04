import { gatewayAuthPost } from '@/lib/auth/gateway';
import { setSessionCookies } from '@/lib/auth/session-cookie';
import { ApiError } from '@praxis/commons/api';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * BFF — POST /auth/api/login
 *
 * 1. Recibe { email, password } del cliente
 * 2. Llama al gateway POST /api/auth/login
 * 3. Guarda accessToken y refreshToken en cookies httpOnly
 * 4. Responde { success: true } — el token NUNCA llega al cliente en plano
 *
 * El gateway responde envuelto: { success, data: { userId, accessToken,
 * refreshToken }, meta }. gatewayAuthPost desenvuelve y valida la forma.
 */
export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Cuerpo de la solicitud inválido.' }, { status: 400 });
  }

  const { email, password } = body;

  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return NextResponse.json({ message: 'Email y contraseña son requeridos.' }, { status: 400 });
  }

  let tokens: Awaited<ReturnType<typeof gatewayAuthPost>>;

  try {
    tokens = await gatewayAuthPost('/auth/login', { email, password });
  } catch (error) {
    if (error instanceof ApiError) {
      // 401/403/503 se reenvían con su mensaje; el resto se generaliza para no
      // filtrar detalles internos del backend al navegador.
      if (error.status === 401) {
        return NextResponse.json({ message: 'Credenciales inválidas.' }, { status: 401 });
      }
      /* El 403 de correo sin confirmar viaja con su código: la pantalla hace
         algo distinto con él —ofrece reenviar el enlace— que con el de cuenta
         suspendida, donde no hay nada que la persona pueda hacer. */
      if (error.status === 403) {
        const codigo = (error.details as { code?: unknown } | undefined)?.code;
        return NextResponse.json(
          { message: error.message, ...(codigo === 'EMAIL_NOT_VERIFIED' ? { code: codigo } : {}) },
          { status: 403 },
        );
      }
      if (error.status === 503) {
        return NextResponse.json({ message: error.message }, { status: error.status });
      }
      /* El gateway limita a 10 logins/minuto por IP (§16 de CLAUDE.md). Un 429
         aquí casi nunca es un fallo de credenciales —es que se agotó la ventana,
         también con los reintentos— y confundirlo con una contraseña mala lleva
         al usuario a encerrarse reintentando. Se avisa aparte. */
      if (error.status === 429) {
        return NextResponse.json(
          { message: 'Demasiados intentos. Espera un minuto y vuelve a intentarlo.' },
          { status: 429 },
        );
      }
      return NextResponse.json({ message: 'Credenciales inválidas.' }, { status: 400 });
    }

    console.error('[login] error inesperado', error);
    return NextResponse.json({ message: 'Ocurrió un error al iniciar sesión.' }, { status: 500 });
  }

  const response = NextResponse.json({ success: true, userId: tokens.userId });
  setSessionCookies(response, tokens);
  return response;
}
