import { decodeJwt } from 'jose';
import { type NextRequest, NextResponse } from 'next/server';
import { fetchAlGateway } from '../api/despertar';
import type { ApiEnvelopeError } from '../api/envelope';
import { isTimeout, timeoutSignal } from '../api/timeout';
import {
  ACCESS_TOKEN_FALLBACK_MAX_AGE,
  REFRESH_COOKIE,
  SESSION_COOKIE,
  sessionCookieOptions,
} from './cookies';

/**
 * Proxy autenticado hacia el gateway.
 *
 * El token vive en una cookie httpOnly, así que el navegador no puede añadir
 * la cabecera Authorization por su cuenta. Cada zona monta este handler en
 * `src/app/api/gateway/[...path]/route.ts` y el cliente llama a
 * `/<zona>/api/gateway/<ruta-del-gateway>` en lugar de al gateway directamente.
 *
 * Qué resuelve:
 * - Añade `Authorization: Bearer` leyendo la cookie de sesión.
 * - Renueva el access token en silencio cuando caduca (dura 15 minutos) y
 *   reintenta la petición una vez, de forma transparente para el cliente.
 * - Nunca reenvía la cookie al gateway: solo viaja el Bearer.
 * - Devuelve el sobre `{success, data, meta}` intacto, para que el cliente lo
 *   desenvuelva con `unwrapEnvelope` y conserve códigos y mensajes de error.
 */

export interface CreateGatewayProxyOptions {
  /** Por defecto: `process.env.GATEWAY_URL` o http://localhost:3000 */
  gatewayUrl?: string;
  /**
   * Renovar el access token y reintentar cuando el gateway responde 401.
   * Por defecto true.
   */
  autoRefresh?: boolean;
}

interface ProxyContext {
  params: Promise<{ path?: string[] }>;
}

/** Cabeceras de la petición del navegador que NO deben viajar al gateway. */
const STRIPPED_REQUEST_HEADERS = new Set([
  'cookie',
  'host',
  'connection',
  'content-length',
  'authorization',
  'accept-encoding',
]);

/** Cabeceras de la respuesta del gateway que NO deben devolverse tal cual. */
const STRIPPED_RESPONSE_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'set-cookie',
]);

function errorEnvelope(code: ApiEnvelopeError['error']['code'], message: string): ApiEnvelopeError {
  return { success: false, error: { code, message, details: {} } };
}

function maxAgeFromJwt(token: string): number {
  try {
    const { exp } = decodeJwt(token);
    if (typeof exp === 'number') {
      return Math.max(0, exp - Math.floor(Date.now() / 1000));
    }
  } catch {
    // token opaco o malformado
  }
  return ACCESS_TOKEN_FALLBACK_MAX_AGE;
}

/**
 * Canjea el refresh token por un access token nuevo.
 * Devuelve null si el refresh ya no es válido.
 */
async function refreshAccessToken(
  gatewayUrl: string,
  refreshToken: string,
): Promise<string | null> {
  try {
    const response = await fetchAlGateway(`${gatewayUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
      signal: timeoutSignal(),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as { data?: { accessToken?: unknown } };
    const accessToken = payload?.data?.accessToken;

    return typeof accessToken === 'string' ? accessToken : null;
  } catch {
    return null;
  }
}

export function createGatewayProxy(options: CreateGatewayProxyOptions = {}) {
  const gatewayUrl = options.gatewayUrl ?? process.env.GATEWAY_URL ?? 'http://localhost:3000';
  const autoRefresh = options.autoRefresh ?? true;

  async function handler(request: NextRequest, context: ProxyContext) {
    const { path = [] } = await context.params;

    if (path.length === 0) {
      return NextResponse.json(errorEnvelope('BAD_REQUEST', 'Ruta del gateway no indicada.'), {
        status: 400,
      });
    }

    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
    let accessToken = request.cookies.get(SESSION_COOKIE)?.value;
    let renewedToken: string | null = null;

    /**
     * 🔴 **La cookie del access token caduca con él (15 min), y el navegador la
     * borra.** Esto respondía «No hay sesión activa» en cuanto faltaba, sin
     * mirar el refresh token: con PRAX abierto un rato, la siguiente pregunta
     * daba 401 aunque la sesión siguiera viva. Solo se arreglaba navegando,
     * porque el guard de página sí renueva — «cerré el chat, lo abrí desde el
     * historial y ya respondió». Ahora se renueva aquí antes de rendirse.
     */
    if (!accessToken && autoRefresh && refreshToken) {
      renewedToken = await refreshAccessToken(gatewayUrl, refreshToken);
      accessToken = renewedToken ?? undefined;
    }

    if (!accessToken) {
      return NextResponse.json(errorEnvelope('UNAUTHORIZED', 'No hay sesión activa.'), {
        status: 401,
      });
    }

    const search = request.nextUrl.search;
    const target = `${gatewayUrl}/api/${path.join('/')}${search}`;

    /**
     * El cuerpo se lee una sola vez: los reintentos reutilizan esta copia.
     *
     * ⚠️ **`arrayBuffer()` y no `text()`, por lo mismo que en la respuesta.**
     * `text()` decodifica los bytes como UTF-8 para volver a codificarlos al
     * reenviarlos, y cualquier byte que no forme una secuencia UTF-8 válida se
     * sustituye por el carácter de reemplazo **sin vuelta atrás**. Con JSON no
     * se nota; con un `multipart/form-data` que lleva un PNG dentro, lo que
     * llega al gateway es un PNG roto — y el fallo sale al abrirlo, no al
     * subirlo. Es el mismo error que ya estaba corregido en la entrega y que
     * seguía vivo en la subida, donde nunca había cruzado un binario.
     */
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    const body = hasBody ? await request.arrayBuffer() : undefined;

    const forwardedHeaders = new Headers();
    request.headers.forEach((value, key) => {
      if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
        forwardedHeaders.set(key, value);
      }
    });

    /**
     * ⚠️ Una petición de flujo de eventos (SSE) se trata distinto **en dos
     * sitios**, y sin los dos no funciona.
     *
     * Aquí, el tiempo de espera: `timeoutSignal()` aborta la petición pasados
     * unos segundos, y en un flujo que por definición no termina eso corta la
     * conexión justo cuando empieza a servir. Más abajo, el cuerpo: se
     * transmite en vez de acumularse.
     *
     * Se decide por la cabecera `Accept` que manda el navegador —`EventSource`
     * siempre envía `text/event-stream`—, no por la ruta: así no hay una lista
     * de rutas especiales que mantener sincronizada con el gateway.
     */
    const esFlujoDeEventos = (request.headers.get('accept') ?? '').includes('text/event-stream');

    const send = (token: string) =>
      fetchAlGateway(target, {
        method: request.method,
        headers: (() => {
          const headers = new Headers(forwardedHeaders);
          headers.set('Authorization', `Bearer ${token}`);
          return headers;
        })(),
        ...(body !== undefined && body.byteLength > 0 ? { body } : {}),
        cache: 'no-store',
        redirect: 'manual',
        /* Un cuelgue aquí deja al navegador esperando una respuesta que no
           llega, y al componente que la pidió con su spinner encendido. */
        ...(esFlujoDeEventos ? {} : { signal: timeoutSignal() }),
      });

    let gatewayResponse: Response;
    try {
      gatewayResponse = await send(accessToken);
    } catch (error) {
      if (isTimeout(error)) {
        return NextResponse.json(
          errorEnvelope('BAD_GATEWAY', 'El servidor tardó demasiado en responder.'),
          { status: 504 },
        );
      }
      return NextResponse.json(
        errorEnvelope('BAD_GATEWAY', 'No se pudo conectar con el servidor.'),
        { status: 503 },
      );
    }

    // El access token dura 15 minutos: si caducó, lo renovamos y reintentamos
    // una única vez antes de rendirnos. Si ya se renovó arriba, no se repite.
    if (autoRefresh && gatewayResponse.status === 401 && refreshToken && !renewedToken) {
      renewedToken = await refreshAccessToken(gatewayUrl, refreshToken);

      if (renewedToken) {
        try {
          gatewayResponse = await send(renewedToken);
        } catch (error) {
          if (isTimeout(error)) {
            return NextResponse.json(
              errorEnvelope('BAD_GATEWAY', 'El servidor tardó demasiado en responder.'),
              { status: 504 },
            );
          }
          return NextResponse.json(
            errorEnvelope('BAD_GATEWAY', 'No se pudo conectar con el servidor.'),
            { status: 503 },
          );
        }
      }
    }

    /**
     * ⚠️ **Un flujo de eventos se reenvía sin tocarlo y se sale de aquí.**
     *
     * El `arrayBuffer()` de abajo espera a que la respuesta **termine**, y una
     * conexión SSE no termina: la petición se quedaría colgada para siempre sin
     * que llegara ni un solo aviso al navegador. Aquí se pasa el cuerpo tal
     * cual, que es un `ReadableStream`, y cada trozo sale en cuanto el gateway
     * lo escribe.
     *
     * `x-accel-buffering: no` es para los intermediarios que acumulan la
     * respuesta antes de entregarla: sin esa cabecera, un proxy con búfer
     * guardaría los avisos hasta llenar un bloque y llegarían todos de golpe,
     * que es exactamente lo contrario de lo que esto sirve.
     *
     * No se renueva el token en mitad del flujo: la conexión ya está abierta y
     * autenticada, y cuando caduque el navegador reconectará solo —`EventSource`
     * lo hace— pasando otra vez por el camino de arriba, que sí renueva.
     */
    if (gatewayResponse.headers.get('content-type')?.includes('text/event-stream')) {
      const streamHeaders = new Headers();
      gatewayResponse.headers.forEach((value, key) => {
        if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
          streamHeaders.set(key, value);
        }
      });
      streamHeaders.set('cache-control', 'no-cache, no-transform');
      streamHeaders.set('x-accel-buffering', 'no');

      const flujo = new NextResponse(gatewayResponse.body, {
        status: gatewayResponse.status,
        headers: streamHeaders,
      });
      /* El token renovado se guarda también aquí: sin esto, el turno de PRAX
         —que es un flujo— renovaba y tiraba la cookie, y la siguiente
         petición volvía a empezar sin sesión. */
      if (renewedToken) {
        flujo.cookies.set(
          SESSION_COOKIE,
          renewedToken,
          sessionCookieOptions(maxAgeFromJwt(renewedToken)),
        );
      }
      return flujo;
    }

    /**
     * ⚠️ **`arrayBuffer()` y no `text()`.**
     *
     * Estuvo con `text()`, y eso decodifica los bytes como UTF-8 para volver a
     * codificarlos al construir la respuesta: cualquier byte que no forme una
     * secuencia UTF-8 válida se sustituye por el carácter de reemplazo y **no
     * hay vuelta atrás**. Todo lo que cruzara este proxy sin ser texto llegaba
     * roto al navegador.
     *
     * Se vio con un PDF: 38 135 bytes correctos en la base, con su `%PDF-1.7` y
     * su `%%EOF`, y un archivo ilegible en el navegador. El almacenamiento
     * estaba bien; se rompía aquí, en la entrega.
     *
     * Con `arrayBuffer()` los bytes pasan tal cual, y el JSON —que es el 99 %
     * de lo que cruza— sigue funcionando igual: el `Content-Type` que reenvía
     * el gateway es el que decide cómo lo lee el cliente.
     */
    const payload = await gatewayResponse.arrayBuffer();

    const responseHeaders = new Headers();
    gatewayResponse.headers.forEach((value, key) => {
      if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    const response = new NextResponse(payload, {
      status: gatewayResponse.status,
      headers: responseHeaders,
    });

    if (renewedToken) {
      response.cookies.set(
        SESSION_COOKIE,
        renewedToken,
        sessionCookieOptions(maxAgeFromJwt(renewedToken)),
      );
    }

    return response;
  }

  return {
    GET: handler,
    POST: handler,
    PUT: handler,
    PATCH: handler,
    DELETE: handler,
  };
}
