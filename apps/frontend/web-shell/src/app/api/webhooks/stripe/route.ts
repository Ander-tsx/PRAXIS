import { type NextRequest, NextResponse } from 'next/server';

/**
 * Paso al gateway para el webhook de Stripe.
 *
 * ## Por qué hace falta
 *
 * El gateway **no tiene ninguna ruta pública**: el balanceador manda todo el
 * dominio al shell (`infra/terraform/frontend.tf`, `default_service`) y el
 * backend vive en la red privada. Stripe llama desde internet, así que sin esto
 * `https://<dominio>/api/webhooks/stripe` responde 404 — y como el plan lo
 * concede el webhook y solo el webhook, **nadie llega a PRO en producción** por
 * bien que funcione el pago.
 *
 * Es el mismo problema que resolvió el paso de voz (`api/alexa/[...path]`), y
 * por los mismos motivos:
 *
 * - **No vale un `rewrite()` de `next.config.ts`.** Next los resuelve al
 *   **construir** y guarda el destino ya cocido en `routes-manifest.json`; con
 *   `GATEWAY_URL` de relleno durante el build, en producción apunta a
 *   `localhost:3000` y responde 500 aunque el proceso tenga la variable buena.
 *   Un route handler la lee en cada petición.
 * - **No vale `createGatewayProxy()`** de `@praxis/commons/auth`: ese saca el
 *   Bearer de la cookie de sesión y borra `Authorization`. Aquí no hay sesión
 *   ninguna — la autenticación del webhook **es su firma**.
 *
 * ## 🔴 El cuerpo viaja crudo, byte a byte
 *
 * La firma de Stripe se calcula sobre **los bytes exactos** del cuerpo. Si esto
 * hiciera `request.json()` y volviera a serializar —o si algo recomprimiera por
 * el camino—, la firma dejaría de cuadrar y el gateway respondería 400 a
 * **todo**, para siempre, sin que ninguna otra cosa fallara. De ahí el
 * `arrayBuffer()` y no un `text()`: lo que entra es lo que sale.
 *
 * Es la otra mitad del `rawBody: true` de `gateway/src/main.ts`, que existe por
 * exactamente lo mismo.
 *
 * ## Lo que responde importa
 *
 * Stripe decide si reintenta mirando el código de estado, así que la respuesta
 * del gateway se devuelve tal cual. Y si el gateway no contesta, esto responde
 * **502 y no 200**: dar por bueno un evento que nadie ha procesado es perder un
 * pago en silencio.
 */

/** Cabeceras que no deben viajar al gateway. */
const CABECERAS_DESCARTADAS = new Set([
  /* El origen público no es el destino. */
  'host',
  'connection',
  /* Lo recalcula `fetch` con el cuerpo que se le pase. */
  'content-length',
  'accept-encoding',
  /* Stripe no manda cookies; si llegara una, no pinta nada aquí. */
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const destino = `${urlDelGateway()}/api/webhooks/stripe`;

  const cabeceras = new Headers();
  request.headers.forEach((valor, nombre) => {
    if (!CABECERAS_DESCARTADAS.has(nombre.toLowerCase())) {
      cabeceras.set(nombre, valor);
    }
  });

  /* El cuerpo intacto. Ver la nota de arriba: aquí se juega la firma. */
  const cuerpo = await request.arrayBuffer();

  let respuesta: Response;
  try {
    respuesta = await fetch(destino, {
      method: 'POST',
      headers: cabeceras,
      body: cuerpo,
      cache: 'no-store',
    });
  } catch {
    /* 502 a propósito: Stripe reintenta lo que no acaba en 2xx, y este evento
       todavía no lo ha visto nadie. */
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
