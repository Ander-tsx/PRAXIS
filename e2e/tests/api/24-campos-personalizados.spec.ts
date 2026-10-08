import { expect, test } from '@playwright/test';
import { comoBearer, data, registrar } from '../../fixtures/api';
import { crearMundo, crearTarea, darDeAlta } from '../../fixtures/mundo';

/**
 * Campos personalizados (`docs/PLAN-CAMPOS-PERSONALIZADOS.md`): el recorrido
 * entero por el gateway, y las tres fronteras que el guard no ve por sí solo —el
 * tipo del valor, el proyecto del campo y quién puede gestionarlos—.
 */

type Campo = {
  id: string;
  name: string;
  type: string;
  options: { id: string; name: string; color: string }[];
};
type Tarea = { id: string; fieldValues?: { fieldId: string; text: string | null; ids: string[] }[] };

test.describe('Campos personalizados', () => {
  test('crear un campo, ponerle valor y leerlo con la tarea', async ({ request }) => {
    const mundo = await crearMundo(request);
    const auth = { headers: comoBearer(mundo.duenno.accessToken) };
    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);

    const creado = await request.post(`/api/projects/${mundo.proyecto.id}/fields`, {
      ...auth,
      data: {
        name: 'Entorno',
        type: 'SELECT',
        options: [
          { name: 'Dev', color: 'info' },
          { name: 'Prod', color: 'error' },
        ],
      },
    });
    expect(creado.status()).toBe(201);
    const campo = await data<Campo>(creado);
    expect(campo.options.map((o) => o.name)).toEqual(['Dev', 'Prod']);

    const prod = campo.options[1].id;
    const puesto = await request.put(`/api/tasks/${tarea.id}/fields/${campo.id}`, {
      ...auth,
      data: { value: prod },
    });
    expect(puesto.status()).toBe(200);

    /* Confirmar contra la tarea, no contra el status (regla de `CLAUDE.md`). */
    const leida = await data<Tarea>(await request.get(`/api/tasks/${tarea.id}`, auth));
    expect(leida.fieldValues?.find((v) => v.fieldId === campo.id)?.text).toBe(prod);

    /* Y en el listado del tablero, que es de donde sale la tabla. */
    const listado = await data<{ items: Tarea[] }>(
      await request.get(`/api/boards/${mundo.boardId}/tasks`, auth),
    );
    const enTablero = listado.items.find((t) => t.id === tarea.id);
    expect(enTablero?.fieldValues?.find((v) => v.fieldId === campo.id)?.text).toBe(prod);

    /* Quitar la opción la quita de la tarea —y sin quedar en caché—. */
    await request.patch(`/api/projects/${mundo.proyecto.id}/fields/${campo.id}`, {
      ...auth,
      data: { options: [{ id: campo.options[0].id, name: 'Dev', color: 'info' }] },
    });
    const trasQuitar = await data<Tarea>(await request.get(`/api/tasks/${tarea.id}`, auth));
    expect(trasQuitar.fieldValues?.find((v) => v.fieldId === campo.id)).toBeUndefined();
  });

  test('un valor que no es del tipo del campo da 400', async ({ request }) => {
    const mundo = await crearMundo(request);
    const auth = { headers: comoBearer(mundo.duenno.accessToken) };
    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);
    const campo = await data<Campo>(
      await request.post(`/api/projects/${mundo.proyecto.id}/fields`, {
        ...auth,
        data: { name: 'Horas', type: 'NUMBER' },
      }),
    );

    const malo = await request.put(`/api/tasks/${tarea.id}/fields/${campo.id}`, {
      ...auth,
      data: { value: 'muchas' },
    });
    expect(malo.status()).toBe(400);
  });

  test('una persona tiene que ser del proyecto', async ({ request }) => {
    const mundo = await crearMundo(request);
    const auth = { headers: comoBearer(mundo.duenno.accessToken) };
    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);
    const ajena = await registrar(request);
    const campo = await data<Campo>(
      await request.post(`/api/projects/${mundo.proyecto.id}/fields`, {
        ...auth,
        data: { name: 'Reviewer', type: 'PERSON' },
      }),
    );

    const fuera = await request.put(`/api/tasks/${tarea.id}/fields/${campo.id}`, {
      ...auth,
      data: { value: [ajena.userId] },
    });
    expect(fuera.status()).toBe(400);

    const dentro = await request.put(`/api/tasks/${tarea.id}/fields/${campo.id}`, {
      ...auth,
      data: { value: [mundo.duenno.userId] },
    });
    expect(dentro.status()).toBe(200);
  });

  test('un campo de otro proyecto no se escribe en esta tarea', async ({ request }) => {
    const mundo = await crearMundo(request);
    const otro = await crearMundo(request);
    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);
    const campoAjeno = await data<Campo>(
      await request.post(`/api/projects/${otro.proyecto.id}/fields`, {
        headers: comoBearer(otro.duenno.accessToken),
        data: { name: 'Ajeno', type: 'TEXT' },
      }),
    );

    const respuesta = await request.put(`/api/tasks/${tarea.id}/fields/${campoAjeno.id}`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: { value: 'hola' },
    });
    expect(respuesta.status()).toBe(403);
  });

  test('sin canEditTask se leen pero no se gestionan', async ({ request }) => {
    const mundo = await crearMundo(request);
    const lectora = await registrar(request);
    await darDeAlta(request, mundo, lectora, { canViewProject: true });

    const lista = await request.get(`/api/projects/${mundo.proyecto.id}/fields`, {
      headers: comoBearer(lectora.accessToken),
    });
    expect(lista.status()).toBe(200);

    const crear = await request.post(`/api/projects/${mundo.proyecto.id}/fields`, {
      headers: comoBearer(lectora.accessToken),
      data: { name: 'No debería', type: 'TEXT' },
    });
    expect(crear.status()).toBe(403);
  });
});
