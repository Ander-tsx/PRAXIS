import { expect, test } from '@playwright/test';
import { comoBearer, crearProyecto, data, nombreUnico, registrar } from '../../fixtures/api';

/**
 * El turno de PRAX por Server-Sent Events (F3 de docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * Estas pruebas no dependen de Gemini: con clave, el flujo acaba en `fin`; sin
 * ella —o contra el Gemini falso de `fixtures/gemini-falso.mjs`—, en `fin` o en
 * un `error` bien formado. Lo que se fija es la forma del flujo, que es lo que
 * rompería el chat sin dar ningún error visible.
 */

function eventos(cuerpo: string): { tipo: string; datos: Record<string, unknown> }[] {
  return cuerpo
    .split('\n\n')
    .map((bloque) => {
      let tipo = 'message';
      let datos = '';
      for (const linea of bloque.split('\n')) {
        if (linea.startsWith('event:')) tipo = linea.slice(6).trim();
        else if (linea.startsWith('data:')) datos += linea.slice(5).trimStart();
      }
      return datos ? { tipo, datos: JSON.parse(datos) } : null;
    })
    .filter((e): e is { tipo: string; datos: Record<string, unknown> } => e !== null);
}

test.describe('PRAX en vivo', () => {
  test('el turno sale como eventos: inicio primero, y fin o error al final', async ({
    request,
  }) => {
    const persona = await registrar(request);
    const proyecto = await crearProyecto(request, persona.accessToken);

    const respuesta = await request.post(`/api/projects/${proyecto.id}/assistant/chat/stream`, {
      headers: { ...comoBearer(persona.accessToken), Accept: 'text/event-stream' },
      data: { message: '¿Qué hay pendiente?' },
      timeout: 120_000,
    });

    expect(respuesta.status()).toBe(200);
    expect(respuesta.headers()['content-type']).toContain('text/event-stream');

    const lista = eventos(await respuesta.text());
    expect(lista[0]?.tipo).toBe('inicio');
    expect(lista[0]?.datos.conversationId).toBeTruthy();

    const ultimo = lista[lista.length - 1];
    expect(['fin', 'error']).toContain(ultimo.tipo);
    if (ultimo.tipo === 'error') {
      expect(ultimo.datos.statusCode).toEqual(expect.any(Number));
      expect(ultimo.datos.message).toEqual(expect.any(String));
      /* Aunque falle, la conversación ya existe y el cliente la necesita. */
      expect((ultimo.datos.details as { conversationId?: string })?.conversationId).toBe(
        lista[0].datos.conversationId,
      );
    } else {
      expect((ultimo.datos.resultado as { reply?: string }).reply).toBeTruthy();
    }
  });

  test('🔴 lo que falla antes de empezar sale como JSON, no como flujo', async ({ request }) => {
    const persona = await registrar(request);
    const cabeceras = comoBearer(persona.accessToken);
    const organizaciones = await data<{ id: string; kind: string }[]>(
      await request.get('/api/me/organizations', { headers: cabeceras }),
    );
    const personal = organizaciones.find((o) => o.kind === 'PERSONAL')!.id;
    const equipo = await data<{ id: string }>(
      await request.post('/api/me/organizations', {
        headers: cabeceras,
        data: { name: nombreUnico('Equipo en vivo') },
      }),
    );
    const deEquipo = await data<{ id: string }>(
      await request.post('/api/projects', {
        headers: cabeceras,
        data: { name: nombreUnico('De equipo'), organizationId: equipo.id },
      }),
    );

    const respuesta = await request.post(`/api/projects/${deEquipo.id}/assistant/chat/stream`, {
      headers: { ...cabeceras, Accept: 'text/event-stream' },
      data: { message: 'Hola', organizationId: personal },
    });

    expect(respuesta.status()).toBe(403);
    expect(respuesta.headers()['content-type']).toContain('application/json');
    expect((await respuesta.json()).error.code).toBe('NOT_IN_ORG');
  });
});
