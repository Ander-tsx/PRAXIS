import { SESSION_COOKIE } from '@praxis/commons/auth';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * La puerta de un documento, **con o sin sesión** (E8 de
 * `docs/PLAN-DOCUMENTOS.md`).
 *
 * `/api/gateway` exige sesión, y un documento compartido con «cualquiera con el
 * enlace» se tiene que poder leer sin cuenta. Esta ruta reenvía a
 * `GATEWAY_URL/api/documents/<id>/…` y **solo ahí**: el primer tramo tiene que
 * ser un UUID, así que no alcanza ninguna otra ruta del gateway. Si hay sesión,
 * la lleva; el gateway decide qué puede hacer cada uno.
 *
 * ⚠️ No renueva la sesión: de eso se encarga el guard (`src/proxy.ts`) al
 * navegar a `/d/…` o a un proyecto, que es siempre antes de pedir nada aquí.
 */
const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:3000';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function reenviar(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  if (!UUID.test(path[0] ?? '') || path.some((tramo) => tramo === '..' || tramo === '')) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Documento no encontrado.', details: {} },
      },
      { status: 404 },
    );
  }

  const cabeceras = new Headers();
  const tipo = request.headers.get('content-type');
  if (tipo) cabeceras.set('content-type', tipo);
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) cabeceras.set('authorization', `Bearer ${token}`);

  const cuerpo = request.method === 'GET' ? undefined : await request.arrayBuffer();
  const respuesta = await fetch(
    `${GATEWAY}/api/documents/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`,
    {
      method: request.method,
      headers: cabeceras,
      ...(cuerpo && cuerpo.byteLength > 0 ? { body: cuerpo } : {}),
      cache: 'no-store',
      redirect: 'manual',
    },
  ).catch(() => null);

  if (!respuesta) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'BAD_GATEWAY',
          message: 'No se pudo conectar con el servidor.',
          details: {},
        },
      },
      { status: 503 },
    );
  }

  const salida = new Headers();
  for (const nombre of [
    'content-type',
    'content-length',
    'cache-control',
    'x-content-type-options',
    'content-security-policy',
  ]) {
    const valor = respuesta.headers.get(nombre);
    if (valor) salida.set(nombre, valor);
  }
  return new NextResponse(await respuesta.arrayBuffer(), {
    status: respuesta.status,
    headers: salida,
  });
}

export { reenviar as DELETE, reenviar as GET, reenviar as PATCH, reenviar as POST };
