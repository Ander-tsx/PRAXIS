import { expect, test } from '@playwright/test';
import { crearCuentaYEntrar } from '../../fixtures/ui';

/**
 * La base del móvil (M0 de `docs/PLAN-MOVIL.md`): lo que tiene que ser verdad
 * en cualquier pantalla antes de rediseñar ninguna.
 */

test('el viewport deja dibujar bajo el notch y encoge con el teclado', async ({ page }) => {
  await page.goto('/auth/login');
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).toContain('viewport-fit=cover');
  expect(viewport).toContain('interactive-widget=resizes-content');
});

test('ninguna pantalla se desborda en horizontal', async ({ page }) => {
  /* Un desbordamiento lateral en un teléfono es la página entera bailando al
     desplazarse con el dedo: lo primero que delata una web encogida. */
  const desborda = () =>
    page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

  await page.goto('/auth/login');
  expect(await desborda(), '/auth/login').toBe(false);

  await crearCuentaYEntrar(page);
  for (const ruta of ['/projects', '/chat', '/main/team']) {
    await page.goto(ruta);
    await page.waitForLoadState('networkidle');
    expect(await desborda(), ruta).toBe(false);
  }
});
