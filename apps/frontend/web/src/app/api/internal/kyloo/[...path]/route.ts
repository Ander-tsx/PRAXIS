import { type NextRequest, NextResponse } from 'next/server';

/**
 * Paso al gateway de las llamadas de Kyloo Accounts y de la pantalla de conexión
 * (docs/PLAN-OAUTH-KYLOO.md).
 *
 * El gateway no tiene dominio público, así que entra por aquí, igual que `api/mcp`.
 *
 * ## Quién es quién
 *
 * La autenticación no está aquí ni es un secreto compartido: cada cuerpo lleva **un token que
 * Kyloo firmó**, y el gateway lo verifica con las claves públicas de Kyloo. Este proxy solo
 * reenvía, sin leer nada.
 *
 * - `organizations` y `connections`: los llama la pantalla `/auth/kyloo/connect`, que el
 *   navegador abre con el token del paso de conexión.
 * - `events`: los llama Kyloo, de servidor a servidor, con un evento de identidad.
 *
 * ⚠️ Solo estas tres rutas, por `POST`. Nada más del gateway se alcanza por esta puerta, y olvidar
 * una aquí no da ningún error en local, que apunta directo al gateway: en producción da 404.
 */
export const dynamic = 'force-dynamic';

const ROUTES = new Set(['organizations', 'connections', 'events']);
/** Un token firmado y un puñado de identificadores: nada de esto pasa de unos pocos KB. */
const MAX_BODY_BYTES = 16 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const destination = path.join('/');
  if (path.length !== 1 || !ROUTES.has(destination)) return new NextResponse(null, { status: 404 });

  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });

  let response: Response;
  try {
    response = await fetch(
      `${process.env.GATEWAY_URL ?? 'http://localhost:3000'}/api/internal/kyloo/${destination}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        cache: 'no-store',
      },
    );
  } catch {
    return NextResponse.json({ message: 'Praxis no está disponible.' }, { status: 502 });
  }
  return new NextResponse(response.body, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  });
}
