import { type Page, expect, test } from '@playwright/test';
import { crearCuentaYEntrar } from '../../fixtures/ui';

/**
 * Documentos en móvil (M5 de `docs/PLAN-MOVIL.md`): el editor a lo ancho del
 * teléfono y la barra de formato pegada al teclado.
 */

test.describe.configure({ mode: 'serial' });

let pagina: Page;
let url: string;

async function api<T>(page: Page, ruta: string, datos: unknown): Promise<T> {
  const respuesta = await page.request.post(`/api/gateway${ruta}`, { data: datos });
  const cuerpo = await respuesta.json();
  if (!cuerpo?.data) throw new Error(`${ruta}: ${respuesta.status()} ${JSON.stringify(cuerpo)}`);
  return cuerpo.data as T;
}

test.beforeAll(async ({ browser }, info) => {
  const contexto = await browser.newContext(info.project.use);
  pagina = await contexto.newPage();
  await crearCuentaYEntrar(pagina);
  const proyecto = await api<{ id: string; slug: string }>(pagina, '/projects', {
    name: 'Documentos móvil',
  });
  const espacio = await api<{ id: string }>(pagina, `/projects/${proyecto.id}/workspaces`, {
    name: 'Wiki',
    kind: 'DOCUMENTS',
  });
  const doc = await api<{ id: string }>(pagina, `/workspaces/${espacio.id}/documents`, {
    title: 'Notas de campo',
  });
  url = `/projects/${proyecto.slug}?tab=espacios&ws=${espacio.id}&doc=${doc.id}`;
});

test.afterAll(async () => {
  await pagina?.context().close();
});

test('el editor cabe en el teléfono, sin desbordar', async () => {
  await pagina.goto(url);
  const cuerpo = pagina.locator('.documento-praxis').filter({ visible: true }).first();
  await expect(cuerpo).toBeVisible({ timeout: 20_000 });
  const desborda = await pagina.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(desborda).toBe(false);
});

test('con el editor enfocado sale la barra de formato, y aplica negrita', async () => {
  await pagina.goto(url);
  const cuerpo = pagina.locator('.documento-praxis').filter({ visible: true }).first();
  await expect(cuerpo).toBeVisible({ timeout: 20_000 });
  const barra = pagina.getByRole('toolbar', { name: 'Formato' });
  await expect(barra).toHaveCount(0);

  await cuerpo.click();
  await expect(barra).toBeVisible();
  /* Con el teclado abierto, la barra de pestañas no asoma. */
  await expect(pagina.getByRole('navigation', { name: 'Secciones', exact: true })).toBeHidden();

  await barra.getByRole('button', { name: 'Negrita' }).click();
  await pagina.keyboard.type('Muy importante');
  await expect(cuerpo.locator('strong', { hasText: 'Muy importante' })).toBeVisible();
  /* Pulsar la barra no le quitó el foco al editor. */
  await expect(barra.getByRole('button', { name: 'Negrita' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
