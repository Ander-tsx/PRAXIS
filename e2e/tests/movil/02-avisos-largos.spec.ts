import { expect, test } from '@playwright/test';
import { NOMBRE_LARGO, recibirAvisoConNombreLargo } from '../../fixtures/avisos-largos';

/**
 * En un teléfono la tarjeta del aviso cabe en la pantalla —era de 380 px fijos
 * y en un Android de 360 se salía— y el nombre largo va recortado.
 */
test('el aviso cabe en la pantalla y recorta el nombre', async ({ page }) => {
  const { tarjeta, texto } = await recibirAvisoConNombreLargo(page);
  await expect(texto).toContainText('…»');
  await expect(texto).not.toContainText(NOMBRE_LARGO);
  const caja = await tarjeta.boundingBox();
  const ancho = page.viewportSize()?.width ?? 0;
  expect(caja, 'la tarjeta tiene caja').not.toBeNull();
  expect(caja!.x).toBeGreaterThanOrEqual(0);
  expect(caja!.x + caja!.width).toBeLessThanOrEqual(ancho);
});
