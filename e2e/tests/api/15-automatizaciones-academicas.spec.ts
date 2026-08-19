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
});
