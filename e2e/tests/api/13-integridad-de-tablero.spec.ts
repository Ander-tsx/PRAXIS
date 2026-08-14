import { expect, test } from '@playwright/test';
import { comoBearer, data, nombreUnico } from '../../fixtures/api';
import { type Mundo, crearMundo, crearTarea } from '../../fixtures/mundo';

/**
 * # Una tarea vive en una columna de su propio tablero
 *
 * El bloque 1 comprobó **quién** entra por cada ruta. Esto comprueba lo otro:
 * que lo que se guarda tenga sentido. Aquí no hay escalada de privilegios —hace
 * falta permiso sobre el proyecto de la tarea igual que siempre—, y por eso el
 * barrido de acceso no lo veía.
 *
 * `columnId` viaja en el cuerpo y solo se validaba como UUID. El
 * `ProjectPermissionGuard` resuelve el proyecto desde la ruta de la **tarea**, y
 * la columna vive en otro microservicio, así que nadie ataba las dos cosas: las
 * tres rutas que escriben `columnId` —crear, mover, y el `PATCH`, que también
 * mueve— aceptaban la columna de cualquier tablero, el de otro proyecto
 * incluido.
 *
 * ## Por qué importa una fila incoherente
 *
 * `GET /boards/:id/tasks` filtra por `boardId`, que no cambia al mover: la tarea
 * **sigue saliendo** en el listado, pero su `columnId` no es de ninguna columna
 * del tablero y no se pinta en ninguna. Desaparece del tablero sin dejar de
 * existir, y no se puede arrastrar de vuelta lo que no se ve. Además
 * `task_restatus` busca por `columnId`, así que renombrar esa columna ajena
 * reescribe el `status` de una tarea de otro proyecto.
 *
 * ⚠️ **Las dos mitades, como en el bloque 1.** Cerrar el paso no vale de nada si
 * se cierra de más: el último bloque comprueba que mover dentro del propio
 * tablero sigue funcionando.
 */

test.describe.configure({ timeout: 120_000 });

/** El mensaje que da el servicio. Se comprueba, no solo el código. */
const FUERA_DE_TABLERO = 'Esa columna no es de este tablero';

/** Un segundo tablero **dentro del mismo proyecto**, con sus propias columnas. */
async function segundoTablero(
  request: Parameters<typeof crearMundo>[0],
  mundo: Mundo,
): Promise<{ boardId: string; columnas: { id: string; name: string }[] }> {
  const cabeceras = comoBearer(mundo.duenno.accessToken);

  const respuesta = await request.post(`/api/workspaces/${mundo.workspaceId}/boards`, {
    headers: cabeceras,
    data: { name: nombreUnico('Segundo tablero') },
  });
  expect(respuesta.status(), 'Crear el segundo tablero').toBe(201);
  const boardId = (await data<{ id: string }>(respuesta)).id;

  const columnas: { id: string; name: string }[] = [];
  for (const [indice, nombre] of ['Pendiente', 'Listo'].entries()) {
    const columna = await request.post(`/api/boards/${boardId}/columns`, {
      headers: cabeceras,
      data: { name: nombre, order: indice },
    });
    expect(columna.status(), `Crear columna «${nombre}»`).toBe(201);
    columnas.push(await data(columna));
  }

  return { boardId, columnas };
}

test.describe('La columna destino tiene que ser del tablero de la tarea', () => {
  test('mover a la columna de otro proyecto se rechaza', async ({ request }) => {
    const propio = await crearMundo(request);
    /* Dos mundos completos: cada `crearMundo` registra su propia cuenta, así que
       el segundo proyecto es de otra persona y de otro tablero a la vez. */
    const ajeno = await crearMundo(request);

    const tarea = await crearTarea(request, propio.duenno.accessToken, propio);

    const respuesta = await request.post(`/api/tasks/${tarea.id}/move`, {
      headers: comoBearer(propio.duenno.accessToken),
      data: { columnId: ajeno.primeraColumna.id },
    });

    expect(
      respuesta.status(),
      'Una tarea movida fuera de su tablero desaparece de la vista sin poder recuperarse',
    ).toBe(400);
    expect((await respuesta.json()).error.message).toContain(FUERA_DE_TABLERO);
  });

  test('tampoco a otro tablero del mismo proyecto', async ({ request }) => {
    const mundo = await crearMundo(request);
    const otro = await segundoTablero(request, mundo);

    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);

    /* El caso que no cruza ninguna frontera de permisos: el dueño puede tocar
       los dos tableros, y aun así la tarea no puede estar en el otro. Es lo que
       demuestra que esto no es una comprobación de acceso disfrazada. */
    const respuesta = await request.post(`/api/tasks/${tarea.id}/move`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: { columnId: otro.columnas[0].id },
    });

    expect(respuesta.status()).toBe(400);
    expect((await respuesta.json()).error.message).toContain(FUERA_DE_TABLERO);
  });

  test('una tarea no puede nacer ya fuera de sitio', async ({ request }) => {
    const mundo = await crearMundo(request);
    const otro = await segundoTablero(request, mundo);

    /* El tablero lo pone la ruta y la columna el cuerpo: sin comprobarlo, la
       tarea se crea con 201 y ya nace donde no se la puede ver. */
    const respuesta = await request.post(`/api/boards/${mundo.boardId}/tasks`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: { columnId: otro.columnas[0].id, title: nombreUnico('Tarea'), status: 'Pendiente' },
    });

    expect(respuesta.status()).toBe(400);
    expect((await respuesta.json()).error.message).toContain(FUERA_DE_TABLERO);
  });

  test('ni llegar ahí por el PATCH, que también mueve', async ({ request }) => {
    const mundo = await crearMundo(request);
    const otro = await segundoTablero(request, mundo);

    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);

    /* `PATCH /tasks/:id` acepta `columnId` además de la ruta de mover. Cerrar
       solo una de las dos deja la puerta de al lado abierta — es el mismo motivo
       por el que `resolveColumnChange` es una función compartida. */
    const respuesta = await request.patch(`/api/tasks/${tarea.id}`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: { columnId: otro.columnas[1].id },
    });

    expect(respuesta.status()).toBe(400);
    expect((await respuesta.json()).error.message).toContain(FUERA_DE_TABLERO);
  });

  test('una columna inventada es un 404, no un 400', async ({ request }) => {
    const mundo = await crearMundo(request);
    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);

    /* Distinguirlos importa: «no existe» y «existe pero no es de aquí» se
       arreglan de forma distinta, y confundirlos manda a buscar al sitio
       equivocado. */
    const respuesta = await request.post(`/api/tasks/${tarea.id}/move`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: { columnId: '00000000-0000-4000-8000-000000000000' },
    });

    expect(respuesta.status()).toBe(404);
  });
});

test.describe('Y la otra mitad: dentro del tablero se mueve igual que siempre', () => {
  test('mover entre columnas del propio tablero sigue funcionando', async ({ request }) => {
    const mundo = await crearMundo(request);
    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);

    const destino = mundo.columnas[1];
    const respuesta = await request.post(`/api/tasks/${tarea.id}/move`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: { columnId: destino.id },
    });

    expect(respuesta.status(), 'Una comprobación que cierra de más rompe el tablero').toBe(200);

    /* Contra el `data`, no contra el status: es la regla de la casa. */
    const movida = await data<{ columnId: string }>(respuesta);
    expect(movida.columnId).toBe(destino.id);
  });

  test('y el cierre en la columna verde se sigue registrando', async ({ request }) => {
    const mundo = await crearMundo(request);
    const cabeceras = comoBearer(mundo.duenno.accessToken);
    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);

    /**
     * ⚠️ **La «Hecho» del mundo no cierra nada.** Lo que marca la columna de
     * cierre es el **color verde**, no el nombre (`DONE_COLUMN_COLOR`), y
     * `crearMundo` crea sus columnas sin color explícito: `defaultColumnColor`
     * reparte por posición y **deja el verde fuera a propósito**, justo para no
     * marcar como terminada la cuarta columna de cualquier tablero. Así que aquí
     * hay que pintarla.
     */
    const respuestaColumna = await request.post(`/api/boards/${mundo.boardId}/columns`, {
      headers: cabeceras,
      data: { name: 'Entregado', order: 3, color: 'success' },
    });
    expect(respuestaColumna.status(), 'Crear la columna de cierre').toBe(201);
    const cierre = await data<{ id: string }>(respuestaColumna);

    /* Lo que se comprueba es que la validación nueva no se haya comido el camino
       que pone `completedAt`: sin él, la tarea llega a la columna verde y no
       cuenta en ningún tiempo de ciclo. */
    const respuesta = await request.post(`/api/tasks/${tarea.id}/move`, {
      headers: cabeceras,
      data: { columnId: cierre.id },
    });

    expect(respuesta.status()).toBe(200);
    const cerrada = await data<{ columnId: string; completedAt: string | null }>(respuesta);
    expect(cerrada.columnId).toBe(cierre.id);
    expect(
      cerrada.completedAt,
      'Mover a la columna verde tiene que cerrar la tarea',
    ).not.toBeNull();
  });
});
