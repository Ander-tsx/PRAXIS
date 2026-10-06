import { type Page, expect, test } from '@playwright/test';
import { crearCuentaYEntrar } from '../../fixtures/ui';

/**
 * Avisos, cuenta y ajustes en móvil (M6 de `docs/PLAN-MOVIL.md`).
 */

test.describe.configure({ mode: 'serial' });

let pagina: Page;

const desborda = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

test.beforeAll(async ({ browser }, info) => {
  const contexto = await browser.newContext(info.project.use);
  pagina = await contexto.newPage();
  await crearCuentaYEntrar(pagina);
});

test.afterAll(async () => {
  await pagina?.context().close();
});

test('desde «Tú» se llega a los ajustes de la organización', async () => {
  await pagina.goto('/projects');
  await pagina
    .getByRole('navigation', { name: 'Secciones', exact: true })
    .getByRole('button', { name: 'Tú' })
    .click();
  const hoja = pagina.getByRole('dialog', { name: 'Tú' });
  await expect(hoja).toBeVisible();
  await hoja.getByRole('link', { name: 'Equipo' }).click();
  await expect(pagina).toHaveURL(/\/main\/team/);
  await expect(hoja).toHaveCount(0);
});

test('Equipo no se sale de la pantalla', async () => {
  await pagina.goto('/main/team');
  await expect(pagina.getByRole('heading', { name: /Equipo/ }).first()).toBeVisible();
  expect(await desborda(pagina)).toBe(false);
});

test('en Facturación, la columna de qué se compara se queda fija', async () => {
  await pagina.goto('/main/billing');
  const primera = pagina.locator('tbody th[scope="row"]').first();
  await expect(primera).toBeVisible();
  const antes = await primera.boundingBox();
  await primera.evaluate((el) => {
    const contenedor = el.closest('.overflow-x-auto') as HTMLElement | null;
    if (contenedor) contenedor.scrollLeft = 300;
  });
  const despues = await primera.boundingBox();
  expect(Math.round(despues?.x ?? -1)).toBe(Math.round(antes?.x ?? -2));
  expect(await desborda(pagina)).toBe(false);
});

test('Integraciones no se sale de la pantalla', async () => {
  await pagina.goto('/main/integrations');
  expect(await desborda(pagina)).toBe(false);
});
