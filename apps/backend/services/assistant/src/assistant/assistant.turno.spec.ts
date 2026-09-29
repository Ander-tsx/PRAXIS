import { ConfigService } from '@nestjs/config';
import { lastValueFrom, of, toArray } from 'rxjs';

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
    contar: jest.fn(async () => 0),
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
    {
      decidir: async () => ({
        incluirInventario: true,
        intencion: null,
        router: 'heuristic',
        motivo: 'prueba',
      }),
    } as any,
  );
  return { servicio, gemini, consultas, llamadas, conversaciones, quota };
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
      contexto: 1000,
      /* 2000 de entrada ×1 + (100 + 20) de salida ×8. */
      tokensPrax: 2960,
    });
    /* Y eso es lo que se cobra: tokens PRAX, no «un mensaje». */
    expect(m.quota.consumir).toHaveBeenCalledWith('u1', undefined, 'org-1', 2960);
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

  /**
   * Una tarea que no cabía en el inventario se puede leer consultando; si luego
   * no se pudiera proponer sobre ella, PRAX la encontraría y la propuesta se
   * descartaría por «no estar en el proyecto».
   */
  it('se puede proponer sobre una tarea que solo se vio consultando', async () => {
    const m = montar([
      respuesta({ calls: [{ name: 'consultar_tareas', args: {} }] }),
      respuesta({
        text: 'Te propongo moverla.',
        calls: [
          {
            name: 'proponer_movimiento',
            args: { taskId: 'tarea-oculta', columnId: 'col-hecho', porQue: 'Terminada.' },
          },
        ],
      }),
    ]);
    m.consultas.ejecutar.mockImplementation((async (_n: string, _a: unknown, ambito: any) => {
      ambito.vistas.set('tarea-oculta', {
        id: 'tarea-oculta',
        titulo: 'Fuera del inventario',
        columnId: 'col-hacer',
        cerrada: false,
      });
      return { total: 1, omitidas: 0, tareas: [] };
    }) as any);
    const briefing = {
      proyecto: { nombre: 'Web' },
      columnas: [
        { id: 'col-hacer', nombre: 'Por hacer', orden: 0 },
        { id: 'col-hecho', nombre: 'Hecho', orden: 1 },
      ],
      etiquetas: [],
      tareas: [],
    };

    (m.servicio as any).reportsClient = { send: () => of(briefing) };

    await m.servicio.chat({
      ...payload,
      projectId: PROYECTO.id,
      proyectos: [],
      permisos: { canMoveTask: true },
    } as any);

    const guardado = m.conversaciones.guardarTurno.mock.calls[0] as unknown as [
      { proposals: { tool: string; args: Record<string, unknown> }[] },
    ];
    expect(guardado[0].proposals).toHaveLength(1);
    expect(guardado[0].proposals[0].args).toMatchObject({
      taskId: 'tarea-oculta',
      taskTitle: 'Fuera del inventario',
      columnName: 'Hecho',
      columnaActual: 'Por hacer',
    });
  });

  /**
   * Los sprints (F7): sus ids no están en el briefing, así que solo valen los
   * que enseñó `consultar_sprints` en el turno. Empezar uno con otro en curso
   * en el mismo tablero se descarta, y al planificar se quitan las tareas de
   * otro tablero, que el gateway no movería.
   */
  it('sprints: solo los vistos, ninguno a la vez que otro en curso, tareas del mismo tablero', async () => {
    const m = montar([
      respuesta({ calls: [{ name: 'consultar_sprints', args: {} }] }),
      respuesta({
        text: 'Te propongo esto.',
        calls: [
          {
            name: 'proponer_iniciar_sprint',
            args: { sprintId: 's1', desde: '2026-10-01', hasta: '2026-10-14', porQue: 'x' },
          },
          {
            name: 'proponer_planificacion',
            args: { sprintId: 's2', taskIds: ['t1', 't2', 'inventada'], porQue: 'x' },
          },
          { name: 'proponer_sprint', args: { tableroId: 'b2', nombre: 'Sprint 9', porQue: 'x' } },
        ],
      }),
    ]);
    m.consultas.ejecutar.mockImplementation((async (_n: string, _a: unknown, ambito: any) => {
      ambito.sprintsVistos.set('s1', {
        id: 's1',
        nombre: 'Sprint 5',
        estado: 'PLANNED',
        boardId: 'b1',
        tablero: 'Web',
      });
      ambito.sprintsVistos.set('s2', {
        id: 's2',
        nombre: 'Sprint 4',
        estado: 'ACTIVE',
        boardId: 'b1',
        tablero: 'Web',
      });
      ambito.vistas.set('t1', {
        id: 't1',
        titulo: 'Una',
        columnId: 'c1',
        boardId: 'b1',
        cerrada: false,
      });
      ambito.vistas.set('t2', {
        id: 't2',
        titulo: 'Otra',
        columnId: 'c2',
        boardId: 'b2',
        cerrada: false,
      });
      return { tableros: [] };
    }) as any);
    (m.servicio as any).reportsClient = {
      send: () =>
        of({
          proyecto: { nombre: 'Web' },
          columnas: [
            { id: 'c1', nombre: 'Por hacer', orden: 0, tableroId: 'b1', tablero: 'Web' },
            { id: 'c2', nombre: 'Por hacer', orden: 0, tableroId: 'b2', tablero: 'Kanban' },
          ],
          tableros: [
            { id: 'b1', nombre: 'Web', espacio: 'G', columnas: [], scrum: { sprintEnCurso: null } },
            { id: 'b2', nombre: 'Kanban', espacio: 'G', columnas: [] },
          ],
          etiquetas: [],
          tareas: [],
        }),
    };

    await m.servicio.chat({
      ...payload,
      projectId: PROYECTO.id,
      proyectos: [],
      permisos: { canManageSprint: true },
    } as any);

    const guardado = m.conversaciones.guardarTurno.mock.calls[0] as unknown as [
      { proposals: { tool: string; args: Record<string, unknown> }[] },
    ];
    /* Ni el inicio (hay otro en curso) ni el sprint en un tablero sin Scrum. */
    expect(guardado[0].proposals.map((p) => p.tool)).toEqual(['proponer_planificacion']);
    expect(guardado[0].proposals[0].args).toMatchObject({
      sprintId: 's2',
      sprint: 'Sprint 4',
      tableroId: 'b1',
      taskIds: ['t1'],
    });
  });

  /**
   * La propuesta fantasma (visto con Gemini de verdad): el texto dice que hay
   * una propuesta preparada y no hubo llamada. Tiene que entrar el turno de
   * recuperación, y lo que proponga ahí es lo que se guarda.
   */
  it('si dice «he preparado una propuesta» sin llamar a nada, se le pide que la llame', async () => {
    const m = montar([
      respuesta({ text: 'He preparado una propuesta para abrir el proyecto Web.' }),
      respuesta({
        text: 'Aquí está.',
        calls: [
          {
            name: 'proponer_abrir_proyecto',
            args: { projectId: PROYECTO.id, porQue: 'Lo nombraste.' },
          },
        ],
      }),
    ]);

    await m.servicio.chat(payload as any);

    expect(m.gemini.chat).toHaveBeenCalledTimes(2);
    expect(m.llamadas[1].params.message).toContain('NO has llamado a ninguna herramienta');
    const guardado = m.conversaciones.guardarTurno.mock.calls[0] as unknown as [
      { proposals: { tool: string }[] },
    ];
    expect(guardado[0].proposals.map((p) => p.tool)).toEqual(['proponer_abrir_proyecto']);
  });

  it('«te propongo que…» es una sugerencia, no una tarjeta prometida: no hay segundo turno', async () => {
    const m = montar([respuesta({ text: 'Te propongo que empieces por la maqueta.' })]);
    await m.servicio.chat(payload as any);
    expect(m.gemini.chat).toHaveBeenCalledTimes(1);
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
