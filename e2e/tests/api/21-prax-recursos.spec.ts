import { type APIRequestContext, expect, test } from '@playwright/test';
import { comoBearer, crearProyecto, data, nombreUnico, registrar } from '../../fixtures/api';

/**
 * «Recursos» de PRAX: qué proyectos puede consultar, por persona y organización
 * (F2 de docs/PLAN-PRAX-SEMIAGENTICO.md, D5).
 *
 * Lo que fijan estas pruebas es lo que antes era falso: la elección llega al
 * servidor, se valida contra la organización y los permisos, y no deja ver nada
 * de otra organización.
 */

type Alcance = {
  organizationId: string;
  modo: 'ALL' | 'SELECTED';
  proyectos: { id: string; nombre: string; incluido: boolean }[];
};

async function montar(request: APIRequestContext) {
  const persona = await registrar(request);
  const cabeceras = comoBearer(persona.accessToken);
  const organizaciones = await data<{ id: string; kind: string }[]>(
    await request.get('/api/me/organizations', { headers: cabeceras }),
  );
  const personal = organizaciones.find((o) => o.kind === 'PERSONAL')!.id;
  const equipo = (
    await data<{ id: string }>(
      await request.post('/api/me/organizations', {
        headers: cabeceras,
        data: { name: nombreUnico('Equipo recursos') },
      }),
    )
  ).id;

  const a = await crearProyecto(request, persona.accessToken);
  const b = await crearProyecto(request, persona.accessToken);
  const deEquipo = await data<{ id: string }>(
    await request.post('/api/projects', {
      headers: cabeceras,
      data: { name: nombreUnico('De equipo'), organizationId: equipo },
    }),
  );
  return { persona, cabeceras, personal, equipo, a: a.id, b: b.id, deEquipo: deEquipo.id };
}

test.describe('Recursos de PRAX', () => {
  test('sin elegir nada, PRAX puede consultar todos los proyectos de la organización', async ({
    request,
  }) => {
    const m = await montar(request);
    const alcance = await data<Alcance>(
      await request.get(`/api/me/assistant/scope?organizationId=${m.personal}`, {
        headers: m.cabeceras,
      }),
    );

    expect(alcance.modo).toBe('ALL');
    const ids = alcance.proyectos.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([m.a, m.b]));
    expect(alcance.proyectos.every((p) => p.incluido)).toBe(true);
  });

  test('🔴 los recursos de una organización no enseñan proyectos de otra', async ({ request }) => {
    const m = await montar(request);
    const alcance = await data<Alcance>(
      await request.get(`/api/me/assistant/scope?organizationId=${m.equipo}`, {
        headers: m.cabeceras,
      }),
    );

    const ids = alcance.proyectos.map((p) => p.id);
    expect(ids).toContain(m.deEquipo);
    expect(ids).not.toContain(m.a);
    expect(ids).not.toContain(m.b);
  });

  test('se guarda una selección y vuelve tal cual', async ({ request }) => {
    const m = await montar(request);
    const guardado = await data<Alcance>(
      await request.put('/api/me/assistant/scope', {
        headers: m.cabeceras,
        data: { organizationId: m.personal, modo: 'SELECTED', projectIds: [m.a] },
      }),
    );
    expect(guardado.modo).toBe('SELECTED');

    const leido = await data<Alcance>(
      await request.get(`/api/me/assistant/scope?organizationId=${m.personal}`, {
        headers: m.cabeceras,
      }),
    );
    const porId = Object.fromEntries(leido.proyectos.map((p) => [p.id, p.incluido]));
    expect(porId[m.a]).toBe(true);
    expect(porId[m.b]).toBe(false);
  });

  test('🔴 no se puede meter en los recursos un proyecto de otra organización', async ({
    request,
  }) => {
    const m = await montar(request);
    const respuesta = await request.put('/api/me/assistant/scope', {
      headers: m.cabeceras,
      data: { organizationId: m.personal, modo: 'SELECTED', projectIds: [m.deEquipo] },
    });
    expect(respuesta.status()).toBe(400);
  });

  test('🔴 ni uno ajeno, de otra persona', async ({ request }) => {
    const m = await montar(request);
    const otra = await registrar(request);
    const suyo = await crearProyecto(request, otra.accessToken);

    const respuesta = await request.put('/api/me/assistant/scope', {
      headers: m.cabeceras,
      data: { organizationId: m.personal, modo: 'SELECTED', projectIds: [suyo.id] },
    });
    expect(respuesta.status()).toBe(400);
  });

  test('volver a «todos» olvida la selección', async ({ request }) => {
    const m = await montar(request);
    await request.put('/api/me/assistant/scope', {
      headers: m.cabeceras,
      data: { organizationId: m.personal, modo: 'SELECTED', projectIds: [m.a] },
    });
    const todo = await data<Alcance>(
      await request.put('/api/me/assistant/scope', {
        headers: m.cabeceras,
        data: { organizationId: m.personal, modo: 'ALL', projectIds: [] },
      }),
    );
    expect(todo.modo).toBe('ALL');
    expect(todo.proyectos.every((p) => p.incluido)).toBe(true);
  });
});
