import { type Page, expect, test } from '@playwright/test';
import { crearCuentaYEntrar } from '../../fixtures/ui';

/**
 * Proyectos y tablero en móvil (M3 de `docs/PLAN-MOVIL.md`): Inicio con el
 * árbol, el Kanban de una columna por pantalla, el panel de tarea como hoja, la
 * agenda y la tabla en tarjetas.
 */

test.describe.configure({ mode: 'serial' });

const PROYECTO = 'Tablero móvil';
let pagina: Page;
let slug: string;

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
  const proyecto = await api<{ id: string; slug: string }>(pagina, '/projects', { name: PROYECTO });
  slug = proyecto.slug;
  const espacio = await api<{ id: string }>(pagina, `/projects/${proyecto.id}/workspaces`, {
    name: 'Producto',
  });
  const tablero = await api<{ id: string }>(pagina, `/workspaces/${espacio.id}/boards`, {
    name: 'Lanzamiento',
  });
  const columnas: Record<string, string> = {};
  for (const [orden, nombre] of ['Por hacer', 'En curso', 'Hecho'].entries()) {
    columnas[nombre] = (
      await api<{ id: string }>(pagina, `/boards/${tablero.id}/columns`, {
        name: nombre,
        order: orden,
      })
    ).id;
  }
  for (const [columna, titulo] of [
    ['Por hacer', 'Revisar contrato'],
    ['En curso', 'Migrar clientes'],
  ]) {
    await api(pagina, `/boards/${tablero.id}/tasks`, {
      columnId: columnas[columna],
      title: titulo,
      status: columna,
    });
  }
});

test.afterAll(async () => {
  await pagina?.context().close();
});

test('Inicio es el árbol de proyectos', async () => {
  await pagina.goto('/projects');
  await expect(pagina.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();
  await expect(pagina.getByRole('link', { name: PROYECTO })).toBeVisible();
});

test('el Kanban va columna a columna, con sus píldoras', async () => {
  await pagina.goto(`/projects/${slug}`);
  const pildoras = pagina.getByRole('tablist', { name: 'Columnas' });
  await expect(pildoras).toBeVisible();
  const enCurso = pildoras.getByRole('tab', { name: /En curso/ });
  await expect(pildoras.getByRole('tab', { name: /Por hacer/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await enCurso.click();
  await expect(enCurso).toHaveAttribute('aria-selected', 'true');
  await expect(pagina.getByText('Migrar clientes').filter({ visible: true })).toBeInViewport();
});

test('el panel de una tarea ocupa la pantalla y tapa la barra', async () => {
  await pagina.goto(`/projects/${slug}`);
  await pagina.getByText('Revisar contrato').filter({ visible: true }).click();
  const titulo = pagina.getByRole('textbox', { name: /Título/ }).first();
  await expect(titulo).toBeVisible();
  /* La barra inferior queda debajo del panel: su pestaña Inicio no recibe el
     toque, lo recibe el panel. */
  const ancho = pagina.viewportSize()?.width ?? 0;
  const alto = pagina.viewportSize()?.height ?? 0;
  const encima = await pagina.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest('nav[aria-label="Secciones"]') !== null,
    [ancho / 2, alto - 10],
  );
  expect(encima).toBe(false);
});

test('una pulsación larga sobre una tarjeta abre «Mover a…»', async () => {
  await pagina.goto(`/projects/${slug}`);
  const tarjeta = pagina.getByText('Revisar contrato').filter({ visible: true });
  await expect(tarjeta).toBeVisible();
  /* Un dedo que se queda quieto: `pointerdown` táctil y esperar. */
  await tarjeta.evaluate((el) => {
    const caja = el.getBoundingClientRect();
    const objetivo = el.closest('article') ?? el;
    objetivo.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerType: 'touch',
        pointerId: 7,
        isPrimary: true,
        button: 0,
        clientX: caja.left + 10,
        clientY: caja.top + 10,
      }),
    );
  });
  const hoja = pagina.getByRole('dialog', { name: 'Mover a…' });
  await expect(hoja).toBeVisible({ timeout: 5_000 });
  await hoja.getByRole('button', { name: 'Hecho' }).click();
  await expect(hoja).toHaveCount(0);
  await pagina
    .getByRole('tablist', { name: 'Columnas' })
    .getByRole('tab', { name: /Hecho/ })
    .click();
  await expect(
    pagina.getByRole('tablist', { name: 'Columnas' }).getByRole('tab', { name: /Hecho 1/ }),
  ).toBeVisible({ timeout: 10_000 });
});

/**
 * 🔴 **En el teléfono solo hay Kanban** (decisión del dueño, 2026-10-08,
 * `docs/PLAN-CAMPOS-PERSONALIZADOS.md`). Tabla y Calendario se quitaron en vez
 * de encogerse: ni selector de vista, ni se llega por `?vista=` con un enlace
 * copiado del escritorio. Sustituye a las pruebas de M3 que fijaban la agenda
 * y la lista de la tabla en móvil.
 */
test('en el teléfono no hay Tabla ni Calendario, ni por la URL', async () => {
  for (const vista of ['tabla', 'calendario']) {
    await pagina.goto(`/projects/${slug}?vista=${vista}`);
    await expect(
      pagina
        .getByRole('button', { name: /Migrar clientes/ })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expect(pagina.getByRole('table')).toHaveCount(0);
    await expect(pagina.getByLabel('Ordenar por')).toHaveCount(0);
    await expect(pagina.getByRole('tablist', { name: 'Vista del tablero' })).toHaveCount(0);
    await expect(pagina.getByRole('button', { name: /^Nueva tarea el / })).toHaveCount(0);
  }
});

test('las pestañas del proyecto se desplazan y llegan hasta Ajustes', async () => {
  await pagina.goto(`/projects/${slug}`);
  const ajustes = pagina.getByRole('link', { name: 'Ajustes' }).filter({ visible: true });
  await ajustes.scrollIntoViewIfNeeded();
  await ajustes.click();
  await expect(pagina.getByRole('heading', { name: 'Identidad' })).toBeVisible();
});
