import { type NextRequest, NextResponse } from 'next/server';

/**
 * Paso al gateway para las rutas de voz.
 *
 * Existe porque la skill de Alexa corre en AWS Lambda, fuera de la VPC, y el
 * gateway no tiene IP pública. El shell es la única puerta pública del sistema,
 * así que el tráfico de voz entra por aquí y sale hacia la red privada.
 *
 * ⚠️ **No se puede resolver con un `rewrite()` de `next.config.ts`.** Ya se
 * intentó y falla de una forma que engaña: Next evalúa `rewrites()` al
 * **construir** y guarda el destino ya resuelto en `routes-manifest.json`. Como
 * en el build `GATEWAY_URL` es un valor de relleno, el destino queda cocido
 * como `http://localhost:3000/...` y en producción responde 500 — aunque el
 * proceso tenga la variable correcta en el entorno.
 *
 * (Los rewrites hacia las zonas sí funcionan, pero por casualidad:
 * `http://localhost:4101` resulta ser correcto también en producción porque las
 * seis apps comparten máquina. El gateway está en otra.)
 *
 * ⚠️ Tampoco vale `createGatewayProxy()` de `@praxis/commons/auth`: ese saca el
 * Bearer de la cookie de sesión y **elimina** la cabecera `Authorization`
 * entrante. Aquí hace falta lo contrario — un altavoz no tiene cookies y trae
 * su propio token de voz, que es un secreto distinto del JWT de la plataforma,
 * de solo lectura y con caducidad larga.
 *
 * Quien autoriza sigue siendo el gateway: esto solo transporta.
 */

/** Cabeceras que no deben viajar al gateway. */
const CABECERAS_DESCARTADAS = new Set([
  /* El origen público no es el destino: reenviarlo confundiría al gateway sobre
     a quién responde. */
  'host',
  'connection',
  'content-length',
  'accept-encoding',
  /* Una petición de voz no lleva sesión de navegador. Si llegara una cookie,
     no pinta nada aquí. */
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

async function reenviar(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  const ruta = (path ?? []).join('/');
  const consulta = request.nextUrl.search;

  const destino = `${urlDelGateway()}/api/alexa/${ruta}${consulta}`;

  const cabeceras = new Headers();
  request.headers.forEach((valor, nombre) => {
    if (!CABECERAS_DESCARTADAS.has(nombre.toLowerCase())) {
      cabeceras.set(nombre, valor);
    }
  });

  /* El gateway aplica límites por IP en el canje por voz. Sin esto vería
     siempre la del shell y trataría a todos los aparatos como uno solo. */
  const ipCliente = request.headers.get('x-forwarded-for');
  if (ipCliente) cabeceras.set('x-forwarded-for', ipCliente);

  const cuerpo =
    request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();

  let respuesta: Response;
  try {
    respuesta = await fetch(destino, {
      method: request.method,
      headers: cabeceras,
      body: cuerpo,
      /* Sin caché: son consultas de estado del proyecto, y una respuesta vieja
         leída en voz alta es peor que un error. */
      cache: 'no-store',
    });
  } catch {
    /* El gateway no contesta. Se responde con el mismo sobre que usa el resto
       de la plataforma para que la skill no tenga que distinguir dos formatos
       de error. */
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'BAD_GATEWAY',
          message: 'El servicio no está disponible en este momento',
          details: {},
        },
      },
      { status: 502 },
    );
  }

  const cabecerasRespuesta = new Headers();
  respuesta.headers.forEach((valor, nombre) => {
    if (!RESPUESTA_DESCARTADA.has(nombre.toLowerCase())) {
      cabecerasRespuesta.set(nombre, valor);
    }
  });

  return new NextResponse(respuesta.body, {
    status: respuesta.status,
    headers: cabecerasRespuesta,
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return reenviar(request, context);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return reenviar(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  return reenviar(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  return reenviar(request, context);
}
