import { type APIRequestContext, type APIResponse, expect, test } from '@playwright/test';
import { comoBearer, crearProyecto, data, error, nombreUnico, registrar } from '../../fixtures/api';

/**
 * PRAX vive dentro de la organización activa (F1 de docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * Una persona con dos organizaciones —la personal y una de equipo— no puede, desde
 * una, ver ni continuar lo de la otra: ni sus proyectos, ni sus conversaciones.
 *
 * ## Por qué estas pruebas no dependen de Gemini
 *
 * La conversación se crea **antes** de llamar al modelo (`resolver()`), así que un
 * turno que falla porque no hay clave válida deja igualmente su conversación y su
 * `conversationId` en el error. Y los 403 de organización se deciden antes de
 * llegar a Gemini. Con clave o sin ella, el resultado es el mismo.
 */

async function conversationIdDe(respuesta: APIResponse): Promise<string> {
  const sobre = await respuesta.json();
  const id = sobre.success ? sobre.data?.conversationId : sobre.error?.details?.conversationId;
  expect(
    id,
    `El turno tenía que dejar una conversación: ${JSON.stringify(sobre).slice(0, 300)}`,
  ).toBeTruthy();
  return id;
}

async function montar(request: APIRequestContext) {
  const persona = await registrar(request);
  const cabeceras = comoBearer(persona.accessToken);

  const organizaciones = await data<{ id: string; kind: string }[]>(
    await request.get('/api/me/organizations', { headers: cabeceras }),
  );
  const personal = organizaciones.find((o) => o.kind === 'PERSONAL');
  expect(personal, 'Toda cuenta nace con su organización personal').toBeTruthy();

  const equipo = await data<{ id: string }>(
    await request.post('/api/me/organizations', {
      headers: cabeceras,
      data: { name: nombreUnico('Equipo PRAX') },
    }),
  );

  const proyectoPersonal = await crearProyecto(request, persona.accessToken);
  const proyectoDeEquipo = await data<{ id: string }>(
    await request.post('/api/projects', {
      headers: cabeceras,
      data: { name: nombreUnico('Proyecto de equipo'), organizationId: equipo.id },
    }),
  );

  return {
    cabeceras,
    personal: personal!.id,
    equipo: equipo.id,
    proyectoPersonal: proyectoPersonal.id,
    proyectoDeEquipo: proyectoDeEquipo.id,
  };
}

test.describe('PRAX y la organización activa', () => {
  test('🔴 hablar de un proyecto de otra organización da 403 NOT_IN_ORG', async ({ request }) => {
    const m = await montar(request);

    const respuesta = await request.post(`/api/projects/${m.proyectoDeEquipo}/assistant/chat`, {
      headers: m.cabeceras,
      data: { message: '¿Qué tareas hay?', organizationId: m.personal },
    });

    expect(respuesta.status()).toBe(403);
    expect((await error(respuesta)).code).toBe('NOT_IN_ORG');
  });

  test('desde su propia organización, la ruta de proyecto no se niega por organización', async ({
    request,
  }) => {
    const m = await montar(request);

    const respuesta = await request.post(`/api/projects/${m.proyectoDeEquipo}/assistant/chat`, {
      headers: m.cabeceras,
      data: { message: '¿Qué tareas hay?', organizationId: m.equipo },
    });

    /* 200 con clave de Gemini; 502 sin ella. Lo que no puede ser es un 403. */
    expect(respuesta.status()).not.toBe(403);
  });

  test('🔴 las conversaciones de una organización no salen en la otra', async ({ request }) => {
    const m = await montar(request);

    const turno = await request.post('/api/me/assistant/chat', {
      headers: m.cabeceras,
      data: { message: 'Hola desde el equipo', organizationId: m.equipo },
    });
    const conversationId = await conversationIdDe(turno);

    const delEquipo = await data<{ id: string }[]>(
      await request.get(`/api/me/assistant/conversations?organizationId=${m.equipo}`, {
        headers: m.cabeceras,
      }),
    );
    expect(delEquipo.map((c) => c.id)).toContain(conversationId);

    const dePersonal = await data<{ id: string }[]>(
      await request.get(`/api/me/assistant/conversations?organizationId=${m.personal}`, {
        headers: m.cabeceras,
      }),
    );
    expect(dePersonal.map((c) => c.id)).not.toContain(conversationId);

    /* Abrirla desde la otra organización es como si no existiera. */
    const abierta = await request.get(
      `/api/me/assistant/conversations/${conversationId}?organizationId=${m.personal}`,
      { headers: m.cabeceras },
    );
    expect(abierta.status()).toBe(404);
  });

  test('🔴 una conversación no se continúa desde otra organización', async ({ request }) => {
    const m = await montar(request);

    const turno = await request.post('/api/me/assistant/chat', {
      headers: m.cabeceras,
      data: { message: 'Hola desde el equipo', organizationId: m.equipo },
    });
    const conversationId = await conversationIdDe(turno);

    const seguir = await request.post('/api/me/assistant/chat', {
      headers: m.cabeceras,
      data: { message: 'Y ahora desde la personal', conversationId, organizationId: m.personal },
    });

    expect(seguir.status()).toBe(403);
    expect((await error(seguir)).code).toBe('NOT_IN_ORG');
  });

  test('🔴 no se puede mirar desde una organización ajena', async ({ request }) => {
    const m = await montar(request);
    const otra = await registrar(request);

    const respuesta = await request.get(
      `/api/me/assistant/conversations?organizationId=${m.equipo}`,
      {
        headers: comoBearer(otra.accessToken),
      },
    );

    expect(respuesta.status()).toBe(403);
    expect((await error(respuesta)).code).toBe('NOT_IN_ORG');
  });
});
