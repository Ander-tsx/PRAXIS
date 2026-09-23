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
 * Documentos dentro de un espacio (`docs/PLAN-DOCUMENTOS.md`).
 *
 * Lo que se prueba es lo que no se ve en la API: que el «+» crea y abre, que
 * se escribe en Markdown y se lee con formato, y que guardar encima de una
 * versión que otro cambió **no pisa nada** (D4).
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

  test('crear, escribir, leer con formato, y no pisar a otro', async ({ page }) => {
    test.setTimeout(150_000);
    const api = await apiContext();
    const mundo = await crearMundo(api);
    const cabeceras = comoBearer(mundo.duenno.accessToken);

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?board=${mundo.boardId}`);

    // El «+» de documentos crea «Sin título» y lo abre en modo escribir.
    await page.getByRole('button', { name: 'Nuevo documento' }).click();
    const titulo = page.getByRole('textbox', { name: 'Título del documento' });
    await expect(titulo).toHaveValue('Sin título', { timeout: 20_000 });

    const nombre = nombreUnico('Acta');
    await titulo.fill(nombre);
    await page
      .getByRole('textbox', { name: 'Contenido del documento, en Markdown' })
      .fill('## Acuerdos\n\n- **Salir** el viernes');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText(/^Editado /)).toBeVisible({ timeout: 20_000 });

    // Leer: el Markdown sale con formato, no con la sintaxis.
    await page.getByRole('button', { name: 'Leer' }).click();
    const leido = page.getByRole('article', { name: `Documento ${nombre}` });
    await expect(leido.getByText('Acuerdos', { exact: true })).toBeVisible();
    await expect(leido.locator('strong', { hasText: 'Salir' })).toBeVisible();
    await expect(leido.getByText('## Acuerdos')).toHaveCount(0);

    // La pestaña existe y el servidor lo tiene.
    await expect(page.getByRole('tab', { name: nombre })).toBeVisible();
    const lista = await api.get(`/api/workspaces/${mundo.workspaceId}/documents`, {
      headers: cabeceras,
    });
    const docs = await data<{ id: string; title: string; updatedAt: string }[]>(lista);
    const doc = docs.find((d) => d.title === nombre);
    expect(doc, 'El documento está en el servidor').toBeTruthy();

    // D4: otra persona guarda por la API; guardar aquí encima da conflicto.
    const ajeno = await api.patch(`/api/workspaces/${mundo.workspaceId}/documents/${doc!.id}`, {
      headers: cabeceras,
      data: { content: 'Versión de otra persona', expectedUpdatedAt: doc!.updatedAt },
    });
    expect(ajeno.status()).toBe(200);

    await page.getByRole('button', { name: 'Escribir' }).click();
    await page
      .getByRole('textbox', { name: 'Contenido del documento, en Markdown' })
      .fill('Mi versión, que no debe pisar la otra');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText(/Alguien guardó este documento/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: 'Copiar lo mío' })).toBeVisible();

    const tras = await api.get(`/api/workspaces/${mundo.workspaceId}/documents/${doc!.id}`, {
      headers: cabeceras,
    });
    expect((await data<{ content: string }>(tras)).content).toBe('Versión de otra persona');
  });
});
