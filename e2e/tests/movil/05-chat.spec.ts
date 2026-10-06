import { type Page, expect, test } from '@playwright/test';
import { crearCuentaYEntrar } from '../../fixtures/ui';

/**
 * Chat y PRAX en móvil (M4 de `docs/PLAN-MOVIL.md`): la conversación a
 * pantalla completa, sin barra de pestañas, con su «atrás» del tamaño de un
 * dedo y las acciones de un mensaje por pulsación larga.
 */

test.describe.configure({ mode: 'serial' });

let pagina: Page;
let projectId: string;

test.beforeAll(async ({ browser }, info) => {
  const contexto = await browser.newContext(info.project.use);
  pagina = await contexto.newPage();
  await crearCuentaYEntrar(pagina);
  const respuesta = await pagina.request.post('/api/gateway/projects', {
    data: { name: 'Chat móvil' },
  });
  projectId = (await respuesta.json()).data.id;
});

test.afterAll(async () => {
  await pagina?.context().close();
});

test('una conversación ocupa la pantalla y su «atrás» se acierta con el dedo', async () => {
  await pagina.goto(`/chat/proyecto/${projectId}`);
  await expect(pagina.getByRole('navigation', { name: 'Secciones' })).toBeHidden();
  const atras = pagina.getByRole('link', { name: 'Conversaciones' }).filter({ visible: true });
  await expect(atras).toBeVisible();
  const caja = await atras.boundingBox();
  expect(caja?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(
    pagina.getByPlaceholder('Escribe un mensaje…').filter({ visible: true }).first(),
  ).toBeInViewport();
});

test('se escribe, se envía, y la pulsación larga abre las acciones', async () => {
  await pagina.goto(`/chat/proyecto/${projectId}`);
  const compositor = pagina
    .getByPlaceholder('Escribe un mensaje…')
    .filter({ visible: true })
    .first();
  await compositor.fill('Hola desde el teléfono');
  await compositor.press('Enter');
  const mensaje = pagina.getByText('Hola desde el teléfono').filter({ visible: true }).first();
  await expect(mensaje).toBeVisible({ timeout: 15_000 });
  /* Al enviar, el teclado sigue abierto: la barra de abajo no debe asomar. */
  await expect(pagina.getByRole('navigation', { name: 'Secciones' })).toBeHidden();

  await mensaje.evaluate((el) => {
    const caja = el.getBoundingClientRect();
    el.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerType: 'touch',
        pointerId: 9,
        isPrimary: true,
        button: 0,
        clientX: caja.left + 5,
        clientY: caja.top + 5,
      }),
    );
  });
  await expect(
    pagina
      .getByRole('button', { name: /^Reaccionar con/ })
      .filter({ visible: true })
      .first(),
  ).toBeVisible({ timeout: 5_000 });
});

test('el «atrás» de la conversación lleva a la lista, con la barra de vuelta', async () => {
  await pagina.goto(`/chat/proyecto/${projectId}`);
  await pagina.getByRole('link', { name: 'Conversaciones' }).filter({ visible: true }).click();
  await expect(pagina).toHaveURL(/\/chat\?lista=1/);
  await expect(pagina.getByRole('navigation', { name: 'Secciones' })).toBeVisible();
});

test('PRAX se abre con su compositor a la vista', async () => {
  await pagina.goto('/assistant');
  await expect(pagina.getByPlaceholder(/Pregúntale a PRAX/)).toBeInViewport();
  await expect(pagina.getByRole('navigation', { name: 'Secciones' })).toBeVisible();
});
