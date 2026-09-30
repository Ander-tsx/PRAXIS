import { createGatewayProxy } from '@praxis/commons/auth';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * El proxy del gateway renueva la sesión aunque la cookie del access token ya
 * no esté.
 *
 * 🔴 Esa cookie caduca con el JWT (15 min) y el navegador la borra. El proxy
 * respondía «No hay sesión activa» sin mirar el refresh token, y con PRAX
 * abierto un rato la siguiente pregunta fallaba aunque la sesión siguiera viva
 * (2026-09-30, en producción).
 */

/** Un JWT sin firmar con `exp`: el proxy solo lo decodifica para el `maxAge`. */
function jwt(segundos: number): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64({ exp: Math.floor(Date.now() / 1000) + segundos })}.x`;
}

function peticion(cookies: string, accept = 'application/json') {
  return new NextRequest('http://localhost:4100/api/gateway/me/assistant/chat/stream', {
    method: 'POST',
    headers: { cookie: cookies, accept, 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'hola' }),
  });
}

const contexto = { params: Promise.resolve({ path: ['me', 'assistant', 'chat', 'stream'] }) };

afterEach(() => vi.unstubAllGlobals());

describe('proxy del gateway: sesión caducada', () => {
  it('sin cookie de acceso pero con refresh, renueva, reenvía y guarda la cookie nueva', async () => {
    const nuevo = jwt(900);
    const llamadas: { url: string; auth: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        llamadas.push({ url, auth: new Headers(init.headers).get('authorization') });
        if (url.endsWith('/api/auth/refresh')) {
          return Response.json({ success: true, data: { accessToken: nuevo } });
        }
        return new Response('data: {}\n\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    const { POST } = createGatewayProxy({ gatewayUrl: 'http://gw' });
    const respuesta = await POST(
      peticion('praxis_refresh=r1', 'text/event-stream'),
      contexto as never,
    );

    expect(respuesta.status).toBe(200);
    expect(llamadas.map((l) => l.url)).toEqual([
      'http://gw/api/auth/refresh',
      'http://gw/api/me/assistant/chat/stream',
    ]);
    expect(llamadas[1].auth).toBe(`Bearer ${nuevo}`);
    /* También en un flujo: sin esto, la siguiente petición volvía a empezar sin sesión. */
    expect(respuesta.cookies.get('praxis_session')?.value).toBe(nuevo);
  });

  it('sin ninguna de las dos cookies, 401 sin llamar al gateway', async () => {
    const espia = vi.fn();
    vi.stubGlobal('fetch', espia);

    const { POST } = createGatewayProxy({ gatewayUrl: 'http://gw' });
    const respuesta = await POST(peticion(''), contexto as never);

    expect(respuesta.status).toBe(401);
    expect(espia).not.toHaveBeenCalled();
  });
});
