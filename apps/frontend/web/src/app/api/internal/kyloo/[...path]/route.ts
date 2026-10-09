import { type NextRequest, NextResponse } from 'next/server';

/**
 * Paso al gateway de las llamadas de servidor a servidor de Kyloo Accounts
 * (docs/PLAN-OAUTH-KYLOO.md).
 *
 * Accounts necesita preguntar a Praxis qué organizaciones tiene una persona y
 * guardar la que elige al conectar un cliente de IA. El gateway no tiene
 * dominio público, así que entra por aquí, igual que `api/mcp`.
 *
 * ## Lo que no puede cambiar por el camino
 *
 * - 🔴 **El cuerpo pasa crudo** (`arrayBuffer`) y las cabeceras de firma
 *   (`x-kyloo-timestamp`, `x-kyloo-signature`) tal cual: la firma HMAC cubre los
 *   bytes exactos. Reserializar el JSON la rompería sin un solo aviso útil.
 * - **Solo `organizations` y `connections`**, por `POST`. Nada más del gateway se
 *   alcanza por esta puerta.
 *
 * La autenticación es la firma, que comprueba el gateway (`KylooInternalGuard`);
 * aquí no se mira nada.
 */
export const dynamic = 'force-dynamic';

const RUTAS = new Set(['organizations', 'connections']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const destino = path.join('/');
  if (path.length !== 1 || !RUTAS.has(destino)) return new NextResponse(null, { status: 404 });

  const cabeceras = new Headers({ 'content-type': 'application/json' });
  for (const nombre of ['x-kyloo-timestamp', 'x-kyloo-signature']) {
    const valor = request.headers.get(nombre);
    if (valor) cabeceras.set(nombre, valor);
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(
      `${process.env.GATEWAY_URL ?? 'http://localhost:3000'}/api/internal/kyloo/${destino}`,
      { method: 'POST', headers: cabeceras, body: await request.arrayBuffer(), cache: 'no-store' },
    );
  } catch {
    return NextResponse.json({ message: 'Praxis no está disponible.' }, { status: 502 });
  }
  return new NextResponse(respuesta.body, {
    status: respuesta.status,
    headers: { 'content-type': respuesta.headers.get('content-type') ?? 'application/json' },
  });
}
