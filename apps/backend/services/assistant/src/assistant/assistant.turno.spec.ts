import { ConfigService } from '@nestjs/config';
import { lastValueFrom, toArray } from 'rxjs';

import { AssistantService, type EventoDeTurno } from './assistant.service';
import type { GeminiReply } from './gemini.client';

/**
 * El bucle de consultas de un turno (F3 de docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * Lo que se fija aquí es lo que no daría ningún error si se rompiera:
 *
 * - que una consulta se ejecute y su resultado **vuelva al modelo** en la
 *   siguiente vuelta, con la llamada del modelo delante (la API lo exige);
 * - que el bucle **se corte** en los topes, y que la última vuelta vaya sin
 *   consultas y con la nota que se lo dice al modelo;
 * - que sin nada que consultar ni siquiera se declaren.
 */

function respuesta(parcial: Partial<GeminiReply>): GeminiReply {
  const calls = parcial.calls ?? [];
  const text = parcial.text ?? '';
  return {
    text,
    calls,
    partes: [
      ...(text ? [{ text }] : []),
      ...calls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
    ],
    uso: { entrada: 1000, salida: 50, razonamiento: 10, cache: 0 },
    ...parcial,
  };
}

const PROYECTO = { id: '11111111-1111-4111-8111-111111111111', nombre: 'Web' };

function montar(respuestas: GeminiReply[]) {
  const llamadas: { params: any }[] = [];
  const gemini = {
    chat: jest.fn(async (params: any, alTexto?: (d: string) => void) => {
      llamadas.push({ params: structuredClone({ ...params, archivos: undefined }) });
      const siguiente = respuestas[Math.min(llamadas.length - 1, respuestas.length - 1)];
      if (siguiente.text && alTexto) alTexto(siguiente.text);
      return siguiente;
    }),
  };
  const consultas = {
    descripcion: jest.fn(() => 'Buscando tareas en «Web»'),
    ejecutar: jest.fn(async () => ({ total: 3, omitidas: 0, tareas: [] })),
  };
  const quota = {
    estado: jest.fn(async () => ({ usados: 0, limite: 10, periodo: '2026-09', reinicia: '' })),
    consumir: jest.fn(async () => ({ usados: 1, limite: 10, periodo: '2026-09', reinicia: '' })),
  };
  const conversaciones = {
    resolver: jest.fn(async () => 'conv-1'),
    historial: jest.fn(async () => []),
    guardarTurno: jest.fn(async () => []),
  };
  const adjuntos = { paraElTurno: jest.fn(async () => []) };
  const config = { get: () => undefined, getOrThrow: () => '' } as unknown as ConfigService;

  const servicio = new AssistantService(
    config,
    quota as any,
    gemini as any,
    conversaciones as any,
    adjuntos as any,
    consultas as any,
  );
  return { servicio, gemini, consultas, llamadas, conversaciones };
}

const payload = {
  projectId: null,
  userId: 'u1',
  message: '¿Cuántas tareas quedan en Web?',
  permisos: {},
  miembros: [{ userId: 'u1', nombre: 'Ana' }],
  proyectos: [PROYECTO],
  organizationId: 'org-1',
};

describe('El turno de PRAX: bucle de consultas', () => {
  it('ejecuta la consulta, devuelve su resultado al modelo y lo cuenta todo', async () => {
    const m = montar([
      respuesta({
        text: 'Lo miro.',
        calls: [{ name: 'consultar_tareas', args: { proyectoId: PROYECTO.id } }],
      }),
      respuesta({ text: 'Quedan 3.' }),
    ]);

    const eventos = await lastValueFrom(m.servicio.chatEnVivo(payload as any).pipe(toArray()));

    expect(m.consultas.ejecutar).toHaveBeenCalledTimes(1);
    expect(m.gemini.chat).toHaveBeenCalledTimes(2);

    const segunda = m.llamadas[1].params;
    expect(segunda.extra[0].role).toBe('model');
    expect(
      segunda.extra[0].parts.some((p: any) => p.functionCall?.name === 'consultar_tareas'),
    ).toBe(true);
    expect(segunda.extra[1].parts[0].functionResponse.name).toBe('consultar_tareas');
    expect(segunda.extra[1].parts[0].functionResponse.response).toEqual({
      total: 3,
      omitidas: 0,
      tareas: [],
    });

    const tipos = eventos.map((e: EventoDeTurno) => e.tipo);
    expect(tipos[0]).toBe('inicio');
    expect(tipos).toContain('paso');
    expect(tipos[tipos.length - 1]).toBe('fin');
    const texto = eventos
      .filter((e): e is Extract<EventoDeTurno, { tipo: 'texto' }> => e.tipo === 'texto')
      .map((e) => e.delta)
      .join('');
    expect(texto).toBe('Lo miro.\n\nQuedan 3.');

    const fin = eventos[eventos.length - 1] as Extract<EventoDeTurno, { tipo: 'fin' }>;
    expect(fin.resultado.reply).toBe('Lo miro.\n\nQuedan 3.');
    expect(fin.resultado.uso).toEqual({
      entrada: 2000,
      salida: 100,
      razonamiento: 20,
      cache: 0,
      vueltas: 2,
    });
  });

  it('🔴 un modelo que no deja de consultar se corta, y la última vuelta va sin consultas', async () => {
    const m = montar([
      respuesta({ calls: [{ name: 'consultar_tareas', args: {} }] }),
      respuesta({ calls: [{ name: 'consultar_tareas', args: {} }] }),
      respuesta({ calls: [{ name: 'consultar_tareas', args: {} }] }),
      respuesta({ calls: [{ name: 'consultar_tareas', args: {} }] }),
      respuesta({ text: 'Con lo que he podido mirar: …' }),
    ]);

    await m.servicio.chat(payload as any);

    expect(m.gemini.chat).toHaveBeenCalledTimes(5);
    expect(m.consultas.ejecutar).toHaveBeenCalledTimes(4);
    const ultima = m.llamadas[4].params;
    expect(ultima.tools.some((t: any) => t.name.startsWith('consultar_'))).toBe(false);
    const nota = ultima.extra[ultima.extra.length - 1].parts[0].text;
    expect(nota).toContain('Ya no puedes consultar');
  });

  it('sin nada que consultar, las consultas ni se declaran', async () => {
    const m = montar([respuesta({ text: 'Hola.' })]);

    await m.servicio.chat({ ...payload, proyectos: [] } as any);

    expect(m.llamadas[0].params.tools.some((t: any) => t.name.startsWith('consultar_'))).toBe(
      false,
    );
  });

  it('una propuesta no se ejecuta: se recoge y se guarda con el turno', async () => {
    const m = montar([
      respuesta({
        text: '¿Lo abro?',
        calls: [{ name: 'proponer_abrir_proyecto', args: { projectId: PROYECTO.id } }],
      }),
    ]);

    await m.servicio.chat(payload as any);

    expect(m.consultas.ejecutar).not.toHaveBeenCalled();
    expect(m.gemini.chat).toHaveBeenCalledTimes(1);
    const guardado = m.conversaciones.guardarTurno.mock.calls[0] as unknown as [
      { proposals: unknown[] },
    ];
    expect(guardado[0].proposals).toHaveLength(1);
  });
});
