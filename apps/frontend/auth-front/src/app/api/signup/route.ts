import { ApiError } from '@praxis/commons/api';
import { type NextRequest, NextResponse } from 'next/server';
import { gatewayAuthPost } from '@/lib/gateway';
import { setSessionCookies } from '@/lib/session-cookie';

/**
 * BFF — POST /auth/api/signup
 *
 * 1. Recibe { email, password } del cliente
 * 2. Llama al gateway POST /api/auth/register
 * 3. Guarda las cookies de sesión y responde { success: true }
 *
 * No hace falta un auto-login: credentials-service ya emite accessToken y
 * refreshToken en el propio registro. (La versión anterior encadenaba un
 * segundo POST /auth/login innecesario.)
 *
 * Nota de producto: RegisterDto solo acepta email y password. El perfil se
 * crea con nombre y apellido vacíos y se completa después desde la página de
 * datos del usuario. Ver docs/frontend/ESTADO-ACTUAL.md §5.4
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
    tokens = await gatewayAuthPost('/auth/register', { email, password });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 409) {
        return NextResponse.json({ message: 'Este email ya está registrado.' }, { status: 409 });
      }
      if (error.status === 503) {
        return NextResponse.json({ message: error.message }, { status: 503 });
      }
      // Validación del backend: los mensajes útiles vienen en details.errors
      const [firstError] = error.validationErrors;
      return NextResponse.json(
        { message: firstError ?? 'No se pudo crear la cuenta.' },
        { status: 400 },
      );
    }

    console.error('[signup] error inesperado', error);
    return NextResponse.json({ message: 'Ocurrió un error al crear la cuenta.' }, { status: 500 });
  }

  const response = NextResponse.json({ success: true, userId: tokens.userId });
  setSessionCookies(response, tokens);
  return response;
}
