import { fetchAlGateway } from '@praxis/commons/api/despertar';
import { afterEach, describe, expect, it, vi } from 'vitest';

const SIN_ESPERA = [0, 0, 0];

function errorDeRed(code: string) {
  return Object.assign(new TypeError('fetch failed'), { cause: { code } });
}

function respuesta(status: number, tipo = 'text/html') {
  return new Response('x', { status, headers: { 'content-type': tipo } });
}

describe('fetchAlGateway', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reintenta una conexión rechazada, también en un POST', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(errorDeRed('ECONNREFUSED'))
      .mockResolvedValueOnce(respuesta(200, 'application/json'));
    vi.stubGlobal('fetch', fetch);

    const r = await fetchAlGateway('http://api/x', { method: 'POST' }, SIN_ESPERA);
    expect(r.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reintenta el 502 de Railway en un GET', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(respuesta(502))
      .mockResolvedValueOnce(respuesta(200, 'application/json'));
    vi.stubGlobal('fetch', fetch);

    const r = await fetchAlGateway('http://api/x', {}, SIN_ESPERA);
    expect(r.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('NO reintenta un 502 en un POST: puede haberse aplicado ya', async () => {
    const fetch = vi.fn().mockResolvedValue(respuesta(502));
    vi.stubGlobal('fetch', fetch);

    const r = await fetchAlGateway('http://api/auth/refresh', { method: 'POST' }, SIN_ESPERA);
    expect(r.status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('NO reintenta un 503 del propio gateway, que viene en JSON', async () => {
    const fetch = vi.fn().mockResolvedValue(respuesta(503, 'application/json'));
    vi.stubGlobal('fetch', fetch);

    const r = await fetchAlGateway('http://api/x', {}, SIN_ESPERA);
    expect(r.status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('NO reintenta un POST cuando la red falla después de salir', async () => {
    const fetch = vi.fn().mockRejectedValue(errorDeRed('ECONNRESET'));
    vi.stubGlobal('fetch', fetch);

    await expect(fetchAlGateway('http://api/x', { method: 'POST' }, SIN_ESPERA)).rejects.toThrow(
      'fetch failed',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('se rinde al agotar los intentos y devuelve el último error', async () => {
    const fetch = vi.fn().mockRejectedValue(errorDeRed('ECONNREFUSED'));
    vi.stubGlobal('fetch', fetch);

    await expect(fetchAlGateway('http://api/x', {}, SIN_ESPERA)).rejects.toThrow('fetch failed');
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('una señal abortada corta la espera', async () => {
    const fetch = vi.fn().mockRejectedValue(errorDeRed('ECONNREFUSED'));
    vi.stubGlobal('fetch', fetch);
    const controlador = new AbortController();
    setTimeout(() => controlador.abort(new Error('plazo')), 20);

    await expect(
      fetchAlGateway('http://api/x', { signal: controlador.signal }, [10_000]),
    ).rejects.toThrow('plazo');
  });
});
