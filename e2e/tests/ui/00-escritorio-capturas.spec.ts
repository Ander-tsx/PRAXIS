import { type Page, expect, test } from '@playwright/test';
import { crearCuentaYEntrar } from '../../fixtures/ui';

/**
 * Las capturas de referencia del escritorio (I1 de `docs/PLAN-MOVIL.md`).
 *
 * ## Por qué existe
 *
 * La etapa móvil reescribe el armazón de todas las pantallas, y la única
 * restricción que no se negocia es que **el escritorio no cambie ni un
 * píxel**. Eso no se puede vigilar a ojo en cada fase: se vigila comparando
 * contra capturas sacadas **antes** de tocar nada.
 *
 * Las referencias se generaron con el código de `main` en el arranque del
 * plan (M0). Si una fase cambia una de estas pantallas, la prueba falla y el
 * informe enseña la diferencia; si el cambio era a propósito —no debería
 * haberlo en escritorio—, se regenera con `--update-snapshots` y se explica en
 * el registro del plan.
 *
 * ## Por qué los datos son fijos y hay máscaras
 *
 * Una captura solo sirve si dos corridas iguales dan la misma imagen. El
 * proyecto y sus tareas llevan nombres fijos; lo que cambia en cada corrida
 * —el correo de la cuenta, su avatar, el nombre de su organización— se tapa
 * con una máscara. Nada lleva fecha límite: el color de «vence mañana»
 * cambiaría con el día.
 *
 * ⚠️ **Son capturas de esta máquina.** Playwright guarda una por plataforma
 * (`-darwin`), y la tipografía cambia entre sistemas: en otra máquina hay que
 * generarlas primero, con el código de `main`.
 */

test.describe.configure({ mode: 'serial' });

const PROYECTO = 'Capturas de escritorio';
const TAREAS = [
  ['Por hacer', 'Revisar el contrato del proveedor'],
  ['Por hacer', 'Preparar la demo del jueves con el equipo de ventas y los datos nuevos'],
  ['En curso', 'Migrar la base de clientes'],
  ['Hecho', 'Configurar el dominio'],
] as const;

let pagina: Page;
let email: string;
let slug: string;

/** Lo que cambia en cada corrida: la cuenta y lo que se deriva de ella. */
function mascaras(page: Page) {
  return [
    page.locator('aside').getByText(email),
    page.locator('aside button[aria-expanded]').first(),
    page.locator('aside').locator('img'),
    page.getByText(email),
    /* El nombre visible de una cuenta sin nombre es la parte local del correo. */
    page.getByText(email.split('@')[0]),
    page.getByText(/^Creada /),
    /* El color del monograma del proyecto sale de su id, que es aleatorio. */
    page.getByText('CD', { exact: true }),
    /* Fechas cortas («5 oct 2026»): la de hoy, mañana será otra. */
    page.getByText(/^\d{1,2} [a-zé]{3,4}\.? \d{4}$/),
  ];
}

async function capturar(page: Page, nombre: string) {
  /* Que no quede nada a medio animar ni cargando. */
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(`${nombre}.png`, {
    fullPage: false,
    animations: 'disabled',
    caret: 'hide',
    mask: mascaras(page),
    maxDiffPixelRatio: 0.002,
  });
}

async function api<T>(page: Page, metodo: 'post', ruta: string, datos: unknown): Promise<T> {
  const respuesta = await page.request[metodo](`/api/gateway${ruta}`, { data: datos });
  const cuerpo = await respuesta.json().catch(() => null);
  if (!cuerpo?.data) {
    throw new Error(`${ruta}: ${respuesta.status()} ${JSON.stringify(cuerpo)}`);
  }
  return cuerpo.data as T;
}

test.beforeAll(async ({ browser }) => {
  pagina = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  email = await crearCuentaYEntrar(pagina);

  const proyecto = await api<{ id: string; slug: string }>(pagina, 'post', '/projects', {
    name: PROYECTO,
  });
  slug = proyecto.slug;
  const espacio = await api<{ id: string }>(pagina, 'post', `/projects/${proyecto.id}/workspaces`, {
    name: 'Producto',
  });
  const tablero = await api<{ id: string }>(pagina, 'post', `/workspaces/${espacio.id}/boards`, {
    name: 'Lanzamiento',
  });
  const columnas = new Map<string, string>();
  for (const [orden, nombre] of ['Por hacer', 'En curso', 'Hecho'].entries()) {
    const columna = await api<{ id: string }>(pagina, 'post', `/boards/${tablero.id}/columns`, {
      name: nombre,
      order: orden,
    });
    columnas.set(nombre, columna.id);
  }
  for (const [columna, titulo] of TAREAS) {
    await api(pagina, 'post', `/boards/${tablero.id}/tasks`, {
      columnId: columnas.get(columna),
      title: titulo,
      status: columna,
    });
  }

  /* La barra desplegada y a su ancho de siempre, sea cual sea la cookie que
     dejara otra prueba. */
  await pagina.context().addCookies([
    { name: 'praxis_sidebar', value: '0', url: pagina.url() },
    { name: 'praxis_sidebar_width', value: '320', url: pagina.url() },
    { name: 'praxis_sidebar_tab', value: 'home', url: pagina.url() },
  ]);
});

test.afterAll(async () => {
  await pagina?.close();
});

test('lista de proyectos', async () => {
  await pagina.goto('/projects');
  await expect(pagina.getByText(PROYECTO).filter({ visible: true }).first()).toBeVisible();
  await capturar(pagina, 'escritorio-proyectos');
});

test('tablero en Kanban', async () => {
  await pagina.goto(`/projects/${slug}`);
  await expect(pagina.getByText('Migrar la base de clientes').filter({ visible: true })).toBeVisible();
  await capturar(pagina, 'escritorio-kanban');
});

test('tablero en tabla', async () => {
  await pagina.goto(`/projects/${slug}?vista=tabla`);
  await expect(pagina.getByRole('columnheader', { name: /Tarea/ })).toBeVisible();
  await capturar(pagina, 'escritorio-tabla');
});

test('panel de tarea abierto', async () => {
  await pagina.goto(`/projects/${slug}`);
  await pagina.getByText('Revisar el contrato del proveedor').filter({ visible: true }).click();
  await expect(pagina.getByRole('textbox', { name: /Título/ }).first()).toBeVisible();
  await capturar(pagina, 'escritorio-panel-de-tarea');
});

test('ajustes del proyecto', async () => {
  await pagina.goto(`/projects/${slug}?tab=ajustes`);
  await expect(pagina.getByRole('heading', { name: 'Identidad' })).toBeVisible();
  await capturar(pagina, 'escritorio-ajustes-proyecto');
});

test('chat', async () => {
  await pagina.goto('/chat');
  await capturar(pagina, 'escritorio-chat');
});

test('equipo de la organización', async () => {
  await pagina.goto('/main/team');
  await capturar(pagina, 'escritorio-equipo');
});

test('facturación', async () => {
  await pagina.goto('/main/billing');
  await capturar(pagina, 'escritorio-facturacion');
});

test('integraciones', async () => {
  await pagina.goto('/main/integrations');
  await capturar(pagina, 'escritorio-integraciones');
});

test('barra plegada', async () => {
  await pagina.context().addCookies([{ name: 'praxis_sidebar', value: '1', url: pagina.url() }]);
  await pagina.goto(`/projects/${slug}`);
  await expect(pagina.getByText('Migrar la base de clientes').filter({ visible: true })).toBeVisible();
  await capturar(pagina, 'escritorio-barra-plegada');
});
