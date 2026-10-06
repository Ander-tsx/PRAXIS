import { type Page, expect, test } from '@playwright/test';
import { crearCuentaYEntrar } from '../../fixtures/ui';

/**
 * El armazón de app en móvil (M2 y M8 de `docs/PLAN-MOVIL.md`): la barra de
 * abajo, la de arriba, las pantallas de Avisos y Tú, y los gestos.
 */

test.describe.configure({ mode: 'serial' });

let pagina: Page;
let slug: string;
let projectId: string;

const barra = () => pagina.getByRole('navigation', { name: 'Secciones', exact: true });
/** El título de la barra de arriba (la única cabecera del documento, `banner`). */
const titulo = () => pagina.getByRole('banner').getByRole('heading', { level: 1 });

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
  for (const nombre of ['Inicio', 'Chat', 'PRAX', /^Avisos/, 'Tú']) {
    await expect(barra().getByRole('link', { name: nombre })).toBeVisible();
  }
  await expect(pagina.getByRole('button', { name: 'Abrir menú' })).toHaveCount(0);
  await expect(barra().getByRole('link', { name: 'Inicio' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('las pestañas llevan a su sección', async () => {
  await pagina.goto('/projects');
  await barra().getByRole('link', { name: 'Chat' }).click();
  /* La lista, no la última conversación (M8). */
  await expect(pagina).toHaveURL(/\/chat\?lista=1$/);
  await expect(barra().getByRole('link', { name: 'Chat' })).toHaveAttribute('aria-current', 'page');
  await barra().getByRole('link', { name: 'PRAX' }).click();
  await expect(pagina).toHaveURL(/\/assistant/);
});

test('«Tú» y «Avisos» son pantallas, no hojas', async () => {
  await pagina.goto('/projects');
  await barra().getByRole('link', { name: 'Tú' }).click();
  await expect(pagina).toHaveURL(/\/main\/me$/);
  await expect(titulo()).toHaveText('Tú');
  await expect(pagina.getByRole('dialog')).toHaveCount(0);
  await expect(pagina.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  /* Sin desplegables: las opciones de estado ya están a la vista. */
  await expect(pagina.getByRole('button', { name: /^Ocupado/ })).toBeVisible();
  await expect(barra().getByRole('link', { name: 'Tú' })).toHaveAttribute('aria-current', 'page');

  await barra()
    .getByRole('link', { name: /^Avisos/ })
    .click();
  await expect(pagina).toHaveURL(/\/main\/notifications$/);
  await expect(titulo()).toHaveText('Avisos');
  await expect(pagina.getByRole('button', { name: 'Sin leer' })).toBeVisible();
});

test('arriba siempre está el título de la pantalla', async () => {
  for (const [ruta, esperado] of [
    ['/projects', 'Inicio'],
    ['/chat?lista=1', 'Chat'],
    ['/assistant', 'PRAX'],
    ['/main/team', 'Equipo'],
    [`/projects/${slug}`, 'Armazón móvil'],
    [`/chat/proyecto/${projectId}`, 'Chat'],
  ] as const) {
    await pagina.goto(ruta);
    await expect(titulo()).toHaveText(esperado);
    await expect(barra()).toBeVisible();
  }
});

test('cambiar de pestaña no pasa por el esqueleto (prefetch completo)', async () => {
  await pagina.goto('/projects');
  /* Que terminen las precargas de las cinco pestañas. */
  await pagina.waitForLoadState('networkidle');
  await pagina.evaluate(() => {
    const w = window as unknown as { esqueletos: number };
    w.esqueletos = 0;
    new MutationObserver(() => {
      if (document.querySelector('[aria-busy="true"]')) w.esqueletos++;
    }).observe(document.body, { subtree: true, childList: true, attributes: true });
  });
  for (const [nombre, ruta] of [
    [/^Avisos/, /\/main\/notifications$/],
    ['Tú', /\/main\/me$/],
    ['Chat', /\/chat\?lista=1$/],
    ['Inicio', /\/projects$/],
  ] as const) {
    await barra().getByRole('link', { name: nombre }).click();
    await expect(pagina).toHaveURL(ruta);
  }
  expect(
    await pagina.evaluate(() => (window as unknown as { esqueletos: number }).esqueletos),
  ).toBe(0);
});

test('Inicio: sin cabecera «Proyectos» y los proyectos no se pliegan', async () => {
  await pagina.goto('/projects');
  await expect(pagina.getByRole('link', { name: 'Armazón móvil' }).first()).toBeVisible();
  await expect(pagina.getByRole('button', { name: 'Proyectos', exact: true })).toHaveCount(0);
  await expect(
    pagina.getByRole('button', { name: /^(Colapsar|Expandir) Armazón móvil/ }),
  ).toHaveCount(0);
});

test('el buscador cae en el mismo sitio en Inicio y en Chat', async () => {
  await pagina.goto('/projects');
  const enInicio = await pagina.getByRole('searchbox').filter({ visible: true }).boundingBox();
  await pagina.goto('/chat?lista=1');
  const enChat = await pagina.getByRole('searchbox').filter({ visible: true }).boundingBox();
  expect(enInicio).not.toBeNull();
  expect(Math.round(enChat?.y ?? -1)).toBe(Math.round(enInicio?.y ?? -2));
  expect(Math.round(enChat?.height ?? -1)).toBe(Math.round(enInicio?.height ?? -2));
});

test('mientras se escribe, la barra se esconde', async () => {
  await pagina.goto('/projects');
  await expect(barra()).toBeVisible();
  await pagina
    .getByPlaceholder(/Buscar/)
    .filter({ visible: true })
    .first()
    .focus();
  await expect(barra()).toBeHidden();
  await pagina.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(barra()).toBeVisible();
});

test('dentro de una conversación la barra sigue ahí', async () => {
  await pagina.goto(`/chat/proyecto/${projectId}`);
  await expect(barra()).toBeVisible();
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
