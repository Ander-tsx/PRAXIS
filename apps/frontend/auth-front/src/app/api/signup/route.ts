import { decodeJwt } from 'jose';
import { type NextRequest, NextResponse } from 'next/server';

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:3000';
const COOKIE_NAME = 'praxis_session';

/**
 * BFF — POST /auth/api/signup
 *
 * Flujo:
 * 1. Recibe { email, password } del cliente
 * 2. Llama al gateway POST /auth/register
 * 3. Si registro exitoso: hace auto-login llamando a gateway POST /auth/login
 *    → setea cookie httpOnly con el token obtenido
 *    → responde { success: true }
 *
 * Decisión de diseño: auto-login tras registro.
 * Motivo: mejor UX — el usuario acaba de proporcionar sus credenciales y
 * no tiene sentido pedírselas de nuevo inmediatamente. La cookie se setea
 * igual que en el handler de login.
 */
export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Cuerpo de la solicitud inválido.' }, { status: 400 });
  }

  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json({ message: 'Email y contraseña son requeridos.' }, { status: 400 });
  }

  // Paso 1: Registrar en el gateway
  let registerRes: Response;
  try {
    registerRes = await fetch(`${GATEWAY_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return NextResponse.json(
      { message: 'No se pudo conectar con el servidor de autenticación.' },
      { status: 503 },
    );
  }

  if (!registerRes.ok) {
    const status = registerRes.status === 409 ? 409 : 400;
    const message =
      status === 409 ? 'Este email ya está registrado.' : 'No se pudo crear la cuenta.';
    return NextResponse.json({ message }, { status });
  }

  // Paso 2: Auto-login para obtener el token
  let loginRes: Response;
  try {
    loginRes = await fetch(`${GATEWAY_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    // Registro exitoso pero login falló — mandamos a login manual
    return NextResponse.json({ success: true, redirectTo: '/login' }, { status: 200 });
  }

  if (!loginRes.ok) {
    // Registro OK pero login fallido — caso raro; mandamos a login
    return NextResponse.json({ success: true, redirectTo: '/login' }, { status: 200 });
  }

  let loginData: { access_token?: string };
  try {
    loginData = await loginRes.json();
  } catch {
    return NextResponse.json({ success: true, redirectTo: '/login' }, { status: 200 });
  }

  const { access_token } = loginData;

  if (!access_token) {
    return NextResponse.json({ success: true, redirectTo: '/login' }, { status: 200 });
  }

  // Calcular maxAge desde exp real del JWT
  let maxAge: number;
  try {
    const payload = decodeJwt(access_token);
    const exp = payload.exp;
    if (typeof exp === 'number') {
      maxAge = Math.max(0, exp - Math.floor(Date.now() / 1000));
    } else {
      maxAge = 60 * 60 * 24;
    }
  } catch {
    maxAge = 60 * 60 * 24;
  }

  const isProduction = process.env.NODE_ENV === 'production';

  const response = NextResponse.json({ success: true });

  response.cookies.set(COOKIE_NAME, access_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });

  return response;
}
