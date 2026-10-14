import { type NextRequest, NextResponse } from 'next/server';

/**
 * Paso al gateway del recordatorio de vencimientos (docs/PLAN-PUSH.md).
 *
 * Lo llama el cron de Railway —dos veces al día— con `x-cron-secret`. El gateway
 * no tiene dominio público, así que entra por aquí, igual que `api/mcp`. La
 * autenticación es el secreto, que comprueba el gateway; aquí solo se reenvía.
 *
 * El `modo` (`hoy` o `manana`) es opcional: sin él, el gateway lo decide por la
 * hora de México.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const cabeceras = new Headers();
  const secreto = request.headers.get('x-cron-secret');
  if (secreto) cabeceras.set('x-cron-secret', secreto);

  const modo = request.nextUrl.searchParams.get('modo');
  const query = modo ? `?modo=${encodeURIComponent(modo)}` : '';

  let respuesta: Response;
  try {
    respuesta = await fetch(
      `${process.env.GATEWAY_URL ?? 'http://localhost:3000'}/api/internal/push/vencimientos${query}`,
      { method: 'POST', headers: cabeceras, cache: 'no-store' },
    );
  } catch {
    return NextResponse.json({ message: 'Praxis no está disponible.' }, { status: 502 });
  }
  return new NextResponse(respuesta.body, {
    status: respuesta.status,
    headers: { 'content-type': respuesta.headers.get('content-type') ?? 'application/json' },
  });
}
