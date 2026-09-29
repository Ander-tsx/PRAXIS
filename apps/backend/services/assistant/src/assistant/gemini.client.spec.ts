import { ConfigService } from '@nestjs/config';

import { GeminiClient, GeminiError } from './gemini.client';

/**
 * Los caminos de fallo del cliente de Gemini.
 *
 * 🔴 **Es la prueba que faltaba cuando el asistente dejó de responder.** No
 * había ninguna en todo el servicio, así que nada impedía que un `catch`
 * intermedio convirtiera cualquier fallo de Google en un 500 genérico — que es
 * exactamente lo que pasó, y lo que dejó a la versión desplegada devolviendo
 * «El asistente no ha podido responder» a todo, sin forma de saber por qué.
 *
 * Lo que se comprueba aquí es lo único que de verdad importa de este cliente
 * cuando algo va mal: **qué se reintenta, qué no, y qué se le cuenta a quien
 * preguntó.**
 */

const OK = {
  candidates: [{ content: { parts: [{ text: 'hola' }] }, finishReason: 'STOP' }],
};

function respuesta(status: number, cuerpo: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
    text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)),
  } as Response;
}

function cliente(extra: Record<string, string> = {}) {
  const valores: Record<string, string> = { GEMINI_API_KEY: 'clave-de-prueba', ...extra };
  const config = {
    getOrThrow: (clave: string) => valores[clave],
    get: (clave: string) => valores[clave],
  } as unknown as ConfigService;
  return new GeminiClient(config);
}

const turno = { system: 's', history: [], message: 'hola', tools: [] };

describe('GeminiClient — qué se reintenta y qué se cuenta', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
    /* Sin esto cada reintento espera de verdad y la suite tarda segundos por
       prueba. Lo que se mide es la decisión, no el reloj. */
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout);
  });

  afterEach(() => jest.restoreAllMocks());

  it('reintenta un 503 y devuelve la respuesta en cuanto Google se recupera', async () => {
    fetchSpy
      .mockResolvedValueOnce(respuesta(503, 'model overloaded'))
      .mockResolvedValueOnce(respuesta(200, OK));

    await expect(cliente().chat(turno)).resolves.toMatchObject({ text: 'hola', calls: [] });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('se rinde tras tres intentos si el 503 no se pasa', async () => {
    fetchSpy.mockResolvedValue(respuesta(503, 'model overloaded'));

    await expect(cliente().chat(turno)).rejects.toBeInstanceOf(GeminiError);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('reintenta también un fallo de red o un timeout', async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error('The operation was aborted due to timeout'))
      .mockResolvedValueOnce(respuesta(200, OK));

    await expect(cliente().chat(turno)).resolves.toMatchObject({ text: 'hola', calls: [] });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('NO reintenta el tope de gasto, y lo dice sin mandar a nadie a esperar', async () => {
    fetchSpy.mockResolvedValue(respuesta(429, 'monthly spending cap reached'));

    await expect(cliente().chat(turno)).rejects.toThrow(/presupuesto de este mes/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('NO reintenta el limite por minuto', async () => {
    fetchSpy.mockResolvedValue(respuesta(429, 'quota exceeded'));

    await expect(cliente().chat(turno)).rejects.toThrow(/limite de uso/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('una clave invalida o restringida se cuenta como lo que es: configuracion', async () => {
    fetchSpy.mockResolvedValue(respuesta(400, 'API key not valid'));

    await expect(cliente().chat(turno)).rejects.toThrow(/no está bien configurado/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('un bloqueo de seguridad no se reintenta: la misma pregunta da el mismo bloqueo', async () => {
    fetchSpy.mockResolvedValue(respuesta(200, { promptFeedback: { blockReason: 'SAFETY' } }));

    await expect(cliente().chat(turno)).rejects.toThrow(/rechazado/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('con modelo de respaldo, lo prueba cuando el principal se agota', async () => {
    fetchSpy.mockResolvedValue(respuesta(503, 'model overloaded'));

    await expect(
      cliente({ GEMINI_MODEL: 'principal', GEMINI_MODEL_FALLBACK: 'respaldo' }).chat(turno),
    ).rejects.toBeInstanceOf(GeminiError);

    /* Tres contra el principal y tres contra el respaldo. */
    expect(fetchSpy).toHaveBeenCalledTimes(6);
    const urls = fetchSpy.mock.calls.map(([url]) => String(url));
    expect(urls.filter((url) => url.includes('principal'))).toHaveLength(3);
    expect(urls.filter((url) => url.includes('respaldo'))).toHaveLength(3);
  });

  it('sin respaldo configurado no inventa ningun modelo', async () => {
    fetchSpy.mockResolvedValue(respuesta(503, 'model overloaded'));

    await expect(cliente({ GEMINI_MODEL: 'principal' }).chat(turno)).rejects.toBeInstanceOf(
      GeminiError,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  describe('en vivo (F3)', () => {
    function enVivo(trozos: unknown[]) {
      const texto = trozos.map((t) => `data: ${JSON.stringify(t)}\r\n\r\n`).join('');
      const bytes = new TextEncoder().encode(texto);
      /* Partido a mitad de un evento, que es como llega por la red. */
      const mitad = Math.floor(bytes.length / 2);
      const cuerpo = new ReadableStream<Uint8Array>({
        start(controlador) {
          controlador.enqueue(bytes.slice(0, mitad));
          controlador.enqueue(bytes.slice(mitad));
          controlador.close();
        },
      });
      return { ok: true, status: 200, body: cuerpo } as unknown as Response;
    }

    it('entrega el texto según llega y devuelve la respuesta entera con su uso', async () => {
      fetchSpy.mockResolvedValueOnce(
        enVivo([
          { candidates: [{ content: { parts: [{ text: 'Ho' }] } }] },
          { candidates: [{ content: { parts: [{ text: 'la' }] } }] },
          {
            candidates: [
              {
                content: {
                  parts: [{ functionCall: { name: 'consultar_tareas', args: { texto: 'x' } } }],
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: {
              promptTokenCount: 100,
              candidatesTokenCount: 7,
              thoughtsTokenCount: 3,
            },
          },
        ]),
      );
      const trozos: string[] = [];

      const r = await cliente().chat(turno, (delta) => trozos.push(delta));

      expect(trozos).toEqual(['Ho', 'la']);
      expect(r.text).toBe('Hola');
      expect(r.calls).toEqual([{ name: 'consultar_tareas', args: { texto: 'x' } }]);
      expect(r.uso).toEqual({ entrada: 100, salida: 7, razonamiento: 3, cache: 0 });
      expect(r.partes).toHaveLength(3);
      expect(String(fetchSpy.mock.calls[0][0])).toContain('streamGenerateContent?alt=sse');
    });

    it('no reintenta si ya había entregado texto: se escribiría encima', async () => {
      /* El corte llega **después** de que se haya leído el primer trozo: un
         `error()` en el mismo `start` descartaría lo que estaba en cola. */
      let lecturas = 0;
      const cuerpoRoto = new ReadableStream<Uint8Array>({
        pull(controlador) {
          lecturas += 1;
          if (lecturas === 1) {
            controlador.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Me' }] } }] })}\n\n`,
              ),
            );
          } else {
            controlador.error(new Error('conexión cortada'));
          }
        },
      });
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: cuerpoRoto,
      } as unknown as Response);

      await expect(cliente().chat(turno, () => {})).rejects.toBeInstanceOf(GeminiError);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
