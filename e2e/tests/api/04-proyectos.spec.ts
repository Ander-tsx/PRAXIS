import { expect, test } from '@playwright/test';
import { comoBearer, crearProyecto, data, error, nombreUnico, registrar } from '../../fixtures/api';
import { crearMundo } from '../../fixtures/mundo';

/**
 * Proyectos: el ciclo de vida y —sobre todo— los dos identificadores.
 *
 * `slug` va en la URL y `id` en la API. Los dos son `string`, así que
 * equivocarse **no da error de compilación**: sale como un 403, un 404 o un
 * desplegable vacío. Ya se coló en cinco sitios, y por eso existen los helpers
 * de `commons/api/routes.ts`. Estas pruebas fijan la regla por el lado del
 * backend, que es donde se decide.
 */

test.describe('Proyectos', () => {
  test('un proyecto nuevo nace con el dueño dentro y con rol Administrador', async ({
    request,
  }) => {
    const usuario = await registrar(request);
    const proyecto = await crearProyecto(request, usuario.accessToken);

    expect(proyecto.ownerId).toBe(usuario.userId);

    const respuesta = await request.get(`/api/projects/${proyecto.id}`, {
      headers: comoBearer(usuario.accessToken),
    });
    expect(respuesta.status()).toBe(200);

    const detalle = await data<{ roles?: { name: string }[] }>(respuesta);
    const nombresDeRol = (detalle.roles ?? []).map((r) => r.name);
    expect(nombresDeRol).toContain('Administrador');
  });

  test('el nombre es único por dueño, no globalmente', async ({ request }) => {
    const nombre = nombreUnico('Sprint compartido');

    const ana = await registrar(request);
    const bea = await registrar(request);

    const deAna = await crearProyecto(request, ana.accessToken, nombre);
    expect(deAna.name).toBe(nombre);

    /* Bea puede llamar igual al suyo: chocar globalmente dejaba ver que existe
       un proyecto ajeno con ese nombre. */
    const respuestaBea = await request.post('/api/projects', {
      headers: comoBearer(bea.accessToken),
      data: { name: nombre },
    });
    expect(respuestaBea.status(), 'Dos equipos pueden tener cada uno su «Sprint 1»').toBe(201);

    /* Pero Ana no puede repetirlo en su propia cuenta. */
    const respuestaAna = await request.post('/api/projects', {
      headers: comoBearer(ana.accessToken),
      data: { name: nombre },
    });
    expect(respuestaAna.status()).toBe(409);
  });

  test('el slug es único global y distinto para dos proyectos con el mismo nombre', async ({
    request,
  }) => {
    const nombre = nombreUnico('Rediseño del panel');

    const ana = await registrar(request);
    const bea = await registrar(request);

    const deAna = await crearProyecto(request, ana.accessToken, nombre);
    const deBea = await crearProyecto(request, bea.accessToken, nombre);

    expect(deAna.slug).toBeTruthy();
    expect(deBea.slug).toBeTruthy();
    expect(deAna.slug, 'El slug es único global').not.toBe(deBea.slug);

    /**
     * El sufijo de desempate es **aleatorio**, no un contador. Un `-2` decía
     * cuántos proyectos con ese nombre hay y dejaba enumerar los ajenos
     * probando el siguiente, porque el gateway responde 404 a un slug que no
     * existe y 403 a uno ajeno.
     */
    expect(deBea.slug, 'El desempate no puede ser un contador').not.toMatch(/-\d+$/);
  });

  test('GET /projects/:idOrSlug acepta las dos formas', async ({ request }) => {
    const usuario = await registrar(request);
    const proyecto = await crearProyecto(request, usuario.accessToken);
    const cabeceras = comoBearer(usuario.accessToken);

    const porId = await request.get(`/api/projects/${proyecto.id}`, { headers: cabeceras });
    expect(porId.status()).toBe(200);

    const porSlug = await request.get(`/api/projects/${proyecto.slug}`, { headers: cabeceras });
    expect(porSlug.status(), 'El guard traduce el slug antes de comprobar permisos').toBe(200);

    expect((await data<{ id: string }>(porSlug)).id).toBe(proyecto.id);
  });

  test('un slug que no existe da 404, no 403', async ({ request }) => {
    const usuario = await registrar(request);

    const respuesta = await request.get('/api/projects/este-slug-no-existe-en-ninguna-parte', {
      headers: comoBearer(usuario.accessToken),
    });

    /* 403 sugeriría que existe y no es tuyo, que es justo lo que no queremos
       decir. */
    expect(respuesta.status()).toBe(404);
    await error(respuesta);
  });

  /**
   * Para llamar a la API se usa el **UUID**. Esta prueba fija el contrato por el
   * lado que importa: el UUID funciona en las rutas anidadas, siempre.
   *
   * Lo que pasa al meter un slug donde va un id está en `06-seguridad`: hoy no
   * da error, devuelve una lista vacía. Vive allí porque es un fallo pendiente,
   * no el comportamiento que queremos fijar aquí.
   */
  test('las rutas anidadas funcionan con el UUID', async ({ request }) => {
    const usuario = await registrar(request);
    const proyecto = await crearProyecto(request, usuario.accessToken);

    const respuesta = await request.get(`/api/projects/${proyecto.id}/members`, {
      headers: comoBearer(usuario.accessToken),
    });
    expect(respuesta.status()).toBe(200);

    const miembros = await data<{ userId: string }[]>(respuesta);
    expect(miembros.map((m) => m.userId), 'El dueño entra solo al crear').toContain(usuario.userId);
  });

  test('renombrar regenera el slug', async ({ request }) => {
    const usuario = await registrar(request);
    const proyecto = await crearProyecto(request, usuario.accessToken);
    const cabeceras = comoBearer(usuario.accessToken);

    const nuevoNombre = nombreUnico('Nombre distinto');
    const respuesta = await request.patch(`/api/projects/${proyecto.id}`, {
      headers: cabeceras,
      data: { name: nuevoNombre },
    });
    expect(respuesta.status()).toBe(200);

    const renombrado = await data<{ slug: string; name: string }>(respuesta);
    expect(renombrado.name).toBe(nuevoNombre);
    expect(renombrado.slug, 'El slug se regenera al renombrar').not.toBe(proyecto.slug);

    /* Y el UUID sigue resolviendo, que es el motivo de usarlo en la API. */
    const porId = await request.get(`/api/projects/${proyecto.id}`, { headers: cabeceras });
    expect(porId.status()).toBe(200);
  });

  test('el nombre por debajo de 2 caracteres se rechaza', async ({ request }) => {
    const usuario = await registrar(request);

    const respuesta = await request.post('/api/projects', {
      headers: comoBearer(usuario.accessToken),
      data: { name: 'A' },
    });

    expect(respuesta.status()).toBe(400);
  });

  test('GET /projects acepta paginación y búsqueda', async ({ request }) => {
    const mundo = await crearMundo(request);

    const respuesta = await request.get(
      `/api/projects?page=1&limit=10&search=${encodeURIComponent(mundo.proyecto.name.slice(0, 12))}`,
      { headers: comoBearer(mundo.duenno.accessToken) },
    );
    expect(respuesta.status()).toBe(200);

    const pagina = await data<{ items: { id: string }[]; total: number }>(respuesta);
    expect(pagina.items.map((p) => p.id)).toContain(mundo.proyecto.id);
  });

  test('borrar el proyecto cascadea a espacios y tableros', async ({ request }) => {
    const mundo = await crearMundo(request);
    const cabeceras = comoBearer(mundo.duenno.accessToken);

    const borrado = await request.delete(`/api/projects/${mundo.proyecto.id}`, {
      headers: cabeceras,
    });
    expect(borrado.status()).toBe(200);

    const tablero = await request.get(`/api/boards/${mundo.boardId}`, { headers: cabeceras });
    expect(tablero.status(), 'El tablero debería haberse ido con el proyecto').not.toBe(200);
  });
});

test.describe('Roles de proyecto', () => {
  /**
   * 🔴 `permissions` es un **diccionario**, nunca un array.
   *
   * Un array se aceptaba con 201 y dejaba el rol vacío: el guard evalúa
   * `permisos[clave]`, y sobre un array eso es `undefined`. El backend ya lo
   * valida; esta prueba impide que la validación se caiga sin que nadie lo note.
   */
  test('un array en permissions se rechaza', async ({ request }) => {
    const mundo = await crearMundo(request);

    const respuesta = await request.post(`/api/projects/${mundo.proyecto.id}/roles`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: { name: 'Rol con array', permissions: ['canEditBoard'] },
    });

    expect(
      respuesta.status(),
      'Un array debe dar 400, no un 201 con un rol que no concede nada',
    ).toBe(400);
  });

  test('un diccionario de booleanos se acepta', async ({ request }) => {
    const mundo = await crearMundo(request);

    const respuesta = await request.post(`/api/projects/${mundo.proyecto.id}/roles`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: { name: 'Colaborador', permissions: { canViewProject: true, canEditBoard: true } },
    });

    expect(respuesta.status()).toBe(201);
    const rol = await data<{ id: string; permissions: unknown }>(respuesta);
    expect(rol.permissions).not.toBeInstanceOf(Array);
  });
});
