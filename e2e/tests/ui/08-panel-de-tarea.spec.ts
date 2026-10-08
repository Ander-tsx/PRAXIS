import {
  type APIRequestContext,
  request as contextoDePeticion,
  expect,
  test,
} from '@playwright/test';
import { comoBearer, data, nombreUnico, registrar } from '../../fixtures/api';
import { crearMundo, crearTarea, darDeAlta } from '../../fixtures/mundo';
import { entrarConCuenta } from '../../fixtures/ui';

/**
 * El panel de detalle de una tarea.
 *
 * ## Por qué esto no lo cubre ninguna prueba de API
 *
 * El panel **se guarda solo**: no hay botón de «Guardar», y lo que se manda al
 * servidor sale de leer el formulario en el momento de cerrarlo o de cambiar de
 * tarea. Eso quiere decir que el `PATCH` que llega puede ser correcto o
 * catastrófico según el estado del DOM y de React en ese instante — y ninguna
 * prueba de contrato ve esa mitad del problema: la petición que borra los
 * encargados de otra tarea está perfectamente formada.
 *
 * El caso que se prueba aquí pasó de verdad (`734855a`): asignar a alguien en
 * una tarea, cerrarla, y asignarlo en otra le quitaba el encargo de la primera,
 * con su aviso de «te han quitado» incluido.
 */

async function apiContext(): Promise<APIRequestContext> {
  return contextoDePeticion.newContext({
    baseURL: process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000',
  });
}

/** Los ids de quien esté encargado de una tarea, según el servidor. */
async function encargadosDe(
  api: APIRequestContext,
  token: string,
  taskId: string,
): Promise<string[]> {
  const respuesta = await api.get(`/api/tasks/${taskId}`, { headers: comoBearer(token) });
  expect(respuesta.status(), 'Leer la tarea').toBe(200);
  const tarea = await data<{ assignees: { userId: string }[] }>(respuesta);
  return tarea.assignees.map((encargado) => encargado.userId);
}

test.describe('Panel de detalle de una tarea', () => {
  /**
   * ⚠️ **Calienta la ruta `/projects/[id]` antes de medir nada.** Mismo motivo
   * que en `07-reglas`: en `next dev` la primera visita compila la ruta sobre
   * la marcha y el proxy del shell corta antes de que termine.
   */
  test.beforeAll(async ({ request }) => {
    await request.get('/projects/calentar-turbopack', { timeout: 60_000 }).catch(() => {});
  });

  test('asignar a alguien en una tarea no lo quita de la anterior', async ({ page }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    const companero = await registrar(api);
    await darDeAlta(api, mundo, companero, { canViewProject: true, canEditTask: true });

    const anterior = await crearTarea(api, mundo.duenno.accessToken, mundo, {
      titulo: nombreUnico('Anterior'),
    });
    const siguiente = await crearTarea(api, mundo.duenno.accessToken, mundo, {
      titulo: nombreUnico('Siguiente'),
    });

    await entrarConCuenta(page, mundo.duenno.email);

    /* `?task=` abre el panel directamente: la página resuelve el tablero desde
       la tarea, así que no hace falta saber en qué espacio vive. */
    await page.goto(`/projects/${mundo.proyecto.id}?task=${anterior.id}`);

    /**
     * El rótulo de la lista de encargados es `personLabel`: el nombre si la
     * cuenta tiene, y la parte local del correo si no — que es el caso de
     * cualquier cuenta recién registrada, porque el alta no pide nombre.
     */
    const etiqueta = companero.email.split('@')[0];

    /**
     * Encargados es un selector de fichas desde 2026-10-08
     * (`custom-fields/TokenPicker.tsx`): se escribe o se pulsa en la caja, se
     * elige en la lista y la persona queda como ficha con su «Quitar a …».
     *
     * Lo que viaja en el formulario son `<input type="hidden">`, uno por
     * ficha; por eso lo que se comprueba es la ficha, no una casilla.
     */
    await page.getByRole('combobox', { name: 'Añadir a Encargados' }).click();
    await page.getByRole('option', { name: etiqueta }).click();
    const fichaAnterior = page.getByRole('button', {
      name: `Quitar a ${etiqueta}`,
      includeHidden: true,
    });
    await expect(fichaAnterior).toHaveCount(1);

    await page.getByRole('button', { name: 'Cerrar panel' }).click();

    /* El guardado va al cerrar, así que se espera a verlo en el servidor: sin
       esto la prueba mediría la carrera, no el fallo. */
    await expect
      .poll(() => encargadosDe(api, mundo.duenno.accessToken, anterior.id), {
        message: 'Cerrar el panel debería guardar el encargado',
        timeout: 20_000,
      })
      .toContain(companero.userId);

    /**
     * ⚠️ **La espera es el corazón de la prueba, no un parche de sincronía.**
     *
     * Lo que fallaba ocurría *después* de que el guardado terminara: React
     * reseteaba el formulario al completarse la acción, y ese reset es un
     * commit más que llega unos cientos de milisegundos más tarde. Sin esperar
     * aquí, la prueba abría la segunda tarea antes de que el estropicio
     * existiera y pasaba con el código roto — que es exactamente lo que hizo la
     * primera versión de este archivo.
     *
     * Un `expect` con reintentos tampoco vale: acierta en el primer intento y
     * sigue adelante. Hay que darle tiempo al fallo a ocurrir y mirar después.
     */
    await page.waitForTimeout(2_000);
    await expect(
      fichaAnterior,
      'Cerrar el panel no puede quitar lo que se acaba de guardar',
    ).toHaveCount(1);

    /**
     * ⚠️ **La segunda tarea se abre pulsando su tarjeta, no con otra URL.**
     *
     * El fallo que esto vigila vive en el paso de una tarea a otra **sin
     * recargar**: es el remontaje del formulario lo que dispara el guardado de
     * la anterior. Un `page.goto()` monta la página de cero y no reproduce
     * nada.
     */
    await page.getByRole('button', { name: `Ver y editar la tarea ${siguiente.title}` }).click();

    /* La segunda tarea nace sin esa persona: si la ficha saliera aquí, es que
       el panel arrastró el estado de la anterior. */
    await expect(page.getByRole('button', { name: `Quitar a ${etiqueta}` })).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Añadir a Encargados' }).click();
    await page.getByRole('option', { name: etiqueta }).click();
    await page.getByRole('button', { name: 'Cerrar panel' }).click();

    await expect
      .poll(() => encargadosDe(api, mundo.duenno.accessToken, siguiente.id), {
        message: 'La segunda tarea debería guardar su encargado',
        timeout: 20_000,
      })
      .toContain(companero.userId);

    /* La regresión: la primera tarea sigue teniendo a quien se le puso. El
       `PATCH` que la vaciaba salía al abrir la segunda, así que para cuando la
       segunda está guardada, el estropicio ya habría ocurrido. */
    expect(
      await encargadosDe(api, mundo.duenno.accessToken, anterior.id),
      'Asignar en otra tarea no puede quitar el encargado de la primera',
    ).toContain(companero.userId);

    await api.dispose();
  });
});
