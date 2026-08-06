import { expect, test } from '@playwright/test';
import { comoBearer, crearProyecto, data, registrar } from '../../fixtures/api';
import { crearMundo, crearTarea, darDeAlta } from '../../fixtures/mundo';

/**
 * Autorización: quién puede tocar qué.
 *
 * Aquí viven las regresiones que más caro salieron. Dos en concreto:
 *
 * 1. **El bypass del `projectId` en el cuerpo.** Mientras el cliente elegía el
 *    proyecto, declarar uno propio daba acceso a las tareas de cualquier otro.
 *    Lo cerró `48a0058` haciendo que el guard lo resuelva desde la ruta.
 * 2. **`PATCH`/`DELETE /users/:id` sin dueño.** Solo llevaban `JwtGuard`:
 *    cualquiera con sesión podía editar la cuenta de otro sabiendo su id.
 *
 * Las dos se comprueban con **dos cuentas reales**, que es como se encontraron.
 */

test.describe('Aislamiento entre cuentas', () => {
  test('no se ve un proyecto ajeno', async ({ request }) => {
    const mundo = await crearMundo(request);
    const intrusa = await registrar(request);

    const respuesta = await request.get(`/api/projects/${mundo.proyecto.id}`, {
      headers: comoBearer(intrusa.accessToken),
    });

    expect([403, 404], `Llegó ${respuesta.status()}`).toContain(respuesta.status());
  });

  test('el listado solo trae los proyectos propios o donde eres miembro', async ({ request }) => {
    const mundo = await crearMundo(request);
    const intrusa = await registrar(request);

    const respuesta = await request.get('/api/projects', {
      headers: comoBearer(intrusa.accessToken),
    });
    expect(respuesta.status()).toBe(200);

    const pagina = await data<{ items: { id: string }[] }>(respuesta);
    const ids = pagina.items.map((p) => p.id);

    expect(ids, 'El proyecto ajeno no debe aparecer en el listado').not.toContain(
      mundo.proyecto.id,
    );
  });

  test('no se borra un proyecto ajeno', async ({ request }) => {
    const mundo = await crearMundo(request);
    const intrusa = await registrar(request);

    const respuesta = await request.delete(`/api/projects/${mundo.proyecto.id}`, {
      headers: comoBearer(intrusa.accessToken),
    });

    expect([403, 404]).toContain(respuesta.status());

    /* Y sigue existiendo: un 403 que borra igualmente sería peor que un 200. */
    const comprobacion = await request.get(`/api/projects/${mundo.proyecto.id}`, {
      headers: comoBearer(mundo.duenno.accessToken),
    });
    expect(comprobacion.status(), 'El proyecto debe seguir ahí').toBe(200);
  });

  /**
   * 🔴 Regresión de `48a0058`.
   *
   * La forma original del ataque: el atacante tiene un proyecto propio y manda
   * su id en el cuerpo mientras apunta a una tarea ajena. El guard concedía por
   * ser dueño de *ese* proyecto y nadie comparaba después con el proyecto real
   * de la tarea.
   *
   * Hoy debe fallar por dos motivos independientes, y cualquiera de los dos
   * vale: `forbidNonWhitelisted` rechaza el campo (400) o el guard resuelve el
   * proyecto desde la ruta y deniega (403/404).
   */
  test('mandar projectId propio en el cuerpo no da acceso a una tarea ajena', async ({
    request,
  }) => {
    const mundo = await crearMundo(request);
    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);

    const atacante = await registrar(request);
    const proyectoDelAtacante = await crearProyecto(request, atacante.accessToken);

    const respuesta = await request.patch(`/api/tasks/${tarea.id}`, {
      headers: comoBearer(atacante.accessToken),
      data: { title: 'Secuestrada', projectId: proyectoDelAtacante.id },
    });

    expect([400, 403, 404], `El bypass de projectId volvió: llegó ${respuesta.status()}`).toContain(
      respuesta.status(),
    );

    const comprobacion = await request.get(`/api/tasks/${tarea.id}`, {
      headers: comoBearer(mundo.duenno.accessToken),
    });
    const sigue = await data<{ title: string }>(comprobacion);
    expect(sigue.title, 'El título no debe haber cambiado').toBe(tarea.title);
  });

  test('tampoco se lee una tarea ajena apuntando a ella directamente', async ({ request }) => {
    const mundo = await crearMundo(request);
    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);
    const intrusa = await registrar(request);

    const respuesta = await request.get(`/api/tasks/${tarea.id}`, {
      headers: comoBearer(intrusa.accessToken),
    });

    expect([403, 404]).toContain(respuesta.status());
  });
});

test.describe('Cuentas de usuario', () => {
  /** 🔴 Regresión: `AccountOwnerGuard`. */
  test('no se edita la cuenta de otro', async ({ request }) => {
    const victima = await registrar(request);
    const atacante = await registrar(request);

    const respuesta = await request.patch(`/api/users/${victima.userId}`, {
      headers: comoBearer(atacante.accessToken),
      data: { firstName: 'Secuestrada' },
    });

    expect(respuesta.status(), 'Solo el dueño o un Admin global').toBe(403);
  });

  test('no se borra la cuenta de otro', async ({ request }) => {
    const victima = await registrar(request);
    const atacante = await registrar(request);

    const respuesta = await request.delete(`/api/users/${victima.userId}`, {
      headers: comoBearer(atacante.accessToken),
    });
    expect(respuesta.status()).toBe(403);

    /* Y la víctima sigue pudiendo entrar. */
    const comprobacion = await request.get('/api/users/me', {
      headers: comoBearer(victima.accessToken),
    });
    expect(comprobacion.status()).toBe(200);
  });

  test('sí se edita la cuenta propia, y en camelCase', async ({ request }) => {
    const usuario = await registrar(request);

    const respuesta = await request.patch(`/api/users/${usuario.userId}`, {
      headers: comoBearer(usuario.accessToken),
      data: { firstName: 'Ada', lastName: 'Lovelace' },
    });
    expect(respuesta.status()).toBe(200);

    /* Se confirma contra el `data` de la respuesta, no contra el status: hubo
       una época en que PATCH devolvía 200 sin guardar nada. */
    const perfil = await data<{ firstName: string; lastName: string }>(respuesta);
    expect(perfil.firstName).toBe('Ada');
    expect(perfil.lastName).toBe('Lovelace');
  });
});

test.describe('Permisos de proyecto', () => {
  test('un rol de solo lectura ve el proyecto pero no crea tareas', async ({ request }) => {
    const mundo = await crearMundo(request);
    const lectora = await registrar(request);

    await darDeAlta(request, mundo, lectora, { canViewProject: true });

    const lectura = await request.get(`/api/projects/${mundo.proyecto.id}`, {
      headers: comoBearer(lectora.accessToken),
    });
    expect(lectura.status(), 'canViewProject debería bastar para leer').toBe(200);

    const escritura = await request.post(`/api/boards/${mundo.boardId}/tasks`, {
      headers: comoBearer(lectora.accessToken),
      data: {
        columnId: mundo.primeraColumna.id,
        title: 'No debería crearse',
        status: mundo.primeraColumna.name,
      },
    });
    expect(escritura.status(), 'Sin canCreateTask no se crea').toBe(403);
  });

  test('canCreateTask permite crear pero no borrar', async ({ request }) => {
    const mundo = await crearMundo(request);
    const colaboradora = await registrar(request);

    await darDeAlta(request, mundo, colaboradora, {
      canViewProject: true,
      canCreateTask: true,
    });

    const creacion = await request.post(`/api/boards/${mundo.boardId}/tasks`, {
      headers: comoBearer(colaboradora.accessToken),
      data: {
        columnId: mundo.primeraColumna.id,
        title: 'Creada por la colaboradora',
        status: mundo.primeraColumna.name,
      },
    });
    expect(creacion.status()).toBe(201);
    const tarea = await data<{ id: string }>(creacion);

    const borrado = await request.delete(`/api/tasks/${tarea.id}`, {
      headers: comoBearer(colaboradora.accessToken),
    });
    expect(borrado.status(), 'canCreateTask no arrastra canDeleteTask').toBe(403);
  });

  /**
   * La jerarquía de `PERMISSION_HIERARCHY`: `canEditTask` implica `canMoveTask`,
   * `canComment` y `canCreateTask`. Se comprueba porque el formulario de roles
   * la refleja en la interfaz y una expansión rota daría permisos de menos sin
   * ningún síntoma hasta que alguien se queja.
   */
  test('canEditTask arrastra canMoveTask por jerarquía', async ({ request }) => {
    const mundo = await crearMundo(request);
    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);
    const editora = await registrar(request);

    await darDeAlta(request, mundo, editora, { canViewProject: true, canEditTask: true });

    const destino = mundo.columnas[1];
    const respuesta = await request.post(`/api/tasks/${tarea.id}/move`, {
      headers: comoBearer(editora.accessToken),
      data: { columnId: destino.id, status: destino.name },
    });

    expect(respuesta.status(), 'canEditTask → canMoveTask').toBe(200);
  });

  test('permissions/me describe lo que puede hacer quien pregunta', async ({ request }) => {
    const mundo = await crearMundo(request);
    const lectora = await registrar(request);

    await darDeAlta(request, mundo, lectora, { canViewProject: true });

    const respuesta = await request.get(`/api/projects/${mundo.proyecto.id}/permissions/me`, {
      headers: comoBearer(lectora.accessToken),
    });
    expect(respuesta.status()).toBe(200);

    /* Es la ruta que evita «intenta la acción y reacciona al 403». Si deja de
       responder, la interfaz vuelve a pintar botones que no funcionan. */
    const permisos = await data<Record<string, unknown>>(respuesta);
    expect(permisos, 'Debe ser un diccionario, no un array').not.toBeInstanceOf(Array);
    expect(typeof permisos).toBe('object');
  });
});
