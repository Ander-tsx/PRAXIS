import { type APIRequestContext, expect, test } from '@playwright/test';
import { comoBearer, data } from '../../fixtures/api';
import { type Mundo, crearMundo } from '../../fixtures/mundo';

/**
 * Las capacidades nuevas de PRAX (F7 de docs/PLAN-PRAX-SEMIAGENTICO.md), de
 * punta a punta: consulta → propuesta validada en el servidor → los endpoints
 * de siempre al aceptar.
 *
 * ## Solo con el Gemini falso
 *
 * El modelo de verdad no se puede guionizar. `fixtures/gemini-falso.mjs` lee
 * directivas del mensaje (`#consulta`, `#propon`) y rellena los ids con lo que
 * devolvió la consulta, así que lo que se prueba es **todo lo nuestro**: la
 * consulta, lo que anota, la validación y lo que se guarda. Se salta si no se
 * arranca con `E2E_GEMINI_FALSO=1` y el servicio apuntando al falso
 * (`GEMINI_BASE_URL=http://127.0.0.1:3999`).
 */
test.skip(
  process.env.E2E_GEMINI_FALSO !== '1',
  'Necesita el Gemini falso: E2E_GEMINI_FALSO=1 y GEMINI_BASE_URL apuntando a él',
);

interface Propuesta {
  tool: string;
  args: Record<string, unknown>;
}

/** Un turno por el flujo en vivo; devuelve las propuestas del `fin`. */
async function turno(
  request: APIRequestContext,
  mundo: Mundo,
  mensaje: string,
): Promise<Propuesta[]> {
  const respuesta = await request.post(`/api/projects/${mundo.proyecto.id}/assistant/chat/stream`, {
    headers: { ...comoBearer(mundo.duenno.accessToken), Accept: 'text/event-stream' },
    data: { message: mensaje },
    timeout: 120_000,
  });
  expect(respuesta.status()).toBe(200);
  const cuerpo = await respuesta.text();
  const fin = cuerpo
    .split('\n\n')
    .find((bloque) => bloque.startsWith('event: fin'))
    ?.split('\n')
    .find((linea) => linea.startsWith('data:'));
  expect(fin, `El turno terminó sin «fin»:\n${cuerpo.slice(0, 600)}`).toBeTruthy();
  return (JSON.parse(fin!.slice(5)) as { resultado: { proposals: Propuesta[] } }).resultado
    .proposals;
}

async function tableroConScrum(request: APIRequestContext, mundo: Mundo) {
  const headers = comoBearer(mundo.duenno.accessToken);
  const scrum = await request.patch(`/api/boards/${mundo.boardId}`, {
    headers,
    data: { scrumEnabled: true },
  });
  expect(scrum.status(), 'Encender Scrum').toBe(200);
  const sprint = await request.post(`/api/boards/${mundo.boardId}/sprints`, {
    headers,
    data: { name: 'Sprint 1' },
  });
  expect(sprint.status(), 'Crear sprint').toBe(201);
  return data<{ id: string; name: string }>(sprint);
}

test.describe('PRAX — sprints', () => {
  test('consulta el backlog, propone meter las tareas en el sprint, y aceptar las mete', async ({
    request,
  }) => {
    const mundo = await crearMundo(request);
    const sprint = await tableroConScrum(request, mundo);
    /* Con `sprintId: null`, como la crea el panel Backlog: sin él, en un
       tablero con Scrum entra sola en el sprint planeado (D19 de
       PLAN-SCRUM-KANBAN) y el backlog se queda vacío. */
    const creada = await request.post(`/api/boards/${mundo.boardId}/tasks`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: {
        columnId: mundo.primeraColumna.id,
        title: 'Preparar la demo',
        status: mundo.primeraColumna.name,
        sprintId: null,
      },
    });
    expect(creada.status(), 'Crear tarea en el backlog').toBe(201);
    const tarea = await data<{ id: string }>(creada);

    const propuestas = await turno(
      request,
      mundo,
      [
        'Planifica el sprint',
        '#consulta consultar_sprints {}',
        '#propon proponer_planificacion {"sprintId":"$r.tableros.0.sprints.0.id","taskIds":"$r.tableros.0.backlog.tareas.*.id","porQue":"Cabe en la velocidad."}',
      ].join('\n'),
    );

    expect(propuestas).toHaveLength(1);
    expect(propuestas[0]).toMatchObject({
      tool: 'proponer_planificacion',
      args: {
        sprintId: sprint.id,
        sprint: 'Sprint 1',
        tableroId: mundo.boardId,
        taskIds: [tarea.id],
        tareas: [{ id: tarea.id, titulo: 'Preparar la demo' }],
      },
    });

    /* Aceptar es lo que hace `aceptarPlanificacionAction`: la ruta del panel
       Backlog, con la sesión de quien acepta. */
    const headers = comoBearer(mundo.duenno.accessToken);
    const meter = await request.post(`/api/boards/${mundo.boardId}/sprints/${sprint.id}/tasks`, {
      headers,
      data: { taskIds: propuestas[0].args.taskIds },
    });
    expect(meter.status()).toBe(200);
    const delSprint = await data<{ items: { id: string }[] }>(
      await request.get(`/api/boards/${mundo.boardId}/tasks?sprintId=${sprint.id}`, { headers }),
    );
    expect(delSprint.items.map((t) => t.id)).toContain(tarea.id);
  });

  test('🔴 un sprint o una tarea que la consulta no enseñó no llegan a tarjeta', async ({
    request,
  }) => {
    const mundo = await crearMundo(request);
    await tableroConScrum(request, mundo);

    const propuestas = await turno(
      request,
      mundo,
      [
        'Mete estas',
        '#propon proponer_planificacion {"sprintId":"00000000-0000-4000-8000-000000000000","taskIds":["00000000-0000-4000-8000-000000000001"],"porQue":"x"}',
        '#propon proponer_iniciar_sprint {"sprintId":"00000000-0000-4000-8000-000000000000","desde":"2026-10-01","hasta":"2026-10-14","porQue":"x"}',
      ].join('\n'),
    );
    expect(propuestas).toEqual([]);
  });

  test('empezar un sprint planeado: la propuesta lleva fechas, y aceptarla lo pone en curso', async ({
    request,
  }) => {
    const mundo = await crearMundo(request);
    const sprint = await tableroConScrum(request, mundo);

    const propuestas = await turno(
      request,
      mundo,
      [
        'Arranca el sprint',
        '#consulta consultar_sprints {}',
        '#propon proponer_iniciar_sprint {"sprintId":"$r.tableros.0.sprints.0.id","desde":"2026-10-01","hasta":"2026-10-14","porQue":"Listo."}',
      ].join('\n'),
    );
    expect(propuestas).toHaveLength(1);
    expect(propuestas[0].args).toMatchObject({
      sprintId: sprint.id,
      desde: '2026-10-01',
      hasta: '2026-10-14',
    });

    const empezado = await request.post(`/api/boards/${mundo.boardId}/sprints/${sprint.id}/start`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: { startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-10-14T23:59:59.999Z' },
    });
    expect(empezado.status()).toBe(201);
    expect((await data<{ status: string }>(empezado)).status).toBe('ACTIVE');
  });
});

test.describe('PRAX — documentos', () => {
  async function documento(request: APIRequestContext, mundo: Mundo, contenido: string) {
    const headers = comoBearer(mundo.duenno.accessToken);
    const espacio = await request.post(`/api/projects/${mundo.proyecto.id}/workspaces`, {
      headers,
      data: { name: 'Notas', kind: 'DOCUMENTS' },
    });
    expect(espacio.status(), 'Crear espacio de documentos').toBe(201);
    const workspaceId = (await data<{ id: string }>(espacio)).id;
    const creado = await request.post(`/api/workspaces/${workspaceId}/documents`, {
      headers,
      data: { title: 'Acta del lunes', content: contenido },
    });
    expect(creado.status(), 'Crear documento').toBe(201);
    return { workspaceId, id: (await data<{ id: string }>(creado)).id };
  }

  test('una revisión solo sale sobre un documento leído en el turno', async ({ request }) => {
    const mundo = await crearMundo(request);
    const doc = await documento(request, mundo, '# Acta\n\nsin ortografia');
    const revision = `#propon proponer_revision_documento {"documentoId":"${doc.id}","contenido":"# Acta\\n\\nSin ortografía.","cambios":"Ortografía.","porQue":"Lo pediste."}`;

    const sinLeer = await turno(request, mundo, ['Corrígelo', revision].join('\n'));
    expect(sinLeer, 'Sin leerlo, la revisión borraría lo que no vio').toEqual([]);

    const leido = await turno(
      request,
      mundo,
      ['Corrígelo', `#consulta consultar_documento {"documentoId":"${doc.id}"}`, revision].join(
        '\n',
      ),
    );
    expect(leido).toHaveLength(1);
    expect(leido[0]).toMatchObject({
      tool: 'proponer_revision_documento',
      args: {
        documentoId: doc.id,
        workspaceId: doc.workspaceId,
        titulo: 'Acta del lunes',
        contenido: '# Acta\n\nSin ortografía.',
      },
    });
  });

  test('un documento nuevo se propone con su contenido y se crea por la ruta de siempre', async ({
    request,
  }) => {
    const mundo = await crearMundo(request);
    const propuestas = await turno(
      request,
      mundo,
      [
        'Escribe el acta',
        '#propon proponer_documento {"espacio":"Documentos","titulo":"Acta","contenido":"# Acta\\n\\n- [ ] Revisar","porQue":"Lo pediste."}',
      ].join('\n'),
    );
    expect(propuestas).toHaveLength(1);
    expect(propuestas[0].args).toMatchObject({
      espacio: 'Documentos',
      titulo: 'Acta',
      contenido: '# Acta\n\n- [ ] Revisar',
    });

    /* Aceptar es `aceptarDocumentoAction`: espacio de documentos y POST con contenido. */
    const headers = comoBearer(mundo.duenno.accessToken);
    const espacio = await data<{ id: string }>(
      await request.post(`/api/projects/${mundo.proyecto.id}/workspaces`, {
        headers,
        data: { name: 'Documentos', kind: 'DOCUMENTS' },
      }),
    );
    const creado = await request.post(`/api/workspaces/${espacio.id}/documents`, {
      headers,
      data: { title: 'Acta', content: propuestas[0].args.contenido },
    });
    expect(creado.status()).toBe(201);
    const leido = await data<{ content: string }>(
      await request.get(
        `/api/workspaces/${espacio.id}/documents/${(await data<{ id: string }>(creado)).id}`,
        { headers },
      ),
    );
    expect(leido.content).toContain('- [ ] Revisar');
  });
});
