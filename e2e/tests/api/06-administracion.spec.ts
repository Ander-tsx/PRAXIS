import { expect, test } from '@playwright/test';
import { comoBearer, data, entrarComoAdmin, registrar } from '../../fixtures/api';
import { crearMundo } from '../../fixtures/mundo';

/**
 * El panel de administración: `/api/admin/*`.
 *
 * Es la superficie **más sensible de la plataforma**. Desde aquí se suspenden
 * cuentas, se cambian roles globales y se suspende o borra un proyecto ajeno —
 * cosas que ningún permiso de proyecto concede.
 *
 * Toda la sección cuelga de `@RequireGlobalRole(Admin)` + `GlobalRoleGuard`, y
 * eso es exactamente lo que se fija aquí: **una cuenta corriente no toca nada**.
 * Crear una cuenta corriente cuesta una petición (`POST /auth/register`), así
 * que la distancia entre «cualquiera» y «administrador» es el guard y nada más.
 */

/** Las cuatro rutas de la sección, con el método que de verdad usan. */
const RUTAS_DE_ADMIN = [
  { nombre: 'listado de cuentas', metodo: 'GET', ruta: '/api/admin/users' },
  { nombre: 'listado de proyectos', metodo: 'GET', ruta: '/api/admin/projects' },
  { nombre: 'registro de actividad', metodo: 'GET', ruta: '/api/admin/activity' },
] as const;

test.describe('Puerta del panel de administración', () => {
  for (const caso of RUTAS_DE_ADMIN) {
    test(`una cuenta corriente no lee el ${caso.nombre}`, async ({ request }) => {
      const cualquiera = await registrar(request);

      const respuesta = await request.get(caso.ruta, {
        headers: comoBearer(cualquiera.accessToken),
      });

      expect(respuesta.status(), `${caso.ruta} debería exigir rol global Admin`).toBe(403);
    });
  }

  test('sin sesión, la administración responde 401', async ({ request }) => {
    const respuesta = await request.get('/api/admin/users');
    expect(respuesta.status()).toBe(401);
  });

  /**
   * La escritura importa más que la lectura: suspender una cuenta deja a alguien
   * fuera de la plataforma, y `refresh()` de credentials-service lo echa en la
   * siguiente renovación aunque tuviera la sesión abierta.
   */
  test('una cuenta corriente no puede suspender a nadie, ni a sí misma', async ({ request }) => {
    const cualquiera = await registrar(request);

    const respuesta = await request.patch(`/api/admin/users/${cualquiera.userId}/status`, {
      headers: comoBearer(cualquiera.accessToken),
      data: { status: 'SUSPENDED' },
    });

    expect(respuesta.status(), 'Suspender es cosa del rol global Admin').toBe(403);
  });

  test('una cuenta corriente no puede suspender un proyecto ajeno', async ({ request }) => {
    const mundo = await crearMundo(request);
    const cualquiera = await registrar(request);

    const respuesta = await request.patch(`/api/admin/projects/${mundo.proyecto.id}/status`, {
      headers: comoBearer(cualquiera.accessToken),
      data: { status: 'SUSPENDED', reason: 'No debería poder' },
    });
    expect(respuesta.status()).toBe(403);

    /* Y el proyecto sigue vivo y editable para su dueño: un 403 que hubiera
       aplicado el cambio igualmente sería peor que un 200. */
    const comprobacion = await request.get(`/api/projects/${mundo.proyecto.id}`, {
      headers: comoBearer(mundo.duenno.accessToken),
    });
    expect(comprobacion.status()).toBe(200);
    expect((await data<{ status?: string }>(comprobacion)).status ?? 'ACTIVE').toBe('ACTIVE');
  });

  test('ni el dueño de un proyecto entra por ser dueño', async ({ request }) => {
    const mundo = await crearMundo(request);

    /* El rol de proyecto y el rol global son **dos capas distintas**. Ser
       «Administrador» de tu propio proyecto no da nada aquí, y confundirlas es
       el error fácil de cometer al leer la palabra «administrador» dos veces. */
    const respuesta = await request.get('/api/admin/projects', {
      headers: comoBearer(mundo.duenno.accessToken),
    });

    expect(respuesta.status()).toBe(403);
  });
});

test.describe('Con rol global Admin', () => {
  /**
   * ⚠️ El margen de tiempo es la red por si alguien reordena los archivos:
   * `entrarComoAdmin` reintenta cuando se topa con el límite de intentos, y esa
   * espera no cabe en el timeout normal. En el camino previsto no se usa —
   * `09-seguridad`, que es quien gasta el presupuesto, va el último.
   */
  test.setTimeout(90_000);

  test('el administrador de los seeds sí entra', async ({ request }) => {
    const admin = await entrarComoAdmin(request);

    for (const caso of RUTAS_DE_ADMIN) {
      const respuesta = await request.get(caso.ruta, {
        headers: comoBearer(admin.accessToken),
      });
      expect(respuesta.status(), `El admin debería leer el ${caso.nombre}`).toBe(200);
    }
  });

  /**
   * La otra mitad de cada prueba de denegación: sin esto, «denegar siempre»
   * daría verde en todas las de arriba y habríamos fijado una puerta tapiada
   * en lugar de una puerta con llave.
   */
  test('el listado de cuentas trae datos y no una lista vacía', async ({ request }) => {
    const admin = await entrarComoAdmin(request);

    const respuesta = await request.get('/api/admin/users?page=1&limit=5', {
      headers: comoBearer(admin.accessToken),
    });
    expect(respuesta.status()).toBe(200);

    const pagina = await data<{ items: unknown[]; total: number }>(respuesta);
    expect(Array.isArray(pagina.items)).toBe(true);
    expect(pagina.total, 'Al menos las tres cuentas de los seeds').toBeGreaterThan(0);
  });
});
