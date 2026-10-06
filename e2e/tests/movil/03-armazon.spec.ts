import { type Page, expect, test } from '@playwright/test';
import { crearCuentaYEntrar } from '../../fixtures/ui';

/**
 * El armazón de app en móvil (M2 de `docs/PLAN-MOVIL.md`): la barra de abajo,
 * las hojas de Avisos y Tú, y los gestos.
 */

test.describe.configure({ mode: 'serial' });

let pagina: Page;
let slug: string;
let projectId: string;

const barra = () => pagina.getByRole('navigation', { name: 'Secciones' });

test.beforeAll(async ({ browser }, info) => {
  const contexto = await browser.newContext(info.project.use);
  pagina = await contexto.newPage();
  await crearCuentaYEntrar(pagina);
  const respuesta = await pagina.request.post('/api/gateway/projects', {
    data: { name: 'Armazón móvil' },
  });
  const proyecto = (await respuesta.json()).data;
  slug = proyecto.slug;
  projectId = proyecto.id;
});

test.afterAll(async () => {
  await pagina?.context().close();
});

/** Un deslizamiento con el dedo, con `TouchEvent` de verdad sobre el documento. */
async function deslizar(page: Page, desde: [number, number], hasta: [number, number]) {
  await page.evaluate(
    ([x0, y0, x1, y1]) => {
      const objetivo = document.elementFromPoint(x0, y0) ?? document.body;
      const toque = (x: number, y: number) =>
        new Touch({ identifier: 1, target: objetivo, clientX: x, clientY: y });
      const lanzar = (tipo: string, x: number, y: number, fin = false) =>
        objetivo.dispatchEvent(
          new TouchEvent(tipo, {
            bubbles: true,
            cancelable: true,
            touches: fin ? [] : [toque(x, y)],
            changedTouches: [toque(x, y)],
          }),
        );
      lanzar('touchstart', x0, y0);
      for (let i = 1; i <= 8; i++)
        lanzar('touchmove', x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8);
      lanzar('touchend', x1, y1, true);
    },
    [...desde, ...hasta],
  );
}

test('abajo hay cinco pestañas y ninguna hamburguesa', async () => {
  await pagina.goto('/projects');
  await expect(barra()).toBeVisible();
  for (const nombre of ['Inicio', 'Chat', 'PRAX']) {
    await expect(barra().getByRole('link', { name: nombre })).toBeVisible();
  }
  await expect(barra().getByRole('button', { name: /^Avisos/ })).toBeVisible();
  await expect(barra().getByRole('button', { name: 'Tú' })).toBeVisible();
  await expect(pagina.getByRole('button', { name: 'Abrir menú' })).toHaveCount(0);
  await expect(barra().getByRole('link', { name: 'Inicio' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('las pestañas llevan a su sección', async () => {
  await pagina.goto('/projects');
  await barra().getByRole('link', { name: 'Chat' }).click();
  await expect(pagina).toHaveURL(/\/chat$/);
  await expect(barra().getByRole('link', { name: 'Chat' })).toHaveAttribute('aria-current', 'page');
  await barra().getByRole('link', { name: 'PRAX' }).click();
  await expect(pagina).toHaveURL(/\/assistant/);
});

test('«Tú» y «Avisos» abren su hoja, y Escape la cierra', async () => {
  await pagina.goto('/projects');
  await barra().getByRole('button', { name: 'Tú' }).click();
  const tu = pagina.getByRole('dialog', { name: 'Tú' });
  await expect(tu).toBeVisible();
  await expect(tu.getByText('Cerrar sesión')).toBeVisible();
  await pagina.keyboard.press('Escape');
  await expect(tu).toHaveCount(0);

  await barra()
    .getByRole('button', { name: /^Avisos/ })
    .click();
  const avisos = pagina.getByRole('dialog', { name: 'Avisos' });
  await expect(avisos).toBeVisible();
  await pagina.keyboard.press('Escape');
  await expect(avisos).toHaveCount(0);
});

test('la hoja se cierra arrastrándola hacia abajo', async () => {
  await pagina.goto('/projects');
  await barra().getByRole('button', { name: 'Tú' }).click();
  const hoja = pagina.getByRole('dialog', { name: 'Tú' });
  await expect(hoja).toBeVisible();
  /* Que termine de entrar: a media animación la caja aún está desplazada y
     el «asa» quedaría fuera del dedo. */
  await pagina.waitForTimeout(400);
  const caja = await hoja.boundingBox();
  if (!caja) throw new Error('La hoja no tiene caja');
  /* El asa está arriba del todo, centrada. */
  const x = caja.x + caja.width / 2;
  const y = caja.y + 10;
  await pagina.mouse.move(x, y);
  await pagina.mouse.down();
  await pagina.mouse.move(x, y + 80, { steps: 4 });
  await pagina.mouse.move(x, y + 220, { steps: 4 });
  await pagina.mouse.up();
  await expect(hoja).toHaveCount(0);
});

test('mientras se escribe, la barra se esconde', async () => {
  await pagina.goto('/projects');
  await expect(barra()).toBeVisible();
  await pagina.getByPlaceholder(/Buscar/).filter({ visible: true }).first().focus();
  await expect(barra()).toBeHidden();
  await pagina.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(barra()).toBeVisible();
});

test('dentro de una conversación no hay barra', async () => {
  await pagina.goto(`/chat/proyecto/${projectId}`);
  await expect(barra()).toBeHidden();
});

test('deslizar desde el borde izquierdo vuelve atrás', async () => {
  await pagina.goto('/projects');
  await pagina.goto(`/projects/${slug}`);
  const alto = pagina.viewportSize()?.height ?? 600;
  await deslizar(pagina, [4, alto / 2], [180, alto / 2 + 6]);
  await expect(pagina).toHaveURL(/\/projects$/);
});

test('en la raíz de una pestaña, deslizar no saca de la app', async () => {
  await pagina.goto(`/projects/${slug}`);
  await pagina.goto('/projects');
  const alto = pagina.viewportSize()?.height ?? 600;
  await deslizar(pagina, [4, alto / 2], [180, alto / 2 + 6]);
  await pagina.waitForTimeout(800);
  await expect(pagina).toHaveURL(/\/projects$/);
});
