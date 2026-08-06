import { decodeJwt } from 'jose';
import { type NextRequest, NextResponse } from 'next/server';
import type { ApiEnvelopeError } from '../api/envelope';
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
    const response = await fetch(`${gatewayUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
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

    const accessToken = request.cookies.get(SESSION_COOKIE)?.value;

    if (!accessToken) {
      return NextResponse.json(errorEnvelope('UNAUTHORIZED', 'No hay sesión activa.'), {
        status: 401,
      });
    }

    const search = request.nextUrl.search;
    const target = `${gatewayUrl}/api/${path.join('/')}${search}`;

    // El body se lee una sola vez: los reintentos reutilizan esta copia.
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    const body = hasBody ? await request.text() : undefined;

    const forwardedHeaders = new Headers();
    request.headers.forEach((value, key) => {
      if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
        forwardedHeaders.set(key, value);
      }
    });

    const send = (token: string) =>
      fetch(target, {
        method: request.method,
        headers: (() => {
          const headers = new Headers(forwardedHeaders);
          headers.set('Authorization', `Bearer ${token}`);
          return headers;
        })(),
        ...(body !== undefined && body !== '' ? { body } : {}),
        cache: 'no-store',
        redirect: 'manual',
      });

    let gatewayResponse: Response;
    try {
      gatewayResponse = await send(accessToken);
    } catch {
      return NextResponse.json(
        errorEnvelope('BAD_GATEWAY', 'No se pudo conectar con el servidor.'),
        { status: 503 },
      );
    }

    // El access token dura 15 minutos: si caducó, lo renovamos y reintentamos
    // una única vez antes de rendirnos.
    let renewedToken: string | null = null;
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

    if (autoRefresh && gatewayResponse.status === 401 && refreshToken) {
      renewedToken = await refreshAccessToken(gatewayUrl, refreshToken);

      if (renewedToken) {
        try {
          gatewayResponse = await send(renewedToken);
        } catch {
          return NextResponse.json(
            errorEnvelope('BAD_GATEWAY', 'No se pudo conectar con el servidor.'),
            { status: 503 },
          );
        }
      }
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
