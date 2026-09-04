import { gatewayPost } from '@/lib/auth/gateway';
import { ApiError } from '@praxis/commons/api';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * BFF — POST /auth/api/signup
 *
 * 1. Recibe { email, password } del cliente
 * 2. Llama al gateway POST /api/auth/register
 * 3. Responde { success: true } **sin abrir sesión**
 *
 * ⚠️ **Registrarse ya no deja dentro, y es el punto entero de la confirmación
 * por correo.** Aquí se guardaban las cookies de sesión que devolvía el
 * registro; con eso puesto, cualquiera se registraba con un correo inventado y
 * se quedaba usando el sistema sin abrirlo jamás. Ahora se entra por el login,
 * después de confirmar.
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

  try {
    /* ⚠️ `gatewayPost` y no `gatewayAuthPost`: aquel **exige** que la respuesta
       traiga `{ userId, accessToken, refreshToken }` y lanza un 502 si no. Desde
       que registrarse no abre sesión, esa validación rechazaba todas las altas
       correctas y la pantalla decía «no se pudo crear la cuenta» sobre una
       cuenta que sí se había creado. */
    await gatewayPost<{ userId: string }>('/auth/register', { email, password });
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

  /* El correo vuelve tal cual lo escribió: la pantalla lo enseña en «te hemos
     escrito a…», y verlo escrito es lo que hace notar una errata antes de
     ponerse a esperar un correo que no va a llegar. */
  return NextResponse.json({ success: true, email });
}
