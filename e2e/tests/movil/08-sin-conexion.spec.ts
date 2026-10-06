import { type Page, expect, test } from '@playwright/test';
import { crearCuentaYEntrar } from '../../fixtures/ui';

/**
 * Lectura sin conexión (M7 de `docs/PLAN-MOVIL.md`): lo ya visitado se lee sin
 * red, solo por quien lo visitó, y se borra al cerrar sesión (D5, I2).
 */

async function conServiceWorker(page: Page) {
  await page.waitForFunction(async () => {
    const registro = await navigator.serviceWorker.getRegistration();
    return registro?.active?.state === 'activated';
  });
  for (let intento = 0; intento < 2; intento++) {
    await page.reload();
    const controlada = await page
      .waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (controlada) return;
  }
  throw new Error('El service worker no tomó el mando de la página');
}

async function crearProyecto(page: Page, nombre: string) {
  const respuesta = await page.request.post('/api/gateway/projects', { data: { name: nombre } });
  return (await respuesta.json()).data as { id: string; slug: string };
}

/** Las cachés por persona que hay ahora mismo. */
const cachesDePersona = (page: Page) =>
  page.evaluate(async () => (await caches.keys()).filter((n) => n.startsWith('praxis-datos-')));

test('lo visitado se lee sin red, con la franja que lo dice', async ({ page, context }) => {
  await crearCuentaYEntrar(page);
  await conServiceWorker(page);
  const proyecto = await crearProyecto(page, 'Leído sin red');
  await page.goto(`/projects/${proyecto.slug}`);
  await expect(page.getByRole('heading', { name: 'Leído sin red' })).toBeVisible();
  /* Que la copia esté escrita antes de cortar la red. */
  await expect.poll(async () => (await cachesDePersona(page)).length).toBe(1);

  await context.setOffline(true);
  await page.goto(`/projects/${proyecto.slug}`).catch(() => undefined);
  await expect(page.getByRole('heading', { name: 'Leído sin red' })).toBeVisible();
  await expect(page.getByText(/^Sin conexión · /)).toBeVisible();

  /* Lo no visitado no tiene copia: «Sin conexión». */
  await page.goto('/main/integrations').catch(() => undefined);
  await expect(page.getByRole('heading', { name: 'Sin conexión' })).toBeVisible();
  await context.setOffline(false);
});

test('cerrar sesión borra las copias, y otra cuenta no ve nada de la primera (I2)', async ({
  page,
  context,
}) => {
  await crearCuentaYEntrar(page);
  await conServiceWorker(page);
  const proyecto = await crearProyecto(page, 'Privado de la primera');
  await page.goto(`/projects/${proyecto.slug}`);
  await expect(page.getByRole('heading', { name: 'Privado de la primera' })).toBeVisible();
  await expect.poll(async () => (await cachesDePersona(page)).length).toBe(1);

  /* Cerrar sesión desde «Tú». */
  await page
    .getByRole('navigation', { name: 'Secciones', exact: true })
    .getByRole('link', { name: 'Tú' })
    .click();
  await page.waitForURL(/\/main\/me$/);
  await page.getByRole('button', { name: 'Cerrar sesión' }).filter({ visible: true }).click();
  /* Cerrar sesión lleva a la portada: se espera a llegar, no solo a salir de
     donde se estaba (desde «Tú» ya no se está en `/projects`). */
  await page.waitForURL((url) => url.pathname === '/');
  expect(await cachesDePersona(page)).toEqual([]);

  /* Entra otra persona en el mismo navegador, y sin red pide la pantalla de
     la primera: no hay copia que servirle. */
  await crearCuentaYEntrar(page);
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.goto(`/projects/${proyecto.slug}`).catch(() => undefined);
  await expect(page.getByRole('heading', { name: 'Privado de la primera' })).toHaveCount(0);
  await context.setOffline(false);
});
