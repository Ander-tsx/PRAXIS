import {
  type APIRequestContext,
  type Locator,
  type Page,
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
 * pantalla, en el orden en que lo vive un equipo:
 *
 * 1. Encender Scrum con trabajo en columnas pregunta, y ofrece que ese trabajo
 *    sea el primer sprint (S7).
 * 2. El sprint se **planea antes de empezarlo**: el tablero enseña el planeado
 *    y «Empezar sprint» fija el compromiso (D19, S1).
 * 3. Cerrar pregunta por lo pendiente, y lo que pasa al siguiente sigue en su
 *    columna, marcado como arrastrado (D6, D19).
 */

async function apiContext(): Promise<APIRequestContext> {
  return contextoDePeticion.newContext({
    baseURL: process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000',
  });
}

/**
 * Arrastra con el ratón paso a paso. El tablero no usa el arrastre nativo del
 * navegador sino eventos de puntero medidos por fotograma: un `dragTo` de un
 * solo salto termina antes de que el motor mida el destino.
 */
async function arrastrar(page: Page, desde: Locator, hasta: Locator) {
  const a = await desde.boundingBox();
  const b = await hasta.boundingBox();
  if (!a || !b) throw new Error('Sin caja para arrastrar');
  await page.mouse.move(a.x + 20, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 40, a.y + a.height / 2 + 10, { steps: 5 });
  await page.mouse.move(b.x + 40, b.y + 60, { steps: 25 });
  await page.waitForTimeout(150);
  await page.mouse.up();
}

test.describe('Scrum en un tablero', () => {
  test.beforeAll(async ({ request }) => {
    await request.get('/projects/calentar-turbopack', { timeout: 60_000 }).catch(() => {});
  });

  test('encender, planear, empezar y cerrar un sprint', async ({ page }) => {
    test.setTimeout(180_000);
    const api = await apiContext();
    const mundo = await crearMundo(api);
    const cabeceras = comoBearer(mundo.duenno.accessToken);

    const pendiente = await crearTarea(api, mundo.duenno.accessToken, mundo, {
      titulo: nombreUnico('Comprometida'),
    });

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?board=${mundo.boardId}`);

    // S7: encender con trabajo en columnas pregunta, y se lo lleva al Sprint 1.
    await page.getByRole('button', { name: /^Opciones del tablero/ }).click();
    await page.getByRole('switch', { name: /Trabajar por sprints/ }).click();
    await page.getByRole('button', { name: /al Sprint 1/ }).click();
    await page.keyboard.press('Escape');

    // D19: el tablero enseña el sprint planeado, con su tarea, sin empezar.
    const sprint = page.getByRole('button', { name: /^Sprint:/ });
    await expect(sprint).toContainText('sin empezar', { timeout: 20_000 });
    await expect(page.getByText(pendiente.title)).toBeVisible();

    // Planear: una tarea nueva en el backlog, arrastrada a la segunda columna.
    await page.getByRole('button', { name: /^Backlog/ }).click();
    const panel = page.getByRole('complementary', { name: 'Backlog del tablero' });
    const nueva = nombreUnico('Planeada');
    await panel.getByLabel('Título de la tarea nueva en el backlog').fill(nueva);
    await panel.getByLabel('Título de la tarea nueva en el backlog').press('Enter');
    await expect(panel.getByText(nueva)).toBeVisible({ timeout: 20_000 });
    await arrastrar(
      page,
      panel.getByText(nueva),
      page.getByRole('heading', { name: mundo.columnas[1].name, exact: true }),
    );
    await expect(panel.getByText(nueva)).toHaveCount(0, { timeout: 20_000 });
    await page.getByRole('button', { name: /^Backlog,/ }).click();

    // Empezar: un diálogo, y la franja pasa a contar los días.
    await page.getByRole('button', { name: 'Empezar sprint' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Empezar sprint' }).click();
    await expect(sprint).toContainText(/quedan \d+ días/, { timeout: 20_000 });

    // D6: cerrar pregunta; por defecto lo pendiente pasa al siguiente.
    await page.getByRole('button', { name: /^Sprint:/ }).click();
    await page
      .getByRole('complementary', { name: 'Sprint' })
      .getByRole('button', { name: 'Cerrar sprint' })
      .click();
    const cierre = page.getByRole('dialog');
    await expect(cierre.getByText(pendiente.title, { exact: true })).toBeVisible();
    await cierre.getByRole('button', { name: 'Cerrar sprint' }).click();

    // El siguiente queda planeado, con lo arrastrado en su columna y marcado.
    await expect(sprint).toContainText('Sprint 2', { timeout: 20_000 });
    await expect(sprint).toContainText('sin empezar');
    await expect(page.getByTitle('Viene de un sprint anterior').first()).toBeVisible();

    const tras = await data<{ carryOverCount: number; columnId: string }>(
      await api.get(`/api/tasks/${pendiente.id}`, { headers: cabeceras }),
    );
    expect(tras.carryOverCount).toBe(1);
    expect(tras.columnId).toBe(pendiente.columnId);
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

  test('una tarea sale del sprint desde su panel, sin cerrar el sprint', async ({ page }) => {
    test.setTimeout(150_000);
    const api = await apiContext();
    const mundo = await crearMundo(api);
    const cabeceras = comoBearer(mundo.duenno.accessToken);
    const tarea = await crearTarea(api, mundo.duenno.accessToken, mundo, {
      titulo: nombreUnico('Recortada'),
    });

    await api.patch(`/api/boards/${mundo.boardId}`, {
      headers: cabeceras,
      data: { scrumEnabled: true },
    });
    const sprint = await data<{ id: string }>(
      await api.post(`/api/boards/${mundo.boardId}/sprints`, {
        headers: cabeceras,
        data: { name: 'Sprint recorte' },
      }),
    );
    await api.post(`/api/boards/${mundo.boardId}/sprints/${sprint.id}/tasks`, {
      headers: cabeceras,
      data: { taskIds: [tarea.id] },
    });

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?board=${mundo.boardId}&task=${tarea.id}`);

    // S5: recortar alcance es un botón del panel de la tarea.
    await page.getByRole('button', { name: 'Devolver al backlog' }).click();
    await expect
      .poll(
        async () =>
          (
            await data<{ sprintId: string | null }>(
              await api.get(`/api/tasks/${tarea.id}`, { headers: cabeceras }),
            )
          ).sprintId,
        { timeout: 20_000 },
      )
      .toBeNull();
  });
});
