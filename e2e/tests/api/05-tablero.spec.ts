import { expect, test } from '@playwright/test';
import { comoBearer, data, nombreUnico, registrar } from '../../fixtures/api';
import { crearMundo, crearTarea, darDeAlta } from '../../fixtures/mundo';

/**
 * El recorrido de trabajo real: espacio → tablero → columnas → tarea → moverla.
 *
 * Es la ruta que recorre cualquiera que use PRAXIS de verdad, y la que más
 * piezas encadena. Si algo se rompe entre el gateway y projects/tasks-service,
 * se nota aquí antes que en ninguna pantalla.
 */

test.describe('Tablero', () => {
  test('el proyecto trae el árbol embebido con espacios, tableros y columnas', async ({
    request,
  }) => {
    const mundo = await crearMundo(request);

    const respuesta = await request.get(`/api/projects/${mundo.proyecto.id}`, {
      headers: comoBearer(mundo.duenno.accessToken),
    });
    expect(respuesta.status()).toBe(200);

    /* No hay `GET /boards/:id/columns`: las columnas **solo** llegan por aquí.
       Si el árbol dejara de venir, la pizarra se queda sin columnas y sin
       ningún error que lo explique. */
    const detalle = await data<{
      workspaces?: { id: string; boards?: { id: string; columns?: unknown[] }[] }[];
    }>(respuesta);

    const espacio = detalle.workspaces?.find((w) => w.id === mundo.workspaceId);
    expect(espacio, 'El espacio debería venir embebido').toBeTruthy();

    const tablero = espacio?.boards?.find((b) => b.id === mundo.boardId);
    expect(tablero, 'El tablero debería venir embebido').toBeTruthy();
    expect(tablero?.columns, 'Las columnas solo llegan por aquí').toHaveLength(3);
  });

  test('las columnas reciben un color del sistema si no se manda', async ({ request }) => {
    const mundo = await crearMundo(request);

    const validos = ['primary', 'accent', 'info', 'warning', 'error', 'success'];
    for (const columna of mundo.columnas) {
      expect(validos, `Color inesperado en «${columna.name}»: ${columna.color}`).toContain(
        columna.color,
      );
    }
  });

  test('un color en hexadecimal se rechaza', async ({ request }) => {
    const mundo = await crearMundo(request);

    const respuesta = await request.post(`/api/boards/${mundo.boardId}/columns`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: { name: 'Con hex', order: 9, color: '#ff0000' },
    });

    expect(respuesta.status(), 'color es un token del design system').toBe(400);
  });

  test('se crea una tarea y sale con la forma esperada', async ({ request }) => {
    const mundo = await crearMundo(request);
    const titulo = nombreUnico('Escribir las pruebas');

    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo, { titulo });

    expect(tarea.title).toBe(titulo);
    expect(tarea.columnId).toBe(mundo.primeraColumna.id);
    /* `status` es el **nombre de la columna**, no un enum. */
    expect(tarea.status).toBe(mundo.primeraColumna.name);
  });

  test('mandar projectId al crear una tarea da 400', async ({ request }) => {
    const mundo = await crearMundo(request);

    const respuesta = await request.post(`/api/boards/${mundo.boardId}/tasks`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: {
        columnId: mundo.primeraColumna.id,
        title: 'Con projectId de sobra',
        status: mundo.primeraColumna.name,
        projectId: mundo.proyecto.id,
      },
    });

    expect(respuesta.status(), 'El guard lo resuelve desde la ruta; mandarlo da 400').toBe(400);
  });

  test('assigneeId (en singular) da 400', async ({ request }) => {
    const mundo = await crearMundo(request);

    const respuesta = await request.post(`/api/boards/${mundo.boardId}/tasks`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: {
        columnId: mundo.primeraColumna.id,
        title: 'Con encargado en singular',
        status: mundo.primeraColumna.name,
        assigneeId: mundo.duenno.userId,
      },
    });

    expect(respuesta.status(), 'Task.assigneeId ya no existe: es assigneeIds').toBe(400);
  });

  test('mover una tarea cambia su columna y su estado', async ({ request }) => {
    const mundo = await crearMundo(request);
    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);
    const cabeceras = comoBearer(mundo.duenno.accessToken);

    const destino = mundo.columnas[1];
    const respuesta = await request.post(`/api/tasks/${tarea.id}/move`, {
      headers: cabeceras,
      data: { columnId: destino.id, status: destino.name },
    });
    expect(respuesta.status()).toBe(200);

    const movida = await data<{ columnId: string; status: string }>(respuesta);
    expect(movida.columnId).toBe(destino.id);
    expect(movida.status).toBe(destino.name);
  });

  test('assigneeIds sustituye la lista completa, no acumula', async ({ request }) => {
    const mundo = await crearMundo(request);
    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);
    const cabeceras = comoBearer(mundo.duenno.accessToken);

    const asignada = await request.post(`/api/tasks/${tarea.id}/assign`, {
      headers: cabeceras,
      data: { assigneeIds: [mundo.duenno.userId] },
    });
    expect(asignada.status()).toBe(200);
    expect((await data<{ assignees: unknown[] }>(asignada)).assignees).toHaveLength(1);

    /* Repetir la misma llamada no debe duplicar: es lo que hace un selector
       múltiple al cerrarse dos veces. */
    const repetida = await request.post(`/api/tasks/${tarea.id}/assign`, {
      headers: cabeceras,
      data: { assigneeIds: [mundo.duenno.userId] },
    });
    expect((await data<{ assignees: unknown[] }>(repetida)).assignees).toHaveLength(1);

    /* Y vaciarla desasigna a todo el mundo. */
    const vaciada = await request.post(`/api/tasks/${tarea.id}/assign`, {
      headers: cabeceras,
      data: { assigneeIds: [] },
    });
    expect((await data<{ assignees: unknown[] }>(vaciada)).assignees).toHaveLength(0);
  });

  test('no se asigna a quien no es miembro del proyecto', async ({ request }) => {
    const mundo = await crearMundo(request);
    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);
    const ajena = await registrar(request);

    const respuesta = await request.post(`/api/tasks/${tarea.id}/assign`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: { assigneeIds: [ajena.userId] },
    });

    expect(respuesta.status()).toBe(400);
  });

  test('/me/tasks trae solo las tareas de quien pregunta', async ({ request }) => {
    const mundo = await crearMundo(request);
    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);
    const cabeceras = comoBearer(mundo.duenno.accessToken);

    await request.post(`/api/tasks/${tarea.id}/assign`, {
      headers: cabeceras,
      data: { assigneeIds: [mundo.duenno.userId] },
    });

    const mias = await request.get('/api/me/tasks', { headers: cabeceras });
    expect(mias.status()).toBe(200);

    const pagina = await data<{ items: { id: string }[] }>(mias);
    expect(pagina.items.map((t) => t.id)).toContain(tarea.id);

    /* Y a otra cuenta no le aparece. */
    const otra = await registrar(request);
    const suyas = await request.get('/api/me/tasks', { headers: comoBearer(otra.accessToken) });
    const paginaAjena = await data<{ items: { id: string }[] }>(suyas);
    expect(paginaAjena.items.map((t) => t.id)).not.toContain(tarea.id);
  });

  test('los checklists cuelgan de la tarea y no aceptan projectId', async ({ request }) => {
    const mundo = await crearMundo(request);
    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);
    const cabeceras = comoBearer(mundo.duenno.accessToken);

    /* El campo es `text`, no `title`: el checklist es un paso suelto, no un
       objeto con nombre. */
    const creado = await request.post(`/api/tasks/${tarea.id}/checklists`, {
      headers: cabeceras,
      data: { text: 'Escribir el primer paso' },
    });
    expect(creado.status()).toBe(201);

    const conProyecto = await request.post(`/api/tasks/${tarea.id}/checklists`, {
      headers: cabeceras,
      data: { text: 'Con projectId', projectId: mundo.proyecto.id },
    });
    expect(conProyecto.status(), 'Ninguna ruta de checklist acepta projectId').toBe(400);
  });

  test('un comentario lo puede dejar quien tenga canComment', async ({ request }) => {
    const mundo = await crearMundo(request);
    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);
    const comentarista = await registrar(request);

    await darDeAlta(request, mundo, comentarista, { canViewProject: true, canComment: true });

    /* El campo es `body`. `content` da 400 sin decir por qué falta. */
    const respuesta = await request.post(`/api/tasks/${tarea.id}/comments`, {
      headers: comoBearer(comentarista.accessToken),
      data: { body: 'Esto ya está listo por mi parte.' },
    });

    expect(respuesta.status()).toBe(201);
  });

  test('los informes exigen canViewReports', async ({ request }) => {
    const mundo = await crearMundo(request);
    const lectora = await registrar(request);

    await darDeAlta(request, mundo, lectora, { canViewProject: true });

    const sinPermiso = await request.get(
      `/api/projects/${mundo.proyecto.id}/reports/snapshot`,
      { headers: comoBearer(lectora.accessToken) },
    );
    expect(sinPermiso.status(), 'Las siete rutas de informes piden canViewReports').toBe(403);

    /* El dueño sí, siempre: tiene acceso total sin pasar por roles. */
    const comoDuenno = await request.get(
      `/api/projects/${mundo.proyecto.id}/reports/snapshot`,
      { headers: comoBearer(mundo.duenno.accessToken) },
    );
    expect(comoDuenno.status()).toBe(200);
  });
});
