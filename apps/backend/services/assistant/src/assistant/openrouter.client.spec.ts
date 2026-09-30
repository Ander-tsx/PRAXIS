import type { ConfigService } from '@nestjs/config';

import { GeminiError } from './gemini.client';
import { OpenRouterClient, esquemaJson, mensajesOpenAI } from './openrouter.client';

function cliente(valores: Record<string, string> = { PRAX_OPENROUTER_API_KEY: 'k' }) {
  return new OpenRouterClient({
    get: (clave: string) => valores[clave],
  } as unknown as ConfigService);
}

/** Un cuerpo SSE como el de OpenRouter, trozo a trozo. */
function flujo(trozos: unknown[]): Response {
  const texto = `${trozos.map((t) => `data: ${JSON.stringify(t)}\n\n`).join('')}data: [DONE]\n\n`;
  const bytes = new TextEncoder().encode(`: OPENROUTER PROCESSING\n\n${texto}`);
  return new Response(
    new ReadableStream({
      start(control) {
        /* En dos mitades, para que un evento quede partido entre lecturas. */
        control.enqueue(bytes.slice(0, 40));
        control.enqueue(bytes.slice(40));
        control.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

const turno = {
  system: 'Eres PRAX.',
  history: [{ role: 'model', text: 'Hola.' }],
  message: '¿Cuántas quedan?',
  tools: [
    {
      name: 'consultar_tareas',
      description: 'LEE tareas.',
      parameters: {
        type: 'OBJECT',
        properties: { proyectoId: { type: 'STRING', nullable: true } },
      },
    },
  ],
};

describe('OpenRouterClient', () => {
  let fetchSpy: jest.SpyInstance;
  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchSpy.mockRestore());

  it('pasa los esquemas de Gemini a JSON Schema', () => {
    expect(esquemaJson(turno.tools[0].parameters)).toEqual({
      type: 'object',
      properties: { proyectoId: { type: 'string' } },
    });
  });

  it('cada respuesta de consulta cita el id de su llamada', () => {
    const mensajes = mensajesOpenAI({
      ...turno,
      extra: [
        {
          role: 'model',
          parts: [
            { text: 'Lo miro.' },
            { functionCall: { name: 'consultar_tareas', args: { proyectoId: 'p' } } },
            { functionCall: { name: 'consultar_sprints', args: {} } },
          ],
        },
        {
          role: 'user',
          parts: [
            { functionResponse: { name: 'consultar_tareas', response: { total: 3 } } },
            { functionResponse: { name: 'consultar_sprints', response: { sprints: [] } } },
          ],
        },
      ],
    });

    expect(mensajes.map((m) => m.role)).toEqual([
      'system',
      'assistant',
      'user',
      'assistant',
      'tool',
      'tool',
    ]);
    const llamada = mensajes[3] as Extract<(typeof mensajes)[number], { role: 'assistant' }>;
    expect(llamada.tool_calls?.map((t) => t.id)).toEqual(['c0_0', 'c0_1']);
    expect(mensajes.slice(4).map((m) => (m as { tool_call_id: string }).tool_call_id)).toEqual([
      'c0_0',
      'c0_1',
    ]);
  });

  it('lee el flujo: texto en vivo, llamadas reensambladas y el uso con razonamiento', async () => {
    fetchSpy.mockResolvedValueOnce(
      flujo([
        { choices: [{ delta: { content: 'Lo ' } }] },
        { choices: [{ delta: { content: 'miro.' } }] },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'x',
                    function: { name: 'consultar_tareas', arguments: '{"proy' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: { tool_calls: [{ index: 0, function: { arguments: 'ectoId":"p"}' } }] },
              finish_reason: 'tool_calls',
            },
          ],
        },
        {
          choices: [],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 40,
            completion_tokens_details: { reasoning_tokens: 30 },
            prompt_tokens_details: { cached_tokens: 20 },
          },
        },
      ]),
    );
    const trozos: string[] = [];

    const respuesta = await cliente().chat(turno, (d) => trozos.push(d));

    expect(trozos.join('')).toBe('Lo miro.');
    expect(respuesta.calls).toEqual([{ name: 'consultar_tareas', args: { proyectoId: 'p' } }]);
    expect(respuesta.partes).toEqual([
      { text: 'Lo miro.' },
      { functionCall: { name: 'consultar_tareas', args: { proyectoId: 'p' } } },
    ]);
    expect(respuesta.uso).toEqual({ entrada: 100, salida: 10, razonamiento: 30, cache: 20 });

    const cuerpo = JSON.parse(String(fetchSpy.mock.calls[0][1].body));
    expect(cuerpo.model).toBe('openai/gpt-oss-120b');
    expect(cuerpo.tools[0].function.parameters.type).toBe('object');
  });

  it('reintenta un 5xx antes del primer trozo', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('caído', { status: 502 }))
      .mockResolvedValueOnce(flujo([{ choices: [{ delta: { content: 'Hola' } }] }]));

    await expect(cliente().chat(turno)).resolves.toMatchObject({ text: 'Hola' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('una clave inválida no se reintenta y lo dice como configuración', async () => {
    fetchSpy.mockResolvedValue(new Response('no', { status: 401 }));

    await expect(cliente().chat(turno)).rejects.toThrow(/no está bien configurado/);
    await expect(cliente().chat(turno)).rejects.toBeInstanceOf(GeminiError);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('sin clave propia usa la de OpenRouter de Jev; sin ninguna, no está disponible', () => {
    expect(cliente({ OPENROUTER_API_KEY: 'j' }).disponible).toBe(true);
    expect(cliente({}).disponible).toBe(false);
  });
});
