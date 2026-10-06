import { expect, test } from '@playwright/test';
import { NOMBRE_LARGO, recibirAvisoConNombreLargo } from '../../fixtures/avisos-largos';

/**
 * Un aviso que cita un nombre larguísimo no puede convertirse en un párrafo
 * que tape media pantalla: el nombre se recorta en la tarjeta y el entero
 * queda para la bandeja (`acortarNombres` en `LiveNotices`).
 */
test('un nombre largo se recorta en la tarjeta del aviso', async ({ page }) => {
  const { tarjeta, texto } = await recibirAvisoConNombreLargo(page);
  await expect(texto).toContainText('…»');
  await expect(texto).not.toContainText(NOMBRE_LARGO);
  const caja = await tarjeta.boundingBox();
  const ancho = page.viewportSize()?.width ?? 0;
  expect(caja && caja.x >= 0 && caja.x + caja.width <= ancho).toBe(true);
});
