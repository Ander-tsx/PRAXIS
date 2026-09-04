import { gatewayPost } from '@/lib/auth/gateway';
import { ApiError } from '@praxis/commons/api';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * BFF — POST /auth/api/forgot-password
 *
 * ⚠️ Responde 200 siempre. Ver la nota de `reenviar`: vale exactamente igual.
 */
export async function POST(request: NextRequest) {
  let body: { email?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Cuerpo de la solicitud inválido.' }, { status: 400 });
  }

  const email = body.email;
  if (typeof email !== 'string' || !email.trim()) {
    return NextResponse.json({ message: 'Falta un dato obligatorio.' }, { status: 400 });
  }

  try {
    await gatewayPost('/auth/forgot-password', { email: email.trim() });
  } catch (error) {
    if (error instanceof ApiError) {
      /* El 429 se distingue del resto: «espera un minuto» y «el enlace no vale»
         no se arreglan igual, y un mensaje genérico haría reintentar en bucle. */
      if (error.status === 429) {
        return NextResponse.json(
          { message: 'Demasiados intentos. Espera un minuto y vuelve a probar.' },
          { status: 429 },
        );
      }
      if (error.status === 503) {
        return NextResponse.json({ message: error.message }, { status: 503 });
      }
      return NextResponse.json(
        { message: error.message || 'No se pudo completar la operación.' },
        { status: error.status === 400 ? 400 : 500 },
      );
    }

    console.error('[forgot-password] error inesperado', error);
    return NextResponse.json({ message: 'Ocurrió un error inesperado.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
