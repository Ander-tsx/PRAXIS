import { expect, test } from '@playwright/test';
import { comoBearer, data, nombreUnico } from '../../fixtures/api';
import { crearMundo, crearTarea } from '../../fixtures/mundo';

interface Revision {
  rules: number;
  candidates: number;
  succeeded: number;
  failed: number;
}

interface Ejecucion {
  status: string;
  rule: { name: string };
}

interface Bandeja {
  items: Array<{ type: string; taskId?: string }>;
}

test.describe('Automatización académica', () => {
  test('avisa un vencimiento próximo una sola vez y deja auditoría', async ({ request }) => {
    const mundo = await crearMundo(request);
    const headers = comoBearer(mundo.duenno.accessToken);
    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);
    const manana = new Date();
    manana.setUTCDate(manana.getUTCDate() + 1);

    const actualizacion = await request.patch(`/api/tasks/${tarea.id}`, {
      headers,
      data: { dueDate: manana.toISOString(), priority: 'HIGH' },
    });
    expect(actualizacion.status(), 'Preparar fecha y prioridad de la tarea').toBe(200);

    const asignacion = await request.post(`/api/tasks/${tarea.id}/assign`, {
      headers,
      data: { assigneeIds: [mundo.duenno.userId] },
    });
    expect(asignacion.status(), 'Asignar la tarea que recibirá el aviso').toBe(200);

    const nombreRegla = nombreUnico('Avisar vencimiento').slice(0, 120);
    const alta = await request.post(`/api/projects/${mundo.proyecto.id}/automations`, {
      headers,
      data: {
        name: nombreRegla,
        status: 'ENABLED',
        trigger: { type: 'TASK_DUE_SOON', config: { leadTimeMinutes: 4320 } },
        conditions: [{ field: 'priority', operator: 'EQUALS', value: 'HIGH' }],
        actions: [{ type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'ASSIGNEES' } }],
      },
    });
    expect(alta.status(), 'Crear y habilitar la regla académica').toBe(201);

    const primeraRevision = await request.post(
      `/api/projects/${mundo.proyecto.id}/automations/review`,
      { headers },
    );
    expect(primeraRevision.status()).toBe(200);
    expect(await data<Revision>(primeraRevision)).toMatchObject({
      rules: 1,
      candidates: 1,
      succeeded: 1,
      failed: 0,
    });

    const ejecuciones = await data<Ejecucion[]>(
      await request.get(`/api/projects/${mundo.proyecto.id}/automations/executions`, {
        headers,
      }),
    );
    expect(ejecuciones).toContainEqual(
      expect.objectContaining({ status: 'SUCCEEDED', rule: { name: nombreRegla } }),
    );

    const bandeja = await data<Bandeja>(await request.get('/api/me/notifications', { headers }));
    expect(bandeja.items).toContainEqual(
      expect.objectContaining({ type: 'AUTOMATION_TASK_DUE_SOON', taskId: tarea.id }),
    );

    const segundaRevision = await request.post(
      `/api/projects/${mundo.proyecto.id}/automations/review`,
      { headers },
    );
    expect(await data<Revision>(segundaRevision)).toMatchObject({
      rules: 1,
      candidates: 1,
      succeeded: 0,
      failed: 0,
    });

    const bandejaFinal = await data<Bandeja>(
      await request.get('/api/me/notifications', { headers }),
    );
    expect(
      bandejaFinal.items.filter(
        (aviso) => aviso.type === 'AUTOMATION_TASK_DUE_SOON' && aviso.taskId === tarea.id,
      ),
    ).toHaveLength(1);
  });

  /**
   * Fija el catálogo real de `rule-definition.ts`, que es **más estrecho**
   * que el enum de `@praxis/contracts`: el enum admite triggers y acciones
   * que el validador rechaza con «no soportado en el MVP académico». El
   * frontend de Reglas construye su catálogo leyendo este comportamiento, no
   * el enum — estos casos son la especificación contra la que se valida ese
   * catálogo, y si backend cambia el contrato, la caída ocurre aquí y no en
   * la interfaz.
   */
  test.describe('rechaza lo que queda fuera del catálogo académico', () => {
    let cabeceras: Record<string, string>;
    let proyectoId: string;

    test.beforeAll(async ({ request }) => {
      const mundo = await crearMundo(request);
      cabeceras = comoBearer(mundo.duenno.accessToken);
      proyectoId = mundo.proyecto.id;
    });

    function reglaBase(overrides: Record<string, unknown> = {}) {
      return {
        name: nombreUnico('Regla de rechazo').slice(0, 120),
        trigger: { type: 'TASK_DUE_SOON', config: { leadTimeMinutes: 60 } },
        conditions: [] as unknown[],
        actions: [{ type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'ASSIGNEES' } }],
        ...overrides,
      };
    }

    test('una clave de más en trigger.config da 400', async ({ request }) => {
      const respuesta = await request.post(`/api/projects/${proyectoId}/automations`, {
        headers: cabeceras,
        data: reglaBase({
          trigger: {
            type: 'TASK_DUE_SOON',
            config: { leadTimeMinutes: 60, extra: 'no debería aceptarse' },
          },
        }),
      });
      expect(respuesta.status(), 'clave extra en trigger.config').toBe(400);
    });

    test('recipientSelector cruzado con el trigger da 400', async ({ request }) => {
      const respuesta = await request.post(`/api/projects/${proyectoId}/automations`, {
        headers: cabeceras,
        data: reglaBase({
          actions: [
            { type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'PROJECT_OWNER' } },
          ],
        }),
      });
      expect(respuesta.status(), 'TASK_DUE_SOON solo admite recipientSelector ASSIGNEES').toBe(400);
    });

    test('IN con un valor escalar (no lista) da 400', async ({ request }) => {
      const respuesta = await request.post(`/api/projects/${proyectoId}/automations`, {
        headers: cabeceras,
        data: reglaBase({
          conditions: [{ field: 'priority', operator: 'IN', value: 'HIGH' }],
        }),
      });
      expect(respuesta.status(), 'IN exige una lista').toBe(400);
    });

    test('EQUALS con una lista (no escalar) da 400', async ({ request }) => {
      const respuesta = await request.post(`/api/projects/${proyectoId}/automations`, {
        headers: cabeceras,
        data: reglaBase({
          conditions: [{ field: 'priority', operator: 'EQUALS', value: ['HIGH', 'URGENT'] }],
        }),
      });
      expect(respuesta.status(), 'EQUALS exige un valor escalar').toBe(400);
    });

    test('status INVALID (reservado al sistema) da 400', async ({ request }) => {
      const respuesta = await request.post(`/api/projects/${proyectoId}/automations`, {
        headers: cabeceras,
        data: reglaBase({ status: 'INVALID' }),
      });
      expect(respuesta.status(), 'solo ENABLED/DISABLED vienen del cliente').toBe(400);
    });

    test('cero acciones da 400', async ({ request }) => {
      const respuesta = await request.post(`/api/projects/${proyectoId}/automations`, {
        headers: cabeceras,
        data: reglaBase({ actions: [] }),
      });
      expect(respuesta.status(), 'una regla requiere al menos una acción').toBe(400);
    });

    test('seis acciones (máximo cinco) da 400', async ({ request }) => {
      const accion = { type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'ASSIGNEES' } };
      const respuesta = await request.post(`/api/projects/${proyectoId}/automations`, {
        headers: cabeceras,
        data: reglaBase({ actions: Array(6).fill(accion) }),
      });
      expect(respuesta.status(), 'máximo cinco acciones secuenciales').toBe(400);
    });

    test('un campo de condición del otro trigger da 400', async ({ request }) => {
      const respuesta = await request.post(`/api/projects/${proyectoId}/automations`, {
        headers: cabeceras,
        data: reglaBase({
          conditions: [{ field: 'staleDays', operator: 'EQUALS', value: 3 }],
        }),
      });
      expect(respuesta.status(), 'staleDays pertenece a TASK_STALE, no a TASK_DUE_SOON').toBe(400);
    });
  });
});
