import { afterEach, describe, expect, it, vi } from 'vitest';
import { despertarGateway } from './gateway';

describe('despertarGateway', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reintenta mientras Railway despierta la API (502 que no es del gateway) y acaba bien', async () => {
    vi.useFakeTimers();
    const respuestas = [
      new Response('Bad Gateway', { status: 502, headers: { 'content-type': 'text/plain' } }),
      new Response('ok', { status: 200 }),
    ];
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async () => {
      const siguiente = respuestas.shift();
      if (!siguiente) throw new Error('de más');
      return siguiente;
    });
    const hecho = despertarGateway();
    await vi.advanceTimersByTimeAsync(1000);
    await hecho;
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toMatch(/\/api$/);
    vi.useRealTimers();
  });

  it('nunca lanza: si la API no responde, lo que venga después dará su propio error', async () => {
    vi.useFakeTimers();
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('caído'));
    const hecho = expect(despertarGateway()).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(10_000);
    await hecho;
    vi.useRealTimers();
  });
});
