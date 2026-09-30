import type { ConfigService } from '@nestjs/config';

import { GeminiError } from './gemini.client';
import {
  OpenRouterClient,
  conReglasDeFormato,
  esquemaJson,
  inicioDeJson,
  llamadasDelTexto,
  mensajesOpenAI,
} from './openrouter.client';

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

const pregunta = {
  name: 'proponer_pregunta',
  description: 'Pregunta con opciones.',
  parameters: {
    type: 'OBJECT',
    properties: { pregunta: { type: 'STRING' }, opciones: { type: 'ARRAY' } },
    required: ['pregunta', 'opciones'],
  },
};

describe('gpt-oss: JSON escrito como texto', () => {
  let fetchSpy: jest.SpyInstance;
  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchSpy.mockRestore());

  it('encuentra un JSON solo al principio de línea o en un bloque', () => {
    expect(inicioDeJson('Te propongo esto:\n{"a":1}')).toBe(18);
    expect(inicioDeJson('Mira:\n```json\n{"a":1}\n```')).toBe(6);
    expect(inicioDeJson('Un objeto {"a":1} a mitad de frase')).toBe(-1);
  });

  it('convierte los argumentos a secas en la herramienta que encaja, y guarda lo de detrás', () => {
    const rescate = llamadasDelTexto(
      '```json\n{"pregunta":"¿Cuál?","opciones":["Aura","Otro"]}\n```\nElige uno.',
      [...turno.tools, pregunta],
    );
    expect(rescate).toEqual({
      calls: [
        { name: 'proponer_pregunta', args: { pregunta: '¿Cuál?', opciones: ['Aura', 'Otro'] } },
      ],
      despues: 'Elige uno.',
    });
  });

  it('rescata la llamada escrita como etiqueta: <proponer_pregunta{…}>', () => {
    const texto =
      '¿En cuál?\n\n<proponer_pregunta{\n  "pregunta": "¿Dónde?",\n  "opciones": ["Desarrollo", "Test"]\n}>';
    const corte = inicioDeJson(texto);
    expect(texto.slice(0, corte).trim()).toBe('¿En cuál?');
    expect(llamadasDelTexto(texto.slice(corte), [pregunta])).toEqual({
      calls: [
        {
          name: 'proponer_pregunta',
          args: { pregunta: '¿Dónde?', opciones: ['Desarrollo', 'Test'] },
        },
      ],
      despues: '',
    });
    expect(inicioDeJson('Uso proponer_pregunta a veces')).toBe(-1);
  });

  it('un JSON que no encaja con nada se descarta; lo que no es JSON se devuelve', () => {
    expect(llamadasDelTexto('{"zzz":1}', [pregunta])).toEqual({ calls: [], despues: '' });
    expect(llamadasDelTexto('{ esto no es json', [pregunta])).toBeNull();
  });

  it('en vivo: no pinta el JSON y lo entrega como llamada', async () => {
    fetchSpy.mockResolvedValueOnce(
      flujo([
        { choices: [{ delta: { content: '¿En cuál lo cargo?\n' } }] },
        { choices: [{ delta: { content: '{"pregunta":"¿Cuál?",' } }] },
        { choices: [{ delta: { content: '"opciones":["Aura"]}' } }] },
      ]),
    );
    const pintado: string[] = [];

    const r = await cliente().chat({ ...turno, tools: [pregunta] }, (d) => pintado.push(d));

    expect(pintado.join('')).toBe('¿En cuál lo cargo?\n');
    expect(r.calls).toEqual([
      { name: 'proponer_pregunta', args: { pregunta: '¿Cuál?', opciones: ['Aura'] } },
    ]);
  });

  it('añade las reglas de formato al sistema, y solo al sistema', () => {
    const m = conReglasDeFormato(mensajesOpenAI(turno));
    expect(m[0].content).toContain('REGLAS DE FORMATO');
    expect(m[0].content).toContain('nunca "vos"');
    expect(
      m.slice(1).some((x) => String((x as { content?: string }).content).includes('REGLAS')),
    ).toBe(false);
  });
});
