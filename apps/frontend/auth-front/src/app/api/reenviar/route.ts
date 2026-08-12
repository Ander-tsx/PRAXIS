import { gatewayAuthPost } from '@/lib/gateway';
import { ApiError } from '@praxis/commons/api';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * BFF — POST /auth/api/reenviar
 *
 * ⚠️ Responde 200 siempre, exista la cuenta o no. Es la misma promesa que hace
 * el gateway y aquí no se puede romper: cualquier diferencia convertiría esto
 * en un comprobador de quién está registrado.
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
    await gatewayAuthPost('/auth/resend-verification', { email: email.trim() });
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

    console.error('[reenviar] error inesperado', error);
    return NextResponse.json({ message: 'Ocurrió un error inesperado.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
