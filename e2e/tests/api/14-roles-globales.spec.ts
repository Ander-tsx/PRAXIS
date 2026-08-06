import { expect, test } from '@playwright/test';
import { comoBearer, data, entrarComoAdmin, registrar } from '../../fixtures/api';
import { crearMundo } from '../../fixtures/mundo';

/**
 * # Lo que quedaba suelto del bloque 1
 *
 * Cinco rutas que el barrido de acceso no podía tocar y que se quedaron sin
 * cerrar: la ficha administrativa de un proyecto y las cuatro de
 * `/api/permissions`. `10-barrido-de-acceso` recorre las rutas **de proyecto**
 * con dos identidades corrientes, y estas no lo son — piden rol **global**, que
 * es otra capa (`docs/backend/permissions.md`).
 *
 * `06-administracion` ya fija que una cuenta corriente no entra en `/admin/*`, y
 * `11-jerarquia-admin` que un administrador solo actúa hacia abajo. Lo que falta,
 * y es lo que hay aquí, son las dos mitades de cada una de estas cinco: **que un
 * extraño no pase y que quien administra sí**.
 *
 * ⚠️ **El rol global es privado**, y es lo que hace que estas rutas importen más
 * de lo que parece. Ninguna pantalla las consume —`POST /permissions/check` no
 * la usa nadie, lo comprobé— pero abiertas bastaba con conocer un `userId`, que
 * es público en cuanto compartes un proyecto, para saber qué cuenta administra la
 * plataforma.
 */

test.describe.configure({ timeout: 120_000 });

test.describe('La ficha administrativa de un proyecto', () => {
  test('una cuenta corriente no la abre, ni siendo dueña del proyecto', async ({ request }) => {
    const mundo = await crearMundo(request);

    /**
     * El dueño del proyecto, denegado. No es un descuido: `/admin/projects/:id`
     * es una **proyección administrativa**, no un atajo al proyecto. El dueño
     * tiene su propia ruta —`GET /projects/:id`— y ahí sí entra. Lo que esta
     * enseña de más es el inventario de la plataforma, y eso no lo concede ser
     * dueño de nada.
     */
    const respuesta = await request.get(`/api/admin/projects/${mundo.proyecto.id}`, {
      headers: comoBearer(mundo.duenno.accessToken),
    });

    expect(respuesta.status(), 'Ser dueño no es administrar la plataforma').toBe(403);
  });

  test('quien administra sí, y trae el árbol y el dueño', async ({ request }) => {
    const mundo = await crearMundo(request);
    const admin = await entrarComoAdmin(request);

    const respuesta = await request.get(`/api/admin/projects/${mundo.proyecto.id}`, {
      headers: comoBearer(admin.accessToken),
    });
    expect(respuesta.status(), 'La otra mitad: cerrar de más deja el panel sin ficha').toBe(200);

    const ficha = await data<{
      id: string;
      owner: { id: string; email: string | null } | null;
      workspaces: { boards: { columns: unknown[] }[] }[];
    }>(respuesta);

    expect(ficha.id).toBe(mundo.proyecto.id);

    /* El dueño se cruza en el gateway contra credentials-service: es la primera
       pregunta al abrir la ficha para decidir si se suspende. */
    expect(ficha.owner?.id).toBe(mundo.duenno.userId);

    /* Y el árbol entero, que es lo que la distingue del inventario. */
    expect(ficha.workspaces[0]?.boards[0]?.columns.length).toBeGreaterThan(0);
  });

  test('un proyecto archivado sigue abriéndose desde el panel', async ({ request }) => {
    const mundo = await crearMundo(request);
    const admin = await entrarComoAdmin(request);
    const delAdmin = comoBearer(admin.accessToken);

    await request.patch(`/api/admin/projects/${mundo.proyecto.id}/status`, {
      headers: delAdmin,
      data: { status: 'DELETED', reason: 'Prueba de ficha archivada' },
    });

    /* `07-suspension` ya fija que un archivado responde 404 a todo el mundo. Esta
       es la excepción y tiene que existir: si el panel tampoco pudiera abrirlo,
       archivar sería irreversible y no habría desde dónde recuperarlo. */
    const respuesta = await request.get(`/api/admin/projects/${mundo.proyecto.id}`, {
      headers: delAdmin,
    });

    expect(respuesta.status(), 'Sin esto, archivar no tendría vuelta atrás').toBe(200);
  });
});

test.describe('Las rutas de roles globales', () => {
  test('una cuenta corriente no consulta si alguien es administrador', async ({ request }) => {
    const cualquiera = await registrar(request);
    const admin = await entrarComoAdmin(request);

    /**
     * `POST /permissions/check` es la puerta de atrás de `GET /permissions/user/:id`:
     * el objetivo viaja en el **cuerpo**, así que no se puede proteger comparándolo
     * con el parámetro de la ruta como hace `AccountOwnerGuard`. Por eso pide rol
     * de administrador y no otra cosa.
     */
    const respuesta = await request.post('/api/permissions/check', {
      headers: comoBearer(cualquiera.accessToken),
      data: { userId: admin.userId, roleName: 'SuperAdmin' },
    });

    expect(respuesta.status(), 'Saber quién administra la plataforma es privado').toBe(403);
  });

  test('ni sobre sí misma: no es una consulta de «lo mío»', async ({ request }) => {
    const cualquiera = await registrar(request);

    /* La distinción importa. `GET /permissions/user/:id` sí deja consultarse a uno
       mismo, porque el guard puede comparar el parámetro con el token. Aquí no hay
       parámetro que comparar, así que no hay forma de abrirlo solo para lo propio
       sin abrirlo para todo. */
    const respuesta = await request.post('/api/permissions/check', {
      headers: comoBearer(cualquiera.accessToken),
      data: { userId: cualquiera.userId, roleName: 'User' },
    });

    expect(respuesta.status()).toBe(403);
  });

  test('quien administra sí consulta, y responde por nombre exacto', async ({ request }) => {
    const admin = await entrarComoAdmin(request);
    const cuenta = await registrar(request);

    const respuesta = await request.post('/api/permissions/check', {
      headers: comoBearer(admin.accessToken),
      data: { userId: cuenta.userId, roleName: 'Admin' },
    });
    expect(respuesta.status()).toBe(200);

    const resultado = await data<{ hasRole: boolean }>(respuesta);
    expect(resultado.hasRole, 'Una cuenta recién registrada no es Admin').toBe(false);

    /**
     * ⚠️ Y compara el **nombre exacto**, no la jerarquía: el SuperAdmin de los
     * seeds responde `false` a «¿eres Admin?». Es correcto para una consulta de
     * estado y por eso mismo **no sirve para autorizar** — quien la use para
     * decidir un permiso se va a llevar un no de quien está por encima.
     */
    const sobreElJefe = await data<{ hasRole: boolean }>(
      await request.post('/api/permissions/check', {
        headers: comoBearer(admin.accessToken),
        data: { userId: admin.userId, roleName: 'Admin' },
      }),
    );
    expect(sobreElJefe.hasRole, 'Un SuperAdmin no «es» Admin: son nombres, no niveles').toBe(false);
  });

  test('una cuenta corriente no se reparte un rol a sí misma', async ({ request }) => {
    const cualquiera = await registrar(request);

    /* La escalada más directa que existe. Cae por `@RequireGlobalRole(Admin)`,
       antes de llegar a la comprobación de niveles. */
    const respuesta = await request.post('/api/permissions/assign', {
      headers: comoBearer(cualquiera.accessToken),
      data: { userId: cualquiera.userId, roleName: 'SuperAdmin' },
    });

    expect(respuesta.status()).toBe(403);
  });

  test('ni revoca el de nadie', async ({ request }) => {
    const cualquiera = await registrar(request);
    const admin = await entrarComoAdmin(request);

    /* El lado que se olvida: cerrar solo el alta deja la baja como vía para el
       mismo daño — dejar la plataforma sin quien la administre. */
    const respuesta = await request.delete('/api/permissions/revoke', {
      headers: comoBearer(cualquiera.accessToken),
      data: { userId: admin.userId, roleName: 'SuperAdmin' },
    });

    expect(respuesta.status()).toBe(403);
  });

  test('ni quien administra se concede su propio nivel', async ({ request }) => {
    const admin = await entrarComoAdmin(request);
    const cuenta = await registrar(request);

    /* Pasa el guard de rol global —es administrador— y cae en `canGrant`:
       conceder tu propio nivel es conceder el poder de echarte, y la regla es
       «solo hacia abajo». Es la comprobación que `11-jerarquia` fija por
       `PUT /admin/users/:id/role`; esta es la misma regla por la otra puerta. */
    const respuesta = await request.post('/api/permissions/assign', {
      headers: comoBearer(admin.accessToken),
      data: { userId: cuenta.userId, roleName: 'SuperAdmin' },
    });

    expect(respuesta.status(), 'Nadie reparte SuperAdmin, ni un SuperAdmin').toBe(403);
  });

  test('ni toca sus propios roles, aunque sea para quitárselos', async ({ request }) => {
    const admin = await entrarComoAdmin(request);

    const respuesta = await request.delete('/api/permissions/revoke', {
      headers: comoBearer(admin.accessToken),
      data: { userId: admin.userId, roleName: 'SuperAdmin' },
    });

    /* Dejarse fuera a uno mismo no tiene deshacer: haría falta otra cuenta de
       nivel igual o superior, y por diseño no existe ninguna. */
    expect(respuesta.status()).toBe(403);
  });

  test('el catálogo de roles sí lo lee cualquiera con sesión', async ({ request }) => {
    const cualquiera = await registrar(request);

    /**
     * La otra mitad, y la que evita cerrar de más. `GET /permissions` devuelve
     * **qué roles existen**, no quién los tiene: son tres nombres y sus
     * descripciones, los mismos que trae `GLOBAL_ROLE_SEED` en el código. Lo
     * privado es la asignación, no el catálogo.
     */
    const respuesta = await request.get('/api/permissions', {
      headers: comoBearer(cualquiera.accessToken),
    });
    expect(respuesta.status()).toBe(200);

    const roles = await data<{ name: string }[]>(respuesta);
    expect(roles.map((rol) => rol.name)).toEqual(
      expect.arrayContaining(['User', 'Admin', 'SuperAdmin']),
    );
  });
});

test.describe('El health check del gateway', () => {
  /**
   * ⚠️ **Cuelga de `/api`, no de `/`.** El inventario de endpoints lo listaba
   * como `GET /` porque se generó escaneando decoradores, y `@Controller()` con
   * `setGlobalPrefix('api')` sirve `/api`. Peor todavía: `AppModule` no
   * declaraba el controlador, así que la ruta **respondía 404 por las dos
   * rutas**. Se descubrió al escribir esta prueba, que es para lo que sirve
   * llamar a una ruta en vez de leerla.
   *
   * Nadie lo había notado porque `dev:cli` comprueba que el **puerto** acepte
   * conexiones, no que conteste: un 404 llega por un puerto abierto igual de
   * bien que un 200.
   */
  test('responde sin sesión', async ({ request }) => {
    const respuesta = await request.get('/api');

    expect(respuesta.status(), 'Quien orquesta un despliegue no tiene token').toBe(200);

    const estado = await data<{ status: string }>(respuesta);
    expect(estado.status).toBe('ok');
  });

  test('y no cuenta nada de dentro', async ({ request }) => {
    const cuerpo = await (await request.get('/api')).text();

    /* Es pública y sin sesión: versión, entorno, módulos montados o el estado de
       la base serían inventario gratis para cualquiera que la llame. Lo que hace
       falta saber desde fuera es si el proceso atiende, y eso es un 200. */
    expect(
      cuerpo.length,
      'Si el health check crece, es que ha empezado a contar algo',
    ).toBeLessThan(120);
    expect(cuerpo).not.toMatch(/version|secret|localhost|postgres|redis|password/i);
  });

  test('sigue habiendo 404 para lo que no existe', async ({ request }) => {
    /* La otra mitad: montar un controlador en la raíz podría haberse tragado
       cualquier ruta desconocida y devolver 200 a todo. */
    const respuesta = await request.get('/api/ruta-que-no-existe');
    expect(respuesta.status()).toBe(404);
  });
});
