import { expect, test } from '@playwright/test';
import {
  comoBearer,
  data,
  entrarComoAdmin,
  error,
  intentarLogin,
  registrar,
} from '../../fixtures/api';
import { crearMundo, crearTarea } from '../../fixtures/mundo';

/**
 * Los efectos de la administración: suspender un proyecto y suspender una cuenta.
 *
 * Hasta aquí se comprobó **quién puede pulsar el botón** (`06-administracion`).
 * Esto comprueba **qué pasa cuando se pulsa**, que es harina de otro costal: la
 * suspensión no es un campo en una tabla, es una regla que tiene que alcanzar a
 * las tareas, a las columnas, a los comentarios y a la sesión ya abierta de esa
 * persona.
 *
 * Son las cuatro cosas que había que verificar a mano después de integrar la
 * rama de administración. Automatizadas cuestan cuarenta segundos y ya no se
 * olvidan.
 */

/** Los seis pasos de estos recorridos cruzan varios servicios; van holgados. */
test.describe.configure({ timeout: 90_000 });

test.describe('Suspender un proyecto', () => {
  test('el dueño lo sigue viendo pero ya no puede escribir', async ({ request }) => {
    const mundo = await crearMundo(request);
    const admin = await entrarComoAdmin(request);
    const delDuenno = comoBearer(mundo.duenno.accessToken);

    const suspension = await request.patch(`/api/admin/projects/${mundo.proyecto.id}/status`, {
      headers: comoBearer(admin.accessToken),
      data: { status: 'SUSPENDED', reason: 'Prueba automática de suspensión' },
    });
    expect(suspension.status()).toBe(200);

    /* Leer sigue funcionando: suspender no es esconder. Quien tenía el proyecto
       tiene que poder entrar y entender qué ha pasado. */
    const lectura = await request.get(`/api/projects/${mundo.proyecto.id}`, {
      headers: delDuenno,
    });
    expect(lectura.status(), 'Un proyecto suspendido se sigue viendo entero').toBe(200);

    /**
     * ⚠️ **Ni siquiera el dueño escribe.** Es lo que distingue esta suspensión
     * de una retirada de permisos: no depende del rol, y el atajo de «si eres
     * dueño, pasa» del guard tiene que quedar por detrás de esta comprobación.
     */
    const escritura = await request.post(`/api/boards/${mundo.boardId}/tasks`, {
      headers: delDuenno,
      data: {
        columnId: mundo.primeraColumna.id,
        title: 'No debería crearse en un proyecto suspendido',
        status: mundo.primeraColumna.name,
      },
    });
    expect(escritura.status(), 'Un proyecto suspendido es de solo lectura').toBe(403);
  });

  test('el 403 dice que es una suspensión, no un permiso que falta', async ({ request }) => {
    const mundo = await crearMundo(request);
    const admin = await entrarComoAdmin(request);

    await request.patch(`/api/admin/projects/${mundo.proyecto.id}/status`, {
      headers: comoBearer(admin.accessToken),
      data: { status: 'SUSPENDED', reason: 'Prueba del código de error' },
    });

    const escritura = await request.post(`/api/boards/${mundo.boardId}/tasks`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: {
        columnId: mundo.primeraColumna.id,
        title: 'Rechazada',
        status: mundo.primeraColumna.name,
      },
    });

    /**
     * Distinguirlo importa y por eso hay un código propio: un `FORBIDDEN` normal
     * se arregla pidiéndole permiso a quien administra el proyecto; este no se
     * arregla —hay que esperar a que la plataforma lo reactive—. Si la interfaz
     * no puede separarlos, manda a la gente a pedir algo que nadie le puede dar.
     */
    const fallo = await error(escritura);
    expect(fallo.code, `Llegó «${fallo.code}» en vez de PROJECT_SUSPENDED`).toBe(
      'PROJECT_SUSPENDED',
    );
  });

  test('permissions/me se recorta y explica por qué', async ({ request }) => {
    const mundo = await crearMundo(request);
    const admin = await entrarComoAdmin(request);
    const motivo = 'Impago de la suscripción';

    await request.patch(`/api/admin/projects/${mundo.proyecto.id}/status`, {
      headers: comoBearer(admin.accessToken),
      data: { status: 'SUSPENDED', reason: motivo },
    });

    const respuesta = await request.get(`/api/projects/${mundo.proyecto.id}/permissions/me`, {
      headers: comoBearer(mundo.duenno.accessToken),
    });
    expect(respuesta.status()).toBe(200);

    /**
     * ⚠️ Los permisos vienen **anidados** en `permissions`, no sueltos en la
     * raíz: la respuesta es `{ isOwner, permissions, projectStatus,
     * suspendedReason }`. Leerlos del nivel de arriba devuelve `undefined`, que
     * es falsy — o sea, una comprobación de «no puede escribir» pasaría siempre,
     * también con el proyecto activo.
     */
    const cuerpo = await data<{
      isOwner: boolean;
      permissions: Record<string, boolean>;
      projectStatus: string;
      suspendedReason?: string;
    }>(respuesta);

    /* Los botones se apagan por la vía de siempre: la interfaz no tiene que
       mirar el estado para eso. */
    expect(cuerpo.permissions.canCreateTask, 'La escritura debe llegar apagada').toBe(false);
    expect(cuerpo.permissions.canManageMembers, 'Y la gestión también').toBe(false);

    /* Se conservan las dos de lectura: ver el proyecto y ver sus informes. */
    expect(cuerpo.permissions.canViewProject, 'La lectura se conserva').toBe(true);
    expect(cuerpo.permissions.canViewReports, 'Los informes también').toBe(true);

    /* `isOwner` sigue siendo cierto: la suspensión no le quita el proyecto a
       nadie, solo lo congela. */
    expect(cuerpo.isOwner).toBe(true);

    /* Y viene el motivo, que es lo que evita que parezca una retirada de rol:
       un mapa de permisos apagado sin explicación no se distingue de un castigo. */
    expect(cuerpo.projectStatus).toBe('SUSPENDED');
    expect(cuerpo.suspendedReason).toBe(motivo);
  });

  test('reactivar devuelve la escritura', async ({ request }) => {
    const mundo = await crearMundo(request);
    const admin = await entrarComoAdmin(request);
    const delAdmin = comoBearer(admin.accessToken);

    await request.patch(`/api/admin/projects/${mundo.proyecto.id}/status`, {
      headers: delAdmin,
      data: { status: 'SUSPENDED', reason: 'Suspensión temporal' },
    });

    const reactivacion = await request.patch(`/api/admin/projects/${mundo.proyecto.id}/status`, {
      headers: delAdmin,
      data: { status: 'ACTIVE' },
    });
    expect(reactivacion.status(), 'Reactivar no pide motivo').toBe(200);

    /* La mitad que de verdad importa: una suspensión que no se puede deshacer
       es un borrado con otro nombre. */
    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo, {
      titulo: 'Creada después de reactivar',
    });
    expect(tarea.id).toBeTruthy();
  });

  test('suspender sin motivo se rechaza', async ({ request }) => {
    const mundo = await crearMundo(request);
    const admin = await entrarComoAdmin(request);

    const respuesta = await request.patch(`/api/admin/projects/${mundo.proyecto.id}/status`, {
      headers: comoBearer(admin.accessToken),
      data: { status: 'SUSPENDED' },
    });

    /* El motivo no es burocracia: es lo que lee el dueño en el aviso. */
    expect(respuesta.status()).toBe(400);
  });

  test('un proyecto borrado responde 404 a todo el mundo', async ({ request }) => {
    const mundo = await crearMundo(request);
    const admin = await entrarComoAdmin(request);

    await request.patch(`/api/admin/projects/${mundo.proyecto.id}/status`, {
      headers: comoBearer(admin.accessToken),
      data: { status: 'DELETED', reason: 'Prueba de borrado administrativo' },
    });

    const lectura = await request.get(`/api/projects/${mundo.proyecto.id}`, {
      headers: comoBearer(mundo.duenno.accessToken),
    });
    expect(lectura.status(), 'Un DELETED no existe ni para su dueño').toBe(404);

    const listado = await request.get('/api/projects', {
      headers: comoBearer(mundo.duenno.accessToken),
    });
    const pagina = await data<{ items: { id: string }[] }>(listado);
    expect(pagina.items.map((p) => p.id)).not.toContain(mundo.proyecto.id);
  });
});

test.describe('Suspender una cuenta', () => {
  /**
   * 🔴 La parte que se olvida.
   *
   * Suspender solo impedía **entrar de nuevo** — justo lo único que esa persona
   * no necesita si ya tiene la sesión abierta. El `proxy.ts` de cada zona renueva
   * el access token en cada navegación mientras el refresh viva, así que seguía
   * dentro hasta siete días.
   *
   * Lo cierra `refresh()` de credentials-service, que vuelve a mirar `status`.
   */
  test('quien queda suspendido no puede renovar su sesión', async ({ request }) => {
    const victima = await registrar(request);
    const admin = await entrarComoAdmin(request);

    /* Antes de suspender, la renovación funciona: si no, la prueba de abajo
       daría verde por el motivo equivocado. */
    const antes = await request.post('/api/auth/refresh', {
      data: { refreshToken: victima.refreshToken },
    });
    expect(antes.status(), 'La sesión debería estar viva antes de suspender').toBe(200);

    const suspension = await request.patch(`/api/admin/users/${victima.userId}/status`, {
      headers: comoBearer(admin.accessToken),
      data: { status: 'SUSPENDED', reason: 'Prueba automática de suspensión de cuenta' },
    });
    expect(suspension.status()).toBe(200);

    const despues = await request.post('/api/auth/refresh', {
      data: { refreshToken: victima.refreshToken },
    });
    expect(
      despues.status(),
      'Una cuenta suspendida no puede estirar su sesión: si no, sigue dentro hasta 7 días',
    ).toBe(401);
  });

  test('y tampoco puede volver a entrar', async ({ request }) => {
    const victima = await registrar(request);
    const admin = await entrarComoAdmin(request);

    await request.patch(`/api/admin/users/${victima.userId}/status`, {
      headers: comoBearer(admin.accessToken),
      data: { status: 'SUSPENDED', reason: 'Prueba de login tras suspensión' },
    });

    const respuesta = await intentarLogin(request, {
      email: victima.email,
      password: victima.password,
    });
    expect(respuesta.status()).toBe(403);
  });

  test('un administrador no se suspende a sí mismo', async ({ request }) => {
    const admin = await entrarComoAdmin(request);

    const respuesta = await request.patch(`/api/admin/users/${admin.userId}/status`, {
      headers: comoBearer(admin.accessToken),
      data: { status: 'SUSPENDED', reason: 'No debería poder' },
    });

    /* Dejarse fuera a uno mismo no tiene deshacer: haría falta otro admin. */
    expect(respuesta.status()).toBe(403);
  });

  test('reactivar devuelve el acceso', async ({ request }) => {
    const victima = await registrar(request);
    const admin = await entrarComoAdmin(request);
    const delAdmin = comoBearer(admin.accessToken);

    await request.patch(`/api/admin/users/${victima.userId}/status`, {
      headers: delAdmin,
      data: { status: 'SUSPENDED', reason: 'Suspensión temporal' },
    });

    const reactivacion = await request.patch(`/api/admin/users/${victima.userId}/status`, {
      headers: delAdmin,
      data: { status: 'ACTIVE' },
    });
    expect(reactivacion.status()).toBe(200);

    const entrada = await intentarLogin(request, {
      email: victima.email,
      password: victima.password,
    });
    expect(entrada.status(), 'Reactivar tiene que devolver el acceso de verdad').toBe(200);
  });
});

test.describe('Registro de actividad', () => {
  /**
   * El registro es **solo-añadir** y es la única forma de saber quién suspendió
   * qué. Si dejara de escribirse, nada fallaría: simplemente no habría rastro, y
   * eso solo se descubre el día que hace falta.
   */
  test('una suspensión de proyecto queda anotada, con su motivo', async ({ request }) => {
    const mundo = await crearMundo(request);
    const admin = await entrarComoAdmin(request);
    const delAdmin = comoBearer(admin.accessToken);
    const motivo = `Prueba de registro ${Date.now().toString(36)}`;

    await request.patch(`/api/admin/projects/${mundo.proyecto.id}/status`, {
      headers: delAdmin,
      data: { status: 'SUSPENDED', reason: motivo },
    });

    const registro = await request.get('/api/admin/activity?page=1&limit=20', {
      headers: delAdmin,
    });
    expect(registro.status()).toBe(200);

    const pagina = await data<{
      items: { targetId?: string; reason?: string; actorId?: string }[];
    }>(registro);

    const entrada = pagina.items.find((i) => i.targetId === mundo.proyecto.id);
    expect(entrada, 'La suspensión debería aparecer en el registro').toBeTruthy();
    expect(entrada?.reason).toBe(motivo);
    expect(entrada?.actorId, 'Y con quién la hizo').toBe(admin.userId);
  });

  test('una suspensión de cuenta también', async ({ request }) => {
    const victima = await registrar(request);
    const admin = await entrarComoAdmin(request);
    const delAdmin = comoBearer(admin.accessToken);
    const motivo = `Cuenta, prueba ${Date.now().toString(36)}`;

    await request.patch(`/api/admin/users/${victima.userId}/status`, {
      headers: delAdmin,
      data: { status: 'SUSPENDED', reason: motivo },
    });

    const registro = await request.get('/api/admin/activity?page=1&limit=20', {
      headers: delAdmin,
    });
    const pagina = await data<{ items: { targetId?: string; reason?: string }[] }>(registro);

    const entrada = pagina.items.find((i) => i.targetId === victima.userId);
    expect(entrada, 'La suspensión de cuenta debería aparecer').toBeTruthy();
    expect(entrada?.reason).toBe(motivo);
  });
});
