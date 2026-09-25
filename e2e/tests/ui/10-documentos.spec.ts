import {
  type APIRequestContext,
  request as contextoDePeticion,
  expect,
  test,
} from '@playwright/test';
import { comoBearer, data, nombreUnico } from '../../fixtures/api';
import { crearMundo } from '../../fixtures/mundo';
import { entrarConCuenta } from '../../fixtures/ui';

/**
 * Documentos, etapa 2 (`docs/PLAN-DOCUMENTOS.md`): el editor en bloques en
 * tiempo real, su copia en Markdown y compartir por enlace.
 *
 * Necesita `collab-service` levantado (puerto 3010): el editor no escribe por
 * REST, escribe por el tiempo real (E4).
 */

async function apiContext(): Promise<APIRequestContext> {
  return contextoDePeticion.newContext({
    baseURL: process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000',
  });
}

test.describe('Documentos de un espacio', () => {
  test.beforeAll(async ({ request }) => {
    await request.get('/projects/calentar-turbopack', { timeout: 60_000 }).catch(() => {});
  });

  test('se escribe en bloques, se ve en vivo, se guarda en Markdown y se comparte', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    const api = await apiContext();
    const mundo = await crearMundo(api);
    const cabeceras = comoBearer(mundo.duenno.accessToken);

    // D7: un espacio de documentos no admite tableros.
    const espacio = await data<{ id: string }>(
      await api.post(`/api/projects/${mundo.proyecto.id}/workspaces`, {
        headers: cabeceras,
        data: { name: nombreUnico('Wiki'), kind: 'DOCUMENTS' },
      }),
    );
    const tablero = await api.post(`/api/workspaces/${espacio.id}/boards`, {
      headers: cabeceras,
      data: { name: 'No cabe aquí' },
    });
    expect(tablero.status()).toBe(400);

    const titulo = nombreUnico('Acta');
    const doc = await data<{ id: string }>(
      await api.post(`/api/workspaces/${espacio.id}/documents`, {
        headers: cabeceras,
        data: { title: titulo },
      }),
    );

    // E4: el contenido ya no se escribe por REST.
    const porRest = await api.patch(`/api/workspaces/${espacio.id}/documents/${doc.id}`, {
      headers: cabeceras,
      data: { title: titulo, content: 'no' },
    });
    expect(porRest.status(), 'PATCH con contenido').toBe(400);

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=espacios&ws=${espacio.id}&doc=${doc.id}`);
    const cuerpo = page.locator('.documento-praxis');
    await expect(cuerpo).toBeVisible({ timeout: 30_000 });

    // E1: atajos de Markdown al teclear y el menú «/».
    await cuerpo.click();
    await page.keyboard.type('## Acuerdos');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/tare');
    await expect(page.getByRole('button', { name: /Lista de tareas/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await page.keyboard.type('Salir el viernes');
    await expect(cuerpo.locator('h2', { hasText: 'Acuerdos' })).toBeVisible();
    await expect(cuerpo.locator('ul[data-type="taskList"]')).toContainText('Salir el viernes');

    // E3: otra sesión del mismo documento lo ve sin recargar.
    const otra = await browser.newPage();
    await entrarConCuenta(otra, mundo.duenno.email);
    await otra.goto(`/projects/${mundo.proyecto.id}?tab=espacios&ws=${espacio.id}&doc=${doc.id}`);
    await expect(otra.locator('.documento-praxis')).toContainText('Salir el viernes', {
      timeout: 30_000,
    });
    await page.keyboard.press('Enter');
    await page.keyboard.type('Llevar la demo');
    await expect(otra.locator('.documento-praxis')).toContainText('Llevar la demo', {
      timeout: 15_000,
    });

    // E2: el servidor guarda la copia en Markdown (con calma: 2 s sin cambios).
    await expect
      .poll(
        async () =>
          (
            await data<{ content: string }>(
              await api.get(`/api/documents/${doc.id}`, { headers: cabeceras }),
            )
          ).content,
        { timeout: 30_000 },
      )
      .toContain('- [ ] Llevar la demo');

    // E8: por enlace de lectura, sin cuenta, se lee y no se escribe.
    const compartido = await data<{ link: string }>(
      await api.patch(`/api/documents/${doc.id}/share`, {
        headers: cabeceras,
        data: { linkAccess: 'READ' },
      }),
    );
    const anonimo = await (await browser.newContext()).newPage();
    await anonimo.goto(compartido.link.replace(/^https?:\/\/[^/]+/, ''));
    await expect(anonimo.locator('.documento-praxis')).toContainText('Salir el viernes', {
      timeout: 30_000,
    });
    await expect(anonimo.getByText('Solo lectura')).toBeVisible();
    await expect(anonimo.locator('.documento-praxis')).toHaveAttribute('contenteditable', 'false');

    // Sin el token del enlace, no se entra sin cuenta.
    const sinToken = await api.get(`/api/documents/${doc.id}`);
    expect(sinToken.status()).toBe(401);
  });
});
