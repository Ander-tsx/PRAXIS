import {
  type APIRequestContext,
  request as contextoDePeticion,
  expect,
  test,
} from '@playwright/test';
import { comoBearer, entrarComoAdmin, nombreUnico, registrar } from '../../fixtures/api';
import { crearMundo, darDeAlta } from '../../fixtures/mundo';
import { entrarConCuenta } from '../../fixtures/ui';

/**
 * El apartado Reglas de un proyecto (Bloque 3 del plan de Reglas).
 *
 * ## Por qué esto y no solo la prueba de API
 *
 * `api/15-automatizaciones-academicas.spec.ts` ya prueba el contrato: que las
 * rutas validan, que la revisión no duplica avisos. Lo que no prueba es que la
 * **pantalla** siga pintándose — un `ProjectRules` que rompiera la frontera
 * servidor/cliente, un `describeRule` que lanzara con una regla real, o el
 * alias de la pestaña vieja mal resuelto no los detecta ningún tipo ni ningún
 * test unitario: solo pedir la página de verdad.
 *
 * Cada caso monta su propio mundo por API y solo usa el navegador para la
 * parte que hay que ver — el mismo patrón que `05-equipo` y `06-chat-zona`.
 */

async function apiContext(): Promise<APIRequestContext> {
  return contextoDePeticion.newContext({
    baseURL: process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000',
  });
}

test.describe('Reglas del proyecto', () => {
  /**
   * ⚠️ **Calienta la ruta `/projects/[id]` antes de medir nada.**
   *
   * En `next dev` la primera visita a una ruta la compila sobre la marcha —
   * decenas de segundos en una máquina cargada—, y el proxy del shell entre
   * `web-shell` y `projects-front` corta la conexión antes de que termine.
   * Sin esto, el primer test de la tanda paga esa compilación entera y puede
   * agotar su propio timeout por algo que no tiene nada que ver con Reglas.
   * El resultado se descarta a propósito: solo importa que Turbopack haya
   * terminado, no si esta petición en concreto tuvo éxito.
   */
  test.beforeAll(async ({ request }) => {
    await request.get('/projects/calentar-turbopack', { timeout: 60_000 }).catch(() => {});
  });


  test('la pestaña se llama Reglas y se llega a ella desde la barra de secciones', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}`);

    await page
      .getByRole('navigation', { name: 'Secciones del proyecto' })
      .getByRole('link', { name: 'Reglas' })
      .click();

    await expect(page.getByRole('heading', { name: 'Reglas académicas' })).toBeVisible();
  });

  test('un enlace viejo con ?tab=automatizaciones sigue aterrizando en Reglas', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=automatizaciones`);

    await expect(page.getByRole('heading', { name: 'Reglas académicas' })).toBeVisible();
  });

  test('sin reglas se ve el estado vacío, no solo «no hay nada»', async ({ page }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await expect(page.getByText('Aún no hay reglas.', { exact: false })).toBeVisible();
  });

  test('con una regla creada, se ve su nombre y el resumen de su definición', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    const nombreRegla = nombreUnico('Avisar vencimiento').slice(0, 120);
    await page.getByLabel('Nombre', { exact: true }).fill(nombreRegla);
    await page.getByRole('button', { name: 'Crear regla' }).click();

    await expect(page.getByText(nombreRegla)).toBeVisible();
    /* `describeRule` describe el trigger por defecto del formulario
       (`TASK_DUE_SOON`) en una frase legible, no solo el identificador técnico. */
    await expect(page.getByText(/Cuando tarea próxima a vencer/)).toBeVisible();
  });

  test('sin canManageAutomations se ve el mensaje de permiso', async ({ page }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    const invitado = await registrar(api);
    await darDeAlta(api, mundo, invitado, { canViewProject: true });
    await api.dispose();

    await entrarConCuenta(page, invitado.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await expect(
      page.getByText('No tienes permiso para administrar automatizaciones en este proyecto.'),
    ).toBeVisible();
  });

  test('con el proyecto suspendido se ve el mensaje de suspensión y no el de permiso', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    const admin = await entrarComoAdmin(api);

    const suspension = await api.patch(`/api/admin/projects/${mundo.proyecto.id}/status`, {
      headers: comoBearer(admin.accessToken),
      data: { status: 'SUSPENDED', reason: 'Prueba automática de Reglas' },
    });
    expect(suspension.status(), 'Suspender el proyecto').toBe(200);
    await api.dispose();

    /* El dueño tiene canManageAutomations en circunstancias normales — la
       suspensión es justo lo que se lo recorta, y es la causa real que D8
       distingue de una falta de permiso corriente. */
    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await expect(
      page.getByText(
        'Las reglas de este proyecto no se pueden ver ni administrar mientras esté suspendido.',
      ),
    ).toBeVisible();
    await expect(
      page.getByText('No tienes permiso para administrar automatizaciones en este proyecto.'),
    ).not.toBeVisible();
  });
});
