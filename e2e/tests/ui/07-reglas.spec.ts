import {
  type APIRequestContext,
  type Locator,
  type Page,
  request as contextoDePeticion,
  expect,
  test,
} from '@playwright/test';
import { comoBearer, entrarComoAdmin, nombreUnico, registrar } from '../../fixtures/api';
import { crearMundo, crearTarea, darDeAlta } from '../../fixtures/mundo';
import { entrarConCuenta } from '../../fixtures/ui';

/**
 * El apartado Reglas de un proyecto (Bloque 3 del plan de Reglas).
 *
 * ## Por qué esto y no solo la prueba de API
 *
 * `api/17-automatizaciones.spec.ts` ya prueba el contrato: que las
 * rutas validan, que la revisión no duplica avisos. Lo que no prueba es que la
 * **pantalla** siga pintándose — un `ProjectRules` que rompiera la frontera
 * servidor/cliente, un `describeRule` que lanzara con una regla real, o el
 * alias de la pestaña vieja mal resuelto no los detecta ningún tipo ni ningún
 * test unitario: solo pedir la página de verdad.
 *
 * Cada caso monta su propio mundo por API y solo usa el navegador para la
 * parte que hay que ver — el mismo patrón que `05-equipo` y `06-chat-zona`.
 */

/*
 * ⚠️ **Las tarjetas y los mensajes se buscan por rol, nunca con `locator('li')`
 * ni con un `getByText` suelto.** Al cargar la página entera, React hace
 * streaming: el contenido llega primero dentro de un `<div hidden id="S:n">` y
 * durante unos milisegundos convive con la copia ya revelada. El modo estricto
 * de Playwright cuenta los dos nodos y falla **sin reintentar**, así que la
 * prueba se pone roja o verde según el reloj. `getByRole` excluye lo oculto.
 */
async function apiContext(): Promise<APIRequestContext> {
  return contextoDePeticion.newContext({
    baseURL: process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000',
  });
}

/**
 * Deja una tarea candidata a `TASK_DUE_SOON`: vence mañana, prioridad alta y
 * con el dueño como responsable — el mismo montaje que
 * `api/17-automatizaciones.spec.ts` usa para el mismo trigger.
 */
async function crearCandidataDeVencimiento(
  api: APIRequestContext,
  mundo: Awaited<ReturnType<typeof crearMundo>>,
) {
  const cabeceras = comoBearer(mundo.duenno.accessToken);
  const tarea = await crearTarea(api, mundo.duenno.accessToken, mundo);

  const manana = new Date();
  manana.setUTCDate(manana.getUTCDate() + 1);
  const actualizacion = await api.patch(`/api/tasks/${tarea.id}`, {
    headers: cabeceras,
    data: { dueDate: manana.toISOString(), priority: 'HIGH' },
  });
  expect(actualizacion.status(), 'Preparar fecha y prioridad de la tarea').toBe(200);

  const asignacion = await api.post(`/api/tasks/${tarea.id}/assign`, {
    headers: cabeceras,
    data: { assigneeIds: [mundo.duenno.userId] },
  });
  expect(asignacion.status(), 'Asignar la tarea que recibirá el aviso').toBe(200);

  return tarea;
}

/**
 * Rellena lo mínimo que el constructor exige para poder guardar.
 *
 * ⚠️ **«A quién» no tiene valor por defecto, y antes ni se elegía.** El
 * destinatario del aviso salía del disparador; desde que el motivo lo pone el
 * disparador y el destinatario la regla —son dos cosas distintas—, hay que
 * elegirlo, y sin hacerlo el formulario responde «Avisar: falta «A quién».» y
 * no envía nada. Las pruebas que solo ponían el nombre se quedaban esperando
 * una regla que el servidor nunca llegó a ver.
 *
 * Las opciones se buscan en `page` y no en el panel: el desplegable las pinta
 * fuera, al final del documento.
 */
async function rellenarReglaMinima(page: Page, panel: Locator, nombre: string): Promise<void> {
  await panel.getByLabel('Nombre', { exact: true }).fill(nombre);
  await panel.getByRole('combobox', { name: 'A quién' }).click();
  await page.getByRole('option', { name: 'Los encargados de la tarea' }).click();
}

/**
 * Lo que se espera a que aparezca **después de guardar**.
 *
 * ⚠️ No es holgura por si acaso. Guardar una regla es una Server Function que
 * pasa por el gateway y el servicio, revalida la ruta y repinta la página
 * entera en modo desarrollo; con las 25 pruebas seguidas sobre el mismo
 * servidor, eso pasa de sobra de los 10 s de serie. Se ve claro en el síntoma:
 * las mismas pruebas ejecutadas sueltas guardan en menos de dos segundos.
 */
const ESPERA_TRAS_GUARDAR = { timeout: 30_000 };

test.describe('Reglas del proyecto', () => {
  /**
   * ⚠️ **Calienta la ruta `/projects/[id]` antes de medir nada.**
   *
   * En `next dev` la primera visita a una ruta la compila sobre la marcha —
   * decenas de segundos en una máquina cargada—, y el proxy del shell entre
   * la aplicación corta la conexión antes de que termine.
   * Sin esto, el primer test de la tanda paga esa compilación entera y puede
   * agotar su propio timeout por algo que no tiene nada que ver con Reglas.
   * El resultado se descarta a propósito: solo importa que Turbopack haya
   * terminado, no si esta petición en concreto tuvo éxito.
   */
  test.beforeAll(async ({ request }) => {
    await request.get('/projects/calentar-turbopack', { timeout: 60_000 }).catch(() => {});
  });

  test('la pestaña se llama Automatizaciones y se llega desde la barra de secciones', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}`);

    await page
      .getByRole('navigation', { name: 'Secciones del proyecto' })
      .getByRole('link', { name: 'Automatizaciones' })
      .click();

    /* ⚠️ 30 s, y solo aquí: **la primera prueba de la tanda paga la compilación
       de `/projects/[id]`**. El calentamiento del `beforeAll` pide una ruta que
       no existe, así que Turbopack compila el árbol común pero no esta página;
       si alguien acaba de tocar un componente del proyecto, la primera visita
       se queda en «Cargando» bastante más de los 10 s de serie. */
    await expect(page.getByRole('heading', { name: 'Reglas', exact: true })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('un enlace viejo con ?tab=automatizaciones sigue aterrizando en la pestaña', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=automatizaciones`);

    /* ⚠️ 30 s, y solo aquí: **la primera prueba de la tanda paga la compilación
       de `/projects/[id]`**. El calentamiento del `beforeAll` pide una ruta que
       no existe, así que Turbopack compila el árbol común pero no esta página;
       si alguien acaba de tocar un componente del proyecto, la primera visita
       se queda en «Cargando» bastante más de los 10 s de serie. */
    await expect(page.getByRole('heading', { name: 'Reglas', exact: true })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('sin reglas se ve el estado vacío, no solo «no hay nada»', async ({ page }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await expect(page.getByText('Aún no hay reglas.', { exact: false })).toBeVisible();
  });

  test('con una regla creada desde el constructor, se ve su nombre y el resumen de su definición', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await page.getByRole('button', { name: 'Nueva regla' }).click();
    const nombreRegla = nombreUnico('Avisar vencimiento').slice(0, 120);
    await rellenarReglaMinima(page, page.getByRole('form', { name: 'Nueva regla' }), nombreRegla);
    await page.getByRole('button', { name: 'Crear regla' }).click();

    /* `exact: true`: el nombre de la regla vuelve a salir dentro de frases más
       largas —la de `describeRule`, y la confirmación de borrado en cuanto se
       pulsa—, y sin `exact` el texto de sobra las hace coincidir igual. */
    await expect(page.getByText(nombreRegla, { exact: true })).toBeVisible(ESPERA_TRAS_GUARDAR);
    /* `describeRule` describe el trigger por defecto del constructor
       (`TASK_DUE_SOON`) en una frase legible, no solo el identificador técnico. */
    await expect(page.getByText(/Cuando una tarea esté a punto de vencer/)).toBeVisible();
  });

  test('crear una regla con una condición de prioridad, y verla en el resumen (Bloque 5)', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await page.getByRole('button', { name: 'Nueva regla' }).click();
    const nombreRegla = nombreUnico('Vencimiento con condición').slice(0, 120);
    await rellenarReglaMinima(page, page.getByRole('form', { name: 'Nueva regla' }), nombreRegla);

    await page.getByRole('button', { name: 'Añadir condición' }).click();
    /* El campo por defecto de una fila nueva ya es «prioridad» — el primero
       del catálogo de TASK_DUE_SOON —, así que solo hace falta elegir el valor.

       ⚠️ **Y el desplegable del valor no se llama «Valor»**: lleva por rótulo el
       campo que se está comparando —«Prioridad»— y el nombre accesible arrastra
       además lo ya elegido («Prioridad Elige…»), de ahí la expresión regular. */
    await page.getByRole('combobox', { name: /^Prioridad/ }).click();
    await page.getByRole('option', { name: 'Alta' }).click();

    await page.getByRole('button', { name: 'Crear regla' }).click();

    const tarjeta = page.getByRole('listitem').filter({ hasText: nombreRegla });
    await expect(tarjeta).toBeVisible(ESPERA_TRAS_GUARDAR);
    await expect(
      tarjeta.getByText(/Cuando una tarea esté a punto de vencer, si prioridad es Alta/),
    ).toBeVisible();
    /* Y las condiciones también sueltas, debajo: la frase de arriba las lleva
       encadenadas y con dos o tres hay que leerla entera para saber cuándo
       salta la regla. */
    await expect(tarjeta.getByText('Se activa si prioridad es Alta')).toBeVisible();
  });

  test('una regla sin condiciones lo dice en la tarjeta, en vez de callarse', async ({ page }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    const nombreRegla = nombreUnico('Sin condiciones').slice(0, 120);
    const alta = await api.post(`/api/projects/${mundo.proyecto.id}/automations`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: {
        name: nombreRegla,
        status: 'DISABLED',
        trigger: { type: 'TASK_DUE_SOON', config: { leadTimeMinutes: 60 } },
        conditions: [],
        actions: [{ type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'ASSIGNEES' } }],
      },
    });
    expect(alta.status(), 'Crear la regla sin condiciones').toBe(201);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: nombreRegla })
        .getByText('Sin condiciones: actúa sobre toda tarea que encaje con el disparador.'),
    ).toBeVisible();
  });

  /**
   * El constructor arrastraba el borrador de la regla anterior.
   *
   * Hallazgo §3 del informe de revisión del Bloque 7. El formulario sembraba el
   * borrador con un *initializer* de `useState`, que solo corre en el montaje,
   * y el componente no se desmontaba: no llevaba `key` y su posición en el
   * árbol no cambiaba. Cerrarlo no lo reiniciaba, así que la segunda regla de
   * una sesión partía del nombre y las condiciones de la primera.
   *
   * ⚠️ **Se localiza acotando al panel abierto** y no con
   * `page.getByLabel('Nombre')` a secas: el panel de edición de una regla trae
   * su propio campo «Nombre», y con los dos desplegados el locator suelto
   * resuelve a dos elementos.
   */
  test('el constructor se reinicia al reabrirlo tras crear (corrección C1)', async ({ page }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await page.getByRole('button', { name: 'Nueva regla' }).click();
    const panel = page.getByRole('form', { name: 'Nueva regla' });
    const nombreRegla = nombreUnico('Primera').slice(0, 120);
    await rellenarReglaMinima(page, panel, nombreRegla);
    await page.getByRole('button', { name: 'Añadir condición' }).click();
    await page.getByRole('combobox', { name: /^Prioridad/ }).click();
    await page.getByRole('option', { name: 'Alta' }).click();
    await page.getByRole('button', { name: 'Crear regla' }).click();

    await expect(page.getByText(nombreRegla, { exact: true })).toBeVisible(ESPERA_TRAS_GUARDAR);

    await page.getByRole('button', { name: 'Nueva regla' }).click();
    await expect(panel.getByLabel('Nombre', { exact: true })).toHaveValue('');
    /* ⚠️ **«Quitar» a secas ya no vale**: el nombre accesible se compara por
       trozo y sin distinguir mayúsculas, y dos disparadores lo llevan dentro de
       su explicación —«Al asignar o quitar a alguien», «Al poner, quitar o
       mover la fecha»—. El botón de la fila se llama «Quitar la condición
       sobre …». */
    await expect(panel.getByRole('button', { name: /^Quitar la condición/ })).toHaveCount(0);
    /* Y sin marcar el campo en rojo: el diálogo está vacío porque acaba de
       abrirse, no porque alguien lo haya dejado mal. */
    await expect(panel.getByText('El nombre debe tener al menos 2 caracteres.')).toHaveCount(0);
  });

  test('el panel de edición sigue precargando su propia regla al reabrirlo (corrección C1)', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    const nombreRegla = nombreUnico('Precargada').slice(0, 120);
    const alta = await api.post(`/api/projects/${mundo.proyecto.id}/automations`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: {
        name: nombreRegla,
        status: 'DISABLED',
        trigger: { type: 'TASK_DUE_SOON', config: { leadTimeMinutes: 60 } },
        conditions: [{ field: 'priority', operator: 'EQUALS', value: 'LOW' }],
        actions: [{ type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'ASSIGNEES' } }],
      },
    });
    expect(alta.status(), 'Crear la regla a editar').toBe(201);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    const tarjeta = page.getByRole('listitem').filter({ hasText: nombreRegla });
    const panel = page.getByRole('form', { name: `Editar «${nombreRegla}»` });

    await tarjeta.getByRole('button', { name: 'Editar' }).click();
    await expect(panel.getByLabel('Nombre', { exact: true })).toHaveValue(nombreRegla);

    /* Cancelar y volver: el reinicio al abrir tiene que recalcular la regla,
       no vaciar el formulario como hace el de creación. */
    await panel.getByRole('button', { name: 'Cancelar' }).click();
    await tarjeta.getByRole('button', { name: 'Editar' }).click();
    await expect(panel.getByLabel('Nombre', { exact: true })).toHaveValue(nombreRegla);
    await expect(panel.getByRole('button', { name: /^Quitar la condición/ })).toHaveCount(1);
  });

  /**
   * El nombre del campo de una condición se lee entero.
   *
   * La fila son tres campos y un botón «Quitar» en la misma línea, y el
   * nombre más largo del catálogo —«Número de encargados»— no cabía: el
   * `Select` lo truncaba a «Número de re…» y la condición dejaba de poder
   * leerse. Se arregló ensanchando el diálogo y repartiendo las columnas por
   * lo que mide cada una, no a tercios.
   *
   * Se mide `scrollWidth` contra `clientWidth` en vez de comparar contra un
   * ancho fijo: es la pregunta que importa —«¿cabe?»— y no se rompe si
   * mañana cambia la tipografía o el espaciado.
   */
  test('el nombre del campo de una condición no se trunca', async ({ page }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await page.getByRole('button', { name: 'Nueva regla' }).click();
    /**
     * ⚠️ **Se espera al catálogo antes de tocar nada dentro del panel.**
     *
     * El panel dibuja «Añadir condición» de inmediato, pero los campos que una
     * condición puede usar salen del catálogo que pide por API. Un clic en esa
     * ventana añade una fila sin metadatos, y cuando el catálogo aterriza el
     * panel reinicializa su estado y la fila desaparece: el fallo sale como un
     * timeout esperando el desplegable de una condición que sí se pidió, y no
     * menciona el catálogo por ningún lado.
     *
     * «Margen de aviso» es la señal porque **es** catálogo: es el campo de
     * configuración del disparador por defecto, así que no existe hasta que ha
     * llegado. Las demás pruebas de este archivo se libran por casualidad —
     * `rellenarReglaMinima` gasta tres interacciones antes de llegar aquí—.
     */
    await expect(page.getByRole('spinbutton', { name: /^Margen de aviso/ })).toBeVisible();
    await page.getByRole('button', { name: 'Añadir condición' }).click();
    /* Y se confirma que la fila está: si el clic se pierde otra vez, el fallo
       lo dice aquí en vez de tres líneas más abajo hablando de un combobox. */
    await expect(page.getByRole('combobox', { name: 'Campo' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Campo' }).click();
    await page.getByRole('option', { name: 'Número de encargados' }).click();

    const etiqueta = page.getByRole('combobox', { name: 'Campo' }).locator('span').first();
    for (const ancho of [1280, 900, 768]) {
      await page.setViewportSize({ width: ancho, height: 900 });
      const cabe = await etiqueta.evaluate((el) => el.scrollWidth <= el.clientWidth);
      expect(cabe, `«Número de encargados» se trunca con el viewport en ${ancho}px`).toBe(true);
    }
  });

  /**
   * Los operadores que se ofrecen salen del catálogo del servidor.
   *
   * ⚠️ **Esta prueba comprobaba otra cosa y ya no se puede comprobar.** Miraba
   * que «es alguno de» sobre un campo entero dejara escribir la lista a mano,
   * con sus comas —el campo se controlaba desde el JSON ya parseado y la coma
   * recién tecleada desaparecía—. Pero desde que el catálogo manda, `IN` solo
   * existe sobre `enum` y `uuid`, y los dos se eligen con casillas: **ningún
   * campo del catálogo ofrece hoy esa caja de texto**, así que la prueba
   * esperaba para siempre una opción que ya no está en la lista.
   *
   * Lo que sí importa fijar es lo que hay debajo de aquello: que la fila de
   * condición ofrece **los operadores del campo**, no una lista escrita a mano
   * en el cliente. Si alguien vuelve a quemarla, esto lo dice.
   */
  test('los operadores de una condición son los que el catálogo da a ese campo', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await page.getByRole('button', { name: 'Nueva regla' }).click();
    /**
     * ⚠️ **Se espera al catálogo antes de tocar nada dentro del panel.**
     *
     * El panel dibuja «Añadir condición» de inmediato, pero los campos que una
     * condición puede usar salen del catálogo que pide por API. Un clic en esa
     * ventana añade una fila sin metadatos, y cuando el catálogo aterriza el
     * panel reinicializa su estado y la fila desaparece: el fallo sale como un
     * timeout esperando el desplegable de una condición que sí se pidió, y no
     * menciona el catálogo por ningún lado.
     *
     * «Margen de aviso» es la señal porque **es** catálogo: es el campo de
     * configuración del disparador por defecto, así que no existe hasta que ha
     * llegado. Las demás pruebas de este archivo se libran por casualidad —
     * `rellenarReglaMinima` gasta tres interacciones antes de llegar aquí—.
     */
    await expect(page.getByRole('spinbutton', { name: /^Margen de aviso/ })).toBeVisible();
    await page.getByRole('button', { name: 'Añadir condición' }).click();
    /* Y se confirma que la fila está: si el clic se pierde otra vez, el fallo
       lo dice aquí en vez de tres líneas más abajo hablando de un combobox. */
    await expect(page.getByRole('combobox', { name: 'Campo' })).toBeVisible();

    /* «Prioridad» es un enum: comparaciones de igualdad y pertenencia, sin
       mayor/menor. */
    await page.getByRole('combobox', { name: 'Operador' }).click();
    await expect(page.getByRole('option', { name: 'es alguno de' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'es mayor que' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    /* «Número de encargados» es entero: mayor, menor y sus variantes, y ninguna
       de pertenencia. */
    await page.getByRole('combobox', { name: 'Campo' }).click();
    await page.getByRole('option', { name: 'Número de encargados' }).click();
    await page.getByRole('combobox', { name: 'Operador' }).click();
    await expect(page.getByRole('option', { name: 'es mayor que' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'es alguno de' })).toHaveCount(0);
  });

  /**
   * Una condición de cada tipo de valor del catálogo, guardada de verdad.
   *
   * ⚠️ **Esta es la laguna que dejó pasar el fallo más gordo del apartado.**
   * Había una sola prueba de condiciones y era de prioridad —un enum—, que
   * resultó ser de los dos únicos tipos que funcionaban. `ConditionsSection`
   * guardaba el texto crudo del campo y `validateAutomationDraft` exige el
   * valor ya coaccionado, así que **enteros, booleanos y listas no se podían
   * guardar**: los frenaba la validación de cliente. Los enum y las fechas
   * colaban porque se validan como texto.
   *
   * Una prueba por `kind` del catálogo, más los dos aspectos de `IN`.
   */
  test('una condición de cada tipo de valor se guarda y se lee en el resumen', async ({ page }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    const seccionSi = page.getByRole('group', { name: 'Si' });

    /* ── entero: assigneeCount es igual a 2 ───────────────────────────── */
    await page.getByRole('button', { name: 'Nueva regla' }).click();
    const panel = page.getByRole('form', { name: 'Nueva regla' });
    const nombreEntero = nombreUnico('Entero').slice(0, 120);
    await rellenarReglaMinima(page, panel, nombreEntero);
    await page.getByRole('button', { name: 'Añadir condición' }).click();
    await page.getByRole('combobox', { name: 'Campo' }).click();
    await page.getByRole('option', { name: 'Número de encargados' }).click();
    await seccionSi.getByRole('spinbutton').fill('2');
    await page.getByRole('button', { name: 'Crear regla' }).click();
    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: nombreEntero })
        .getByText(/Cuando una tarea esté a punto de vencer, si número de encargados es 2/),
    ).toBeVisible(ESPERA_TRAS_GUARDAR);

    /* ── booleano: overdue es igual a sí ──────────────────────────────── */
    await page.getByRole('button', { name: 'Nueva regla' }).click();
    const nombreBooleano = nombreUnico('Booleano').slice(0, 120);
    await rellenarReglaMinima(page, panel, nombreBooleano);
    /* El disparador dejó de ser un desplegable: son botones con su
       explicación debajo, así que el nombre accesible lleva las dos frases. */
    await page.getByRole('button', { name: /^Una tarea lleva parada/ }).click();
    await page.getByRole('button', { name: 'Añadir condición' }).click();
    await page.getByRole('combobox', { name: 'Campo' }).click();
    await page.getByRole('option', { name: 'Está vencida' }).click();
    await page.getByRole('combobox', { name: /^Está vencida/ }).click();
    await page.getByRole('option', { name: 'Sí', exact: true }).click();
    await page.getByRole('button', { name: 'Crear regla' }).click();
    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: nombreBooleano })
        .getByText(/Cuando una tarea lleve demasiado tiempo sin moverse, si está vencida es sí/),
    ).toBeVisible(ESPERA_TRAS_GUARDAR);

    /* ── fecha: dueDate es igual a una fecha ──────────────────────────── */
    await page.getByRole('button', { name: 'Nueva regla' }).click();
    const nombreFecha = nombreUnico('Fecha').slice(0, 120);
    await rellenarReglaMinima(page, panel, nombreFecha);
    await page.getByRole('button', { name: 'Añadir condición' }).click();
    await page.getByRole('combobox', { name: 'Campo' }).click();
    await page.getByRole('option', { name: 'Fecha de vencimiento' }).click();
    /* `SelectorDeFecha` no es un `<input type="date">`: dibuja su propio
       calendario para no depender del que pinte cada navegador. Se elige el
       día 15 del mes visible, que existe siempre. */
    /* Con el nombre entero y `exact`: «Fecha» a secas casa también con el botón
       de quitar la fila, que se llama «Quitar la condición sobre Fecha de
       vencimiento». */
    await seccionSi.getByRole('button', { name: 'Fecha de vencimiento', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Elegir fecha' })
      .getByRole('button', { name: '15', exact: true })
      .click();
    /* La fecha elegida se lee del campo oculto en vez de fijarla en la
       prueba: lo que se comprueba es que **ese** valor llega entero hasta el
       resumen, no que el calendario abra en un mes concreto. */
    const fechaElegida = await seccionSi
      .locator('input[type="hidden"][name="conditionValue"]')
      .inputValue();
    expect(fechaElegida, 'El selector de fecha no llenó el campo oculto').toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    await page.getByRole('button', { name: 'Crear regla' }).click();
    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: nombreFecha })
        .getByText(
          new RegExp(
            `Cuando una tarea esté a punto de vencer, si fecha de vencimiento es ${fechaElegida}`,
          ),
        ),
    ).toBeVisible(ESPERA_TRAS_GUARDAR);

    /* ── enum con IN: por casillas ────────────────────────────────────── */
    await page.getByRole('button', { name: 'Nueva regla' }).click();
    const nombreLista = nombreUnico('Casillas').slice(0, 120);
    await rellenarReglaMinima(page, panel, nombreLista);
    await page.getByRole('button', { name: 'Añadir condición' }).click();
    await page.getByRole('combobox', { name: 'Operador' }).click();
    await page.getByRole('option', { name: 'es alguno de' }).click();
    /* `force`: la casilla va `sr-only` —un píxel— y lo que recibe el clic es el
       cuadro dibujado al lado. */
    await seccionSi.getByRole('checkbox', { name: 'Alta' }).check({ force: true });
    await seccionSi.getByRole('checkbox', { name: 'Urgente' }).check({ force: true });
    await page.getByRole('button', { name: 'Crear regla' }).click();
    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: nombreLista })
        .getByText(
          /Cuando una tarea esté a punto de vencer, si prioridad es alguno de Alta, Urgente/,
        ),
    ).toBeVisible(ESPERA_TRAS_GUARDAR);
  });

  test('editar una regla existente actualiza su resumen (Bloque 5)', async ({ page }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    const nombreRegla = nombreUnico('Editar esta').slice(0, 120);
    const alta = await api.post(`/api/projects/${mundo.proyecto.id}/automations`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: {
        name: nombreRegla,
        status: 'DISABLED',
        trigger: { type: 'TASK_DUE_SOON', config: { leadTimeMinutes: 60 } },
        conditions: [{ field: 'priority', operator: 'EQUALS', value: 'LOW' }],
        actions: [{ type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'ASSIGNEES' } }],
      },
    });
    expect(alta.status(), 'Crear la regla a editar').toBe(201);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    const tarjeta = page.getByRole('listitem').filter({ hasText: nombreRegla });
    await expect(
      tarjeta.getByText(/Cuando una tarea esté a punto de vencer, si prioridad es Baja/),
    ).toBeVisible();

    await tarjeta.getByRole('button', { name: 'Editar' }).click();
    /* Una sola fila de condición, precargada por `draftFromRule`: cambia su
       valor de «Baja» a «Urgente». */
    await page.getByRole('combobox', { name: /^Prioridad/ }).click();
    await page.getByRole('option', { name: 'Urgente' }).click();
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(
      tarjeta.getByText(/Cuando una tarea esté a punto de vencer, si prioridad es Urgente/),
    ).toBeVisible(ESPERA_TRAS_GUARDAR);
  });

  test('cambiar de trigger avisa y descarta las condiciones ya configuradas (Bloque 5)', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await page.getByRole('button', { name: 'Nueva regla' }).click();
    await page.getByRole('button', { name: 'Añadir condición' }).click();
    await expect(page.getByRole('button', { name: /^Quitar la condición/ })).toHaveCount(1);

    /* ⚠️ Esto esperaba un `confirm()` del navegador. Ya no lo hay —los diálogos
       del sistema se retiraron (D4)—, pero el aviso sigue: se cuenta **después**
       y dentro del formulario, con las condiciones ya descartadas a la vista. */
    /* El disparador dejó de ser un desplegable: son botones con su
       explicación debajo, así que el nombre accesible lleva las dos frases. */
    await page.getByRole('button', { name: /^Una tarea lleva parada/ }).click();

    await expect(page.getByRole('button', { name: /^Quitar la condición/ })).toHaveCount(0);
    await expect(page.getByText(/Se descartó la condición que tenías/)).toBeVisible();
    /* ⚠️ Aquí se comprobaba además que **el destinatario cambiaba con el
       disparador**. Ya no: el motivo del aviso sale del disparador y el
       destinatario lo elige la regla, así que cambiar de disparador no toca lo
       que hay en «Entonces» — que es justo lo que dice el aviso de arriba sobre
       las condiciones, y solo sobre las condiciones. */
  });

  test('el nombre vacío marca el campo y no envía (Bloque 5)', async ({ page }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await page.getByRole('button', { name: 'Nueva regla' }).click();
    await page.getByRole('button', { name: 'Crear regla' }).click();

    await expect(page.getByText('El nombre debe tener al menos 2 caracteres.')).toBeVisible(
      ESPERA_TRAS_GUARDAR,
    );
    /* El panel sigue abierto: no se perdió lo que ya había en el formulario. */
    await expect(page.getByRole('form', { name: 'Nueva regla' })).toBeVisible();
  });

  /**
   * Cerrar con cambios sin guardar pregunta antes — Bloque 7, ítem 4, y la
   * otra mitad del riesgo «sin perder silenciosamente lo editado».
   *
   * ⚠️ **Solo desde «Cancelar».** `Esc`, la `X` y el clic en el fondo entran
   * por el `onClose` del `Dialog` de commons, que también recibe el cierre
   * programático de después de guardar y no los distingue — colgar la guarda
   * de ahí hacía preguntar sobre un guardado correcto. El motivo entero está
   * en `RuleDialog.intentarCerrar`.
   */
  test('cerrar con cambios sin guardar pregunta, y al rechazar no se pierde nada (corrección C2)', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await page.getByRole('button', { name: 'Nueva regla' }).click();
    const panel = page.getByRole('form', { name: 'Nueva regla' });
    const nombreRegla = nombreUnico('A medio escribir').slice(0, 120);
    await panel.getByLabel('Nombre', { exact: true }).fill(nombreRegla);

    /* La pregunta ya no es una ventana del sistema: aparece en el pie, donde
       estaba el botón, con el formulario entero todavía a la vista. */
    await panel.getByRole('button', { name: 'Cancelar' }).click();
    await expect(panel.getByText('Tienes cambios sin guardar. ¿Los descarto?')).toBeVisible();

    await panel.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(panel.getByLabel('Nombre', { exact: true })).toHaveValue(nombreRegla);

    await panel.getByRole('button', { name: 'Cancelar' }).click();
    await panel.getByRole('button', { name: 'Descartar' }).click();
    await expect(panel).toBeHidden();
  });

  test('cerrar sin haber tocado nada no pregunta (corrección C2)', async ({ page }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await page.getByRole('button', { name: 'Nueva regla' }).click();
    const panel = page.getByRole('form', { name: 'Nueva regla' });
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Cancelar' }).click();

    await expect(panel).toBeHidden();
    await expect(
      page.getByText('Tienes cambios sin guardar. ¿Los descarto?'),
      'Cerrar un formulario intacto no debería preguntar nada',
    ).toHaveCount(0);
  });

  test('guardar correctamente cierra el panel sin preguntar (corrección C2)', async ({ page }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await page.getByRole('button', { name: 'Nueva regla' }).click();
    const panel = page.getByRole('form', { name: 'Nueva regla' });
    const nombreRegla = nombreUnico('Guardada sin preguntar').slice(0, 120);
    await rellenarReglaMinima(page, panel, nombreRegla);
    await page.getByRole('button', { name: 'Crear regla' }).click();

    await expect(page.getByText(nombreRegla, { exact: true })).toBeVisible(ESPERA_TRAS_GUARDAR);
    await expect(panel).toBeHidden();
    await expect(
      page.getByText('Tienes cambios sin guardar. ¿Los descarto?'),
      'Un guardado correcto no pierde nada, así que no pregunta',
    ).toHaveCount(0);
  });

  test('un error del servidor se ve dentro del panel, sin cerrarlo ni perder lo escrito (Bloque 5)', async ({
    page,
  }) => {
    /* No hay ninguna combinación que la interfaz ofrezca y que el servidor
       rechace con 400 — ese es justo el criterio de finalización del
       Bloque 5. El error de servidor reproducible desde un diálogo ya
       relleno es la suspensión del proyecto a media edición, y ejercita
       exactamente el mismo camino: `state.error` dentro del `Dialog`,
       sin cerrarlo ni perder el nombre ya escrito. */
    const api = await apiContext();
    const mundo = await crearMundo(api);
    const admin = await entrarComoAdmin(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await page.getByRole('button', { name: 'Nueva regla' }).click();
    const nombreRegla = nombreUnico('Se pierde con la suspensión').slice(0, 120);
    /* Con el destinatario puesto: sin él ni siquiera se llegaría al servidor,
       y lo que esta prueba mira es el error que **manda el servidor**. */
    await rellenarReglaMinima(page, page.getByRole('form', { name: 'Nueva regla' }), nombreRegla);

    const suspension = await contextoDePeticion.newContext({
      baseURL: process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000',
    });
    const respuesta = await suspension.patch(`/api/admin/projects/${mundo.proyecto.id}/status`, {
      headers: comoBearer(admin.accessToken),
      data: { status: 'SUSPENDED', reason: 'Prueba de error de servidor en el diálogo' },
    });
    expect(respuesta.status()).toBe(200);
    await suspension.dispose();

    await page.getByRole('button', { name: 'Crear regla' }).click();

    await expect(
      page.getByText(
        'El proyecto está suspendido: no se pueden crear ni editar reglas mientras tanto.',
      ),
    ).toBeVisible(ESPERA_TRAS_GUARDAR);
    await expect(page.getByRole('form', { name: 'Nueva regla' })).toBeVisible();
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(nombreRegla);
  });

  test('activar y desactivar una regla actualiza su estado (Bloque 4)', async ({ page }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await page.getByRole('button', { name: 'Nueva regla' }).click();
    const nombreRegla = nombreUnico('Alternar estado').slice(0, 120);
    await rellenarReglaMinima(page, page.getByRole('form', { name: 'Nueva regla' }), nombreRegla);
    /* El borrador nace en DISABLED —igual que el valor por defecto del
       servidor cuando se omite `status`, ver `emptyDraft` en el Bloque 2—,
       así que hay que marcar el checkbox para partir de «Activa». */
    /* `force`: la casilla va `peer sr-only` y quien recibe el clic es el cuadro
       dibujado al lado. */
    await page.getByLabel('Activar la regla al guardar').check({ force: true });
    await page.getByRole('button', { name: 'Crear regla' }).click();

    const tarjeta = page.getByRole('listitem').filter({ hasText: nombreRegla });
    await expect(tarjeta).toBeVisible(ESPERA_TRAS_GUARDAR);
    await expect(tarjeta.getByText('Activa', { exact: true })).toBeVisible();

    await tarjeta.getByRole('button', { name: 'Desactivar' }).click();
    await expect(tarjeta.getByText('Inactiva', { exact: true })).toBeVisible();

    await tarjeta.getByRole('button', { name: 'Activar' }).click();
    await expect(tarjeta.getByText('Activa', { exact: true })).toBeVisible();
  });

  test('eliminar una regla pide confirmación, y al cancelar sigue ahí (Bloque 4)', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await page.getByRole('button', { name: 'Nueva regla' }).click();
    const nombreRegla = nombreUnico('Eliminar esta').slice(0, 120);
    await rellenarReglaMinima(page, page.getByRole('form', { name: 'Nueva regla' }), nombreRegla);
    await page.getByRole('button', { name: 'Crear regla' }).click();

    const tarjeta = page.getByRole('listitem').filter({ hasText: nombreRegla });
    await expect(tarjeta).toBeVisible(ESPERA_TRAS_GUARDAR);

    /* La confirmación ya no es una ventana aparte: sale en la propia fila, con
       la regla —y su nombre— todavía delante. */
    await tarjeta.getByRole('button', { name: 'Eliminar' }).click();
    await expect(tarjeta.getByText(`¿Eliminar «${nombreRegla}»?`)).toBeVisible();
    await tarjeta.getByRole('button', { name: 'No', exact: true }).click();
    await expect(tarjeta).toBeVisible();

    await tarjeta.getByRole('button', { name: 'Eliminar' }).click();
    await tarjeta.getByRole('button', { name: 'Sí, eliminar' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: nombreRegla })).toHaveCount(0);
  });

  test('con una regla habilitada y una candidata, «Revisar ahora» muestra el resumen y una segunda revisión no duplica la fila (Bloque 6)', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await crearCandidataDeVencimiento(api, mundo);

    const nombreRegla = nombreUnico('Revisión con aviso').slice(0, 120);
    const alta = await api.post(`/api/projects/${mundo.proyecto.id}/automations`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: {
        name: nombreRegla,
        status: 'ENABLED',
        trigger: { type: 'TASK_DUE_SOON', config: { leadTimeMinutes: 4320 } },
        conditions: [{ field: 'priority', operator: 'EQUALS', value: 'HIGH' }],
        actions: [{ type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'ASSIGNEES' } }],
      },
    });
    expect(alta.status(), 'Crear y habilitar la regla').toBe(201);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await page.getByRole('button', { name: 'Revisar ahora' }).click();
    /**
     * ⚠️ **Se comprueba la fila, no el resumen, y no es por comodidad.**
     *
     * El resumen de la revisión vive en el estado del cliente
     * (`useAccion`), y la propia revisión emite un aviso que llega por el flujo
     * en vivo y refresca la ruta — la carrera que documenta `useAccion` en
     * `commons/hooks`: la petición se ejecuta, el servidor actúa, y el
     * resultado no llega a pintarse. Se ha visto en esta misma prueba, con el
     * toast del aviso ya en pantalla y el resumen vacío.
     *
     * La fila de la ejecución sí es estado del servidor y sobrevive al
     * refresco. El texto exacto del resumen lo fijan las unitarias de
     * `describeReviewSummary`, que es donde se puede comprobar sin carreras.
     */
    await expect(page.getByText('Actuó', { exact: true })).toHaveCount(1, { timeout: 30_000 });
    /* ⚠️ **El detalle va plegado**: la fila cerrada dice qué regla, sobre qué
       tarea y cómo acabó, y el contexto con el que se evaluó se despliega solo
       si se pide (S3.6). Antes la tabla era plana y esto se veía sin pulsar.

       El resumen del contexto usa las etiquetas del catálogo, no los nombres
       crudos del campo — hueco 3. */
    await page.getByRole('button', { expanded: false }).filter({ hasText: 'Actuó' }).click();
    await expect(page.getByText(/prioridad Alta/)).toBeVisible();

    await page.getByRole('button', { name: 'Revisar ahora' }).click();
    /* Idempotencia visible: la segunda revisión no añade una segunda fila. */
    await expect(page.getByText('Actuó', { exact: true })).toHaveCount(1);
  });

  test('una regla cuyas condiciones no se cumplen deja una fila «No cumplía las condiciones» (Bloque 6)', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await crearCandidataDeVencimiento(api, mundo);

    const nombreRegla = nombreUnico('Revisión sin coincidir').slice(0, 120);
    const alta = await api.post(`/api/projects/${mundo.proyecto.id}/automations`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: {
        name: nombreRegla,
        status: 'ENABLED',
        trigger: { type: 'TASK_DUE_SOON', config: { leadTimeMinutes: 4320 } },
        /* La candidata es de prioridad alta: esta condición nunca se cumple. */
        conditions: [{ field: 'priority', operator: 'EQUALS', value: 'LOW' }],
        actions: [{ type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'ASSIGNEES' } }],
      },
    });
    expect(alta.status(), 'Crear y habilitar la regla').toBe(201);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await page.getByRole('button', { name: 'Revisar ahora' }).click();
    /* La fila, no el resumen: ver el porqué en la prueba de arriba. */
    await expect(page.getByText('No cumplía las condiciones', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
  });

  /**
   * `TASK_STALE`, hasta donde se puede llegar por la API — corrección C3.
   *
   * ⚠️ **Esto NO demuestra que el trigger dispare, y no debe leerse así.**
   * Una tarea estancada no se puede preparar desde una prueba: `StatsService`
   * mide el estancamiento contra `MAX(task_events.occurredAt)`, crear una
   * tarea emite un `CREATED` con `occurredAt = now()`, y `rule-definition.ts`
   * exige `days >= 1`. Una tarea recién creada tiene `diasParada = 0`, así
   * que **ninguna combinación de llamadas al gateway produce una candidata**:
   * habría que esperar un día de reloj. Es el hueco 6 de
   * `docs/frontend/PENDIENTES-BACKEND-AUTOMATIZACION.md`.
   *
   * Lo que sí fija esta prueba es que el otro trigger del catálogo se crea,
   * se revisa y se resume sin romperse — que el camino entero de `TASK_STALE`
   * está montado, aunque el disparo se compruebe a mano.
   */
  test('una regla TASK_STALE se revisa y resume sin candidatas (corrección C3)', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    /* Una tarea recién creada: `diasParada = 0`, así que no es candidata. */
    await crearTarea(api, mundo.duenno.accessToken, mundo);

    const nombreRegla = nombreUnico('Estancamiento').slice(0, 120);
    const alta = await api.post(`/api/projects/${mundo.proyecto.id}/automations`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: {
        name: nombreRegla,
        status: 'ENABLED',
        trigger: { type: 'TASK_STALE', config: { days: 7 } },
        conditions: [{ field: 'overdue', operator: 'EQUALS', value: false }],
        actions: [{ type: 'CREATE_NOTIFICATION', config: { recipientSelector: 'PROJECT_OWNER' } }],
      },
    });
    expect(alta.status(), 'Crear y habilitar la regla TASK_STALE').toBe(201);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    /* El resumen legible del otro trigger, con su destinatario propio, en una
       sola aserción sobre la frase de `describeRule`. Se acota a la fila de la
       regla: «avisa a quien lleva el proyecto» vuelve a salir en la sección
       «Entonces» del panel de edición en cuanto se despliega. */
    const tarjeta = page.getByRole('listitem').filter({ hasText: nombreRegla });
    await expect(
      tarjeta.getByText(
        'Cuando una tarea lleve demasiado tiempo sin moverse, si está vencida es no, entonces avisa a quien lleva el proyecto.',
      ),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Revisar ahora' }).click();
    /* Aquí sí se mira el resumen, y se puede: sin candidatas no hay aviso, sin
       aviso no hay evento en vivo, y sin evento nadie refresca la ruta por
       debajo. Es justo lo contrario del caso de arriba. */
    await expect(page.getByText('1 regla revisada · 0 candidatas · 0 acciones')).toBeVisible({
      timeout: 30_000,
    });
  });

  test('sin canManageAutomations se ve el mensaje de permiso', async ({ page }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    const invitado = await registrar(api);
    await darDeAlta(api, mundo, invitado, { canViewProject: true });
    await api.dispose();

    await entrarConCuenta(page, invitado.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await expect(
      page
        .getByRole('main')
        .getByText('No tienes permiso para administrar automatizaciones en este proyecto.'),
    ).toBeVisible();
  });

  test('con el proyecto suspendido se ve el mensaje de suspensión y no el de permiso', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    const admin = await entrarComoAdmin(api);

    const suspension = await api.patch(`/api/admin/projects/${mundo.proyecto.id}/status`, {
      headers: comoBearer(admin.accessToken),
      data: { status: 'SUSPENDED', reason: 'Prueba automática de Reglas' },
    });
    expect(suspension.status(), 'Suspender el proyecto').toBe(200);
    await api.dispose();

    /* El dueño tiene canManageAutomations en circunstancias normales — la
       suspensión es justo lo que se lo recorta, y es la causa real que D8
       distingue de una falta de permiso corriente. */
    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await expect(
      page
        .getByRole('main')
        .getByText(
          'La automatización de este proyecto no se puede ver ni administrar mientras esté suspendido.',
        ),
    ).toBeVisible();
    await expect(
      page
        .getByRole('main')
        .getByText('No tienes permiso para administrar automatizaciones en este proyecto.'),
    ).not.toBeVisible();
  });
});
