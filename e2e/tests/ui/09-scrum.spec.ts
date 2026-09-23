import {
  type APIRequestContext,
  request as contextoDePeticion,
  expect,
  test,
} from '@playwright/test';
import { comoBearer, data, nombreUnico } from '../../fixtures/api';
import { crearMundo, crearTarea } from '../../fixtures/mundo';
import { entrarConCuenta } from '../../fixtures/ui';

/**
 * Scrum encima del Kanban (`docs/PLAN-SCRUM-KANBAN.md`).
 *
 * El contrato de la API se comprobó aparte; aquí va lo que solo se ve en la
 * pantalla: que el interruptor enciende las pestañas, que el Kanban se queda
 * vacío sin sprint en curso (D12) y enseña solo el sprint cuando lo hay, y que
 * cerrar pregunta por cada pendiente antes de dejarte (D6).
 */

async function apiContext(): Promise<APIRequestContext> {
  return contextoDePeticion.newContext({
    baseURL: process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000',
  });
}

test.describe('Scrum en un tablero', () => {
  test.beforeAll(async ({ request }) => {
    await request.get('/projects/calentar-turbopack', { timeout: 60_000 }).catch(() => {});
  });

  test('backlog, sprint en curso y cierre que pregunta', async ({ page }) => {
    test.setTimeout(180_000);
    const api = await apiContext();
    const mundo = await crearMundo(api);
    const cabeceras = comoBearer(mundo.duenno.accessToken);

    const enBacklog = await crearTarea(api, mundo.duenno.accessToken, mundo, {
      titulo: nombreUnico('Backlog'),
    });
    const alSprint = await crearTarea(api, mundo.duenno.accessToken, mundo, {
      titulo: nombreUnico('Comprometida'),
    });

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?board=${mundo.boardId}`);

    // Sin Scrum: ni Backlog ni Sprint en el selector de vista.
    const vistas = page.getByRole('tablist', { name: 'Vista del tablero' });
    await expect(vistas.getByRole('tab', { name: 'Kanban' })).toBeVisible();
    await expect(vistas.getByRole('tab', { name: 'Backlog' })).toHaveCount(0);

    // Encender Scrum desde el menú del tablero.
    await page.getByRole('button', { name: /^Opciones del tablero/ }).click();
    await page.getByRole('switch', { name: /Trabajar por sprints/ }).click();
    await expect(vistas.getByRole('tab', { name: 'Backlog' })).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press('Escape');

    // D12: sin sprint en curso el Kanban no enseña tareas, y lo dice.
    await expect(page.getByRole('heading', { name: 'No hay sprint en curso' })).toBeVisible();
    await expect(page.getByText(alSprint.title)).toHaveCount(0);

    // Planear un sprint desde la vista Sprint.
    await vistas.getByRole('tab', { name: 'Sprint' }).click();
    await page.getByRole('textbox', { name: 'Nombre del sprint' }).fill('Sprint E2E');
    await page.getByRole('button', { name: 'Planear sprint' }).click();
    await expect(page.getByText('Sprint E2E')).toBeVisible({ timeout: 20_000 });

    // Pasar una tarea del backlog a ese sprint.
    await vistas.getByRole('tab', { name: 'Backlog' }).click();
    await expect(page.getByText(enBacklog.title)).toBeVisible();
    await page
      .getByRole('combobox', { name: `Mover «${alSprint.title}» a` })
      .selectOption({ label: 'Sprint E2E' });
    await expect(
      page.getByRole('region', { name: 'Sprint Sprint E2E' }).getByText(alSprint.title),
    ).toBeVisible({ timeout: 20_000 });

    // Iniciarlo con las fechas por defecto (dos semanas).
    await vistas.getByRole('tab', { name: 'Sprint' }).click();
    await page.getByRole('button', { name: 'Iniciar', exact: true }).click();
    await page.getByRole('button', { name: 'Iniciar sprint' }).click();
    await expect(page.getByRole('region', { name: 'Sprint en curso' })).toBeVisible({
      timeout: 20_000,
    });

    // El Kanban enseña la del sprint y no la del backlog.
    await vistas.getByRole('tab', { name: 'Kanban' }).click();
    await expect(page.getByText(alSprint.title)).toBeVisible();
    await expect(page.getByText(enBacklog.title)).toHaveCount(0);

    // D6: cerrar con una pendiente exige decidir antes de dejar cerrar.
    await vistas.getByRole('tab', { name: 'Sprint' }).click();
    await page.getByRole('button', { name: 'Cerrar sprint' }).click();
    const confirmar = page.getByRole('button', { name: /Faltan 1 por decidir/ });
    await expect(confirmar).toBeDisabled();
    await page.getByRole('button', { name: 'Backlog', exact: true }).click();
    await page.getByRole('button', { name: 'Cerrar sprint', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ningún sprint en curso' })).toBeVisible({
      timeout: 20_000,
    });

    // Y la tarea volvió al backlog en el servidor, no solo en pantalla.
    const respuesta = await api.get(`/api/tasks/${alSprint.id}`, { headers: cabeceras });
    expect((await data<{ sprintId: string | null }>(respuesta)).sprintId).toBeNull();
  });

  test('la estimación sale en la tarjeta y el límite WIP avisa sin bloquear', async ({ page }) => {
    test.setTimeout(120_000);
    const api = await apiContext();
    const mundo = await crearMundo(api);
    const cabeceras = comoBearer(mundo.duenno.accessToken);
    const una = await crearTarea(api, mundo.duenno.accessToken, mundo, {
      titulo: nombreUnico('Estimada'),
    });
    await crearTarea(api, mundo.duenno.accessToken, mundo, { titulo: nombreUnico('Otra') });

    await entrarConCuenta(page, mundo.duenno.email);

    // Estimación: se escribe en el panel y se guarda al cerrarlo.
    await page.goto(`/projects/${mundo.proyecto.id}?task=${una.id}`);
    await page.getByLabel('Estimación (puntos)').fill('5');
    await page.getByRole('button', { name: 'Cerrar panel' }).click();
    await expect(page.getByText('5 pt')).toBeVisible({ timeout: 20_000 });
    const tarea = await api.get(`/api/tasks/${una.id}`, { headers: cabeceras });
    expect((await data<{ estimatePoints: number | null }>(tarea)).estimatePoints).toBe(5);

    // WIP: límite 1 en una columna con 2 tareas → «2/1», y se puede seguir moviendo.
    const columna = mundo.primeraColumna;
    await page.getByRole('button', { name: `Opciones de la columna ${columna.name}` }).click();
    await page.getByText('Límite de trabajo en curso').click();
    await page.getByLabel('Máximo de tareas a la vez').fill('1');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('2/1')).toBeVisible({ timeout: 20_000 });

    const respuesta = await api.post(`/api/boards/${mundo.boardId}/tasks`, {
      headers: cabeceras,
      data: { columnId: columna.id, status: columna.name, title: nombreUnico('Tercera') },
    });
    expect(respuesta.status(), 'El límite no bloquea').toBe(201);
  });
});

