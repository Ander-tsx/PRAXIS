import { type NextRequest, NextResponse } from 'next/server';

/**
 * Paso al gateway para el MCP de Praxis (M15 de docs/PLAN-MCP.md).
 *
 * ## Por qué hace falta
 *
 * El gateway **no tiene dominio público** (Railway, red privada): todo lo que
 * llega de internet entra por `web`. El agente del usuario —Claude, Cursor— se
 * conecta a `https://<dominio de web>/api/mcp`, y esto lo reenvía tal cual a
 * `/api/mcp` del gateway. Es el mismo patrón que el webhook de Stripe
 * (`api/webhooks/stripe/route.ts`), y no se expone nada del backend.
 *
 * ## Lo que no puede cambiar por el camino
 *
 * - 🔴 **`Authorization` viaja intacta.** Lleva el token personal del usuario,
 *   que es toda la autenticación de esta puerta. Por eso **no vale
 *   `createGatewayProxy()`**: ese saca el Bearer de la cookie de sesión y borra
 *   la cabecera. Aquí no hay cookie ninguna.
 * - **El cuerpo pasa crudo** (`arrayBuffer`): JSON-RPC, sin reinterpretar.
 * - **La respuesta pasa como flujo**: el transporte del MCP admite SSE y, si
 *   algún día el gateway lo usa, esto no lo tiene que saber.
 *
 * ⚠️ Y `/api/` está fuera del `matcher` de `proxy.ts`: este paso no pasa por
 * el guard de sesión, y **no debe** —un agente no tiene cookie—.
 */

/** Cabeceras que no deben viajar al gateway. */
const CABECERAS_DESCARTADAS = new Set([
  'host',
  'connection',
  'content-length',
  'accept-encoding',
  /* Un navegador podría mandar la sesión aquí; el MCP no la usa y no debe
     llegarle: su identidad es el token, no la cookie. */
  'cookie',
]);

/** Cabeceras de la respuesta que no se devuelven tal cual. */
const RESPUESTA_DESCARTADA = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
]);

function urlDelGateway(): string {
  return process.env.GATEWAY_URL ?? 'http://localhost:3000';
}

async function reenviar(request: NextRequest): Promise<NextResponse> {
  const cabeceras = new Headers();
  request.headers.forEach((valor, nombre) => {
    if (!CABECERAS_DESCARTADAS.has(nombre.toLowerCase())) cabeceras.set(nombre, valor);
  });

  const conCuerpo = request.method === 'POST';

  let respuesta: Response;
  try {
    respuesta = await fetch(`${urlDelGateway()}/api/mcp`, {
      method: request.method,
      headers: cabeceras,
      ...(conCuerpo ? { body: await request.arrayBuffer() } : {}),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32002, message: 'Praxis no está disponible en este momento.' },
      },
      { status: 502 },
    );
  }

  const cabecerasRespuesta = new Headers();
  respuesta.headers.forEach((valor, nombre) => {
    if (!RESPUESTA_DESCARTADA.has(nombre.toLowerCase())) cabecerasRespuesta.set(nombre, valor);
  });

  return new NextResponse(respuesta.body, {
    status: respuesta.status,
    headers: cabecerasRespuesta,
  });
}

export const POST = reenviar;
export const GET = reenviar;
export const DELETE = reenviar;
