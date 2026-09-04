import { gatewayPost } from '@/lib/auth/gateway';
import { ApiError } from '@praxis/commons/api';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * BFF — POST /auth/api/reset-password
 *
 * Fija la contraseña nueva con el token del enlace.
 *
 * ⚠️ **No abre sesión al terminar**, aunque sería cómodo. El backend cierra
 * todas las sesiones de esa cuenta al cambiar la contraseña —quien recupera
 * suele hacerlo porque sospecha que alguien más entró— y abrir una aquí mismo
 * contradiría eso. Se entra por el login, escribiendo la contraseña nueva, que
 * además es la forma de comprobar que se recuerda.
 */
export async function POST(request: NextRequest) {
  let body: { token?: unknown; password?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Cuerpo de la solicitud inválido.' }, { status: 400 });
  }

  const { token, password } = body;

  if (typeof token !== 'string' || typeof password !== 'string' || !token || !password) {
    return NextResponse.json({ message: 'Faltan datos obligatorios.' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json(
      { message: 'La contraseña debe tener al menos 8 caracteres.' },
      { status: 400 },
    );
  }

  try {
    await gatewayPost('/auth/reset-password', { token, password });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 429) {
        return NextResponse.json(
          { message: 'Demasiados intentos. Espera un minuto y vuelve a probar.' },
          { status: 429 },
        );
      }
      const [primero] = error.validationErrors;
      return NextResponse.json(
        { message: primero ?? error.message ?? 'No se pudo cambiar la contraseña.' },
        { status: error.status === 400 ? 400 : 500 },
      );
    }

    console.error('[reset-password] error inesperado', error);
    return NextResponse.json({ message: 'Ocurrió un error inesperado.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
