import {
  type APIRequestContext,
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
 * `api/15-automatizaciones-academicas.spec.ts` ya prueba el contrato: que las
 * rutas validan, que la revisión no duplica avisos. Lo que no prueba es que la
 * **pantalla** siga pintándose — un `ProjectRules` que rompiera la frontera
 * servidor/cliente, un `describeRule` que lanzara con una regla real, o el
 * alias de la pestaña vieja mal resuelto no los detecta ningún tipo ni ningún
 * test unitario: solo pedir la página de verdad.
 *
 * Cada caso monta su propio mundo por API y solo usa el navegador para la
 * parte que hay que ver — el mismo patrón que `05-equipo` y `06-chat-zona`.
 */

async function apiContext(): Promise<APIRequestContext> {
  return contextoDePeticion.newContext({
    baseURL: process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000',
  });
}

/**
 * Deja una tarea candidata a `TASK_DUE_SOON`: vence mañana, prioridad alta y
 * con el dueño como responsable — el mismo montaje que
 * `api/15-automatizaciones-academicas.spec.ts` usa para el mismo trigger.
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

test.describe('Reglas del proyecto', () => {
  /**
   * ⚠️ **Calienta la ruta `/projects/[id]` antes de medir nada.**
   *
   * En `next dev` la primera visita a una ruta la compila sobre la marcha —
   * decenas de segundos en una máquina cargada—, y el proxy del shell entre
   * `web-shell` y `projects-front` corta la conexión antes de que termine.
   * Sin esto, el primer test de la tanda paga esa compilación entera y puede
   * agotar su propio timeout por algo que no tiene nada que ver con Reglas.
   * El resultado se descarta a propósito: solo importa que Turbopack haya
   * terminado, no si esta petición en concreto tuvo éxito.
   */
  test.beforeAll(async ({ request }) => {
    await request.get('/projects/calentar-turbopack', { timeout: 60_000 }).catch(() => {});
  });

  test('la pestaña se llama Reglas y se llega a ella desde la barra de secciones', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}`);

    await page
      .getByRole('navigation', { name: 'Secciones del proyecto' })
      .getByRole('link', { name: 'Reglas' })
      .click();

    await expect(page.getByRole('heading', { name: 'Reglas académicas' })).toBeVisible();
  });

  test('un enlace viejo con ?tab=automatizaciones sigue aterrizando en Reglas', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=automatizaciones`);

    await expect(page.getByRole('heading', { name: 'Reglas académicas' })).toBeVisible();
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
    await page.getByLabel('Nombre', { exact: true }).fill(nombreRegla);
    await page.getByRole('button', { name: 'Crear regla' }).click();

    /* `exact: true`: el diálogo de eliminar (oculto) también lleva el
       nombre de la regla en su título — «Eliminar «<nombre>»» —, y sin
       `exact` el texto de sobra lo hace coincidir igual. */
    await expect(page.getByText(nombreRegla, { exact: true })).toBeVisible();
    /* `describeRule` describe el trigger por defecto del constructor
       (`TASK_DUE_SOON`) en una frase legible, no solo el identificador técnico. */
    await expect(page.getByText(/Cuando tarea próxima a vencer/)).toBeVisible();
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
    await page.getByLabel('Nombre', { exact: true }).fill(nombreRegla);

    await page.getByRole('button', { name: 'Añadir condición' }).click();
    /* El campo por defecto de una fila nueva ya es «prioridad» — el primero
       del catálogo de TASK_DUE_SOON —, así que solo hace falta elegir el
       valor. */
    await page.getByRole('combobox', { name: 'Valor' }).click();
    await page.getByRole('option', { name: 'Alta' }).click();

    await page.getByRole('button', { name: 'Crear regla' }).click();

    const tarjeta = page.locator('li', { hasText: nombreRegla });
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta.getByText(/si prioridad es Alta/)).toBeVisible();
  });

  /**
   * El diálogo de creación arrastraba el borrador de la regla anterior.
   *
   * Hallazgo §3 del informe de revisión del Bloque 7. `RuleDialog` sembraba el
   * borrador con un *initializer* de `useState`, que solo corre en el montaje,
   * y el componente nunca se desmonta: no lleva `key` y su posición en el
   * árbol no cambia. Cerrar el diálogo no lo reiniciaba, así que la segunda
   * regla de una sesión partía del nombre y las condiciones de la primera.
   *
   * ⚠️ **Se localiza acotando al diálogo abierto** y no con
   * `page.getByLabel('Nombre')` a secas: con una tarjeta en pantalla, su
   * diálogo «Editar» también tiene un campo «Nombre» en el DOM, y el locator
   * suelto resuelve a dos elementos.
   */
  test('el diálogo de creación se reinicia al reabrirlo tras crear (corrección C1)', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await page.getByRole('button', { name: 'Nueva regla' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Nueva regla' });
    const nombreRegla = nombreUnico('Primera').slice(0, 120);
    await dialogo.getByLabel('Nombre', { exact: true }).fill(nombreRegla);
    await page.getByRole('button', { name: 'Añadir condición' }).click();
    await page.getByRole('combobox', { name: 'Valor' }).click();
    await page.getByRole('option', { name: 'Alta' }).click();
    await page.getByRole('button', { name: 'Crear regla' }).click();

    await expect(page.getByText(nombreRegla, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Nueva regla' }).click();
    await expect(dialogo.getByLabel('Nombre', { exact: true })).toHaveValue('');
    await expect(dialogo.getByRole('button', { name: 'Quitar' })).toHaveCount(0);
    /* Y sin marcar el campo en rojo: el diálogo está vacío porque acaba de
       abrirse, no porque alguien lo haya dejado mal. */
    await expect(dialogo.getByText('El nombre debe tener al menos 2 caracteres.')).toHaveCount(0);
  });

  test('el diálogo de edición sigue precargando su propia regla al reabrirlo (corrección C1)', async ({
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

    const tarjeta = page.locator('li', { hasText: nombreRegla });
    const dialogo = page.getByRole('dialog', { name: `Editar «${nombreRegla}»` });

    await tarjeta.getByRole('button', { name: 'Editar' }).click();
    await expect(dialogo.getByLabel('Nombre', { exact: true })).toHaveValue(nombreRegla);

    /* Cancelar y volver: el reinicio al abrir tiene que recalcular la regla,
       no vaciar el formulario como hace el de creación. */
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await tarjeta.getByRole('button', { name: 'Editar' }).click();
    await expect(dialogo.getByLabel('Nombre', { exact: true })).toHaveValue(nombreRegla);
    await expect(dialogo.getByRole('button', { name: 'Quitar' })).toHaveCount(1);
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

    const tarjeta = page.locator('li', { hasText: nombreRegla });
    await expect(tarjeta.getByText(/si prioridad es Baja/)).toBeVisible();

    await tarjeta.getByRole('button', { name: 'Editar' }).click();
    /* Una sola fila de condición, precargada por `draftFromRule`: cambia su
       valor de «Baja» a «Urgente». */
    await page.getByRole('combobox', { name: 'Valor' }).click();
    await page.getByRole('option', { name: 'Urgente' }).click();
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(tarjeta.getByText(/si prioridad es Urgente/)).toBeVisible();
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
    await expect(page.getByRole('button', { name: 'Quitar' })).toHaveCount(1);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('combobox', { name: 'Tipo de trigger' }).click();
    await page.getByRole('option', { name: 'Tarea estancada' }).click();

    await expect(page.getByRole('button', { name: 'Quitar' })).toHaveCount(0);
    /* Y el destinatario de la sección «Entonces» cambió con el trigger. */
    await expect(page.getByText(/avisa al dueño del proyecto/)).toBeVisible();
  });

  test('el nombre vacío marca el campo y no envía (Bloque 5)', async ({ page }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    await page.getByRole('button', { name: 'Nueva regla' }).click();
    await page.getByRole('button', { name: 'Crear regla' }).click();

    await expect(page.getByText('El nombre debe tener al menos 2 caracteres.')).toBeVisible();
    /* El diálogo sigue abierto: no se perdió lo que ya había en el formulario. */
    await expect(page.getByRole('heading', { name: 'Nueva regla' })).toBeVisible();
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
    const dialogo = page.getByRole('dialog', { name: 'Nueva regla' });
    const nombreRegla = nombreUnico('A medio escribir').slice(0, 120);
    await dialogo.getByLabel('Nombre', { exact: true }).fill(nombreRegla);

    page.once('dialog', (aviso) => aviso.dismiss());
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogo.getByLabel('Nombre', { exact: true })).toHaveValue(nombreRegla);

    page.once('dialog', (aviso) => aviso.accept());
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogo).toBeHidden();
  });

  test('cerrar sin haber tocado nada no pregunta (corrección C2)', async ({ page }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    let avisos = 0;
    page.on('dialog', (aviso) => {
      avisos += 1;
      void aviso.accept();
    });

    await page.getByRole('button', { name: 'Nueva regla' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Nueva regla' });
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();

    await expect(dialogo).toBeHidden();
    expect(avisos, 'Cerrar un formulario intacto no debería preguntar nada').toBe(0);
  });

  test('guardar correctamente cierra el diálogo sin preguntar (corrección C2)', async ({
    page,
  }) => {
    const api = await apiContext();
    const mundo = await crearMundo(api);
    await api.dispose();

    await entrarConCuenta(page, mundo.duenno.email);
    await page.goto(`/projects/${mundo.proyecto.id}?tab=reglas`);

    let avisos = 0;
    page.on('dialog', (aviso) => {
      avisos += 1;
      void aviso.accept();
    });

    await page.getByRole('button', { name: 'Nueva regla' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Nueva regla' });
    const nombreRegla = nombreUnico('Guardada sin preguntar').slice(0, 120);
    await dialogo.getByLabel('Nombre', { exact: true }).fill(nombreRegla);
    await page.getByRole('button', { name: 'Crear regla' }).click();

    await expect(page.getByText(nombreRegla, { exact: true })).toBeVisible();
    await expect(dialogo).toBeHidden();
    expect(avisos, 'Un guardado correcto no pierde nada, así que no pregunta').toBe(0);
  });

  test('un error del servidor se ve dentro del diálogo, sin cerrarlo ni perder lo escrito (Bloque 5)', async ({
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
    await page.getByLabel('Nombre', { exact: true }).fill(nombreRegla);

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
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nueva regla' })).toBeVisible();
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
    await page.getByLabel('Nombre', { exact: true }).fill(nombreRegla);
    /* El borrador nace en DISABLED —igual que el valor por defecto del
       servidor cuando se omite `status`, ver `emptyDraft` en el Bloque 2—,
       así que hay que marcar el checkbox para partir de «Activa». */
    await page.getByLabel('Activar esta regla').check();
    await page.getByRole('button', { name: 'Crear regla' }).click();

    const tarjeta = page.locator('li', { hasText: nombreRegla });
    await expect(tarjeta).toBeVisible();
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
    await page.getByLabel('Nombre', { exact: true }).fill(nombreRegla);
    await page.getByRole('button', { name: 'Crear regla' }).click();

    const tarjeta = page.locator('li', { hasText: nombreRegla });
    await expect(tarjeta).toBeVisible();

    await tarjeta.getByRole('button', { name: 'Eliminar' }).click();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(tarjeta).toBeVisible();

    await tarjeta.getByRole('button', { name: 'Eliminar' }).click();
    await page.getByRole('button', { name: 'Eliminar regla' }).click();
    await expect(page.locator('li', { hasText: nombreRegla })).toHaveCount(0);
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
    await expect(
      page.getByText('1 regla revisada · 1 candidata · 1 aviso · 0 fallos'),
    ).toBeVisible();
    await expect(page.getByText('Avisó', { exact: true })).toHaveCount(1);
    /* El resumen del contexto usa las etiquetas del catálogo, no los nombres
       crudos del campo — hueco 3. */
    await expect(page.getByText(/prioridad Alta/)).toBeVisible();

    await page.getByRole('button', { name: 'Revisar ahora' }).click();
    await expect(
      page.getByText('1 regla revisada · 1 candidata · 0 avisos · 0 fallos'),
    ).toBeVisible();
    /* Idempotencia visible: la segunda revisión no añade una segunda fila. */
    await expect(page.getByText('Avisó', { exact: true })).toHaveCount(1);
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
    await expect(
      page.getByText('1 regla revisada · 1 candidata · 0 avisos · 0 fallos'),
    ).toBeVisible();
    await expect(page.getByText('No cumplía las condiciones', { exact: true })).toBeVisible();
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

    /* El resumen legible del otro trigger, con su destinatario propio. En una
       sola aserción sobre la frase de `describeRule`: «avisa al dueño del
       proyecto» aparece también en la sección «Entonces» del diálogo de
       edición, que está en el DOM aunque cerrado. */
    const tarjeta = page.locator('li', { hasText: nombreRegla });
    await expect(
      tarjeta.getByText(
        'Cuando tarea estancada, si vencida es no, entonces avisa al dueño del proyecto.',
      ),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Revisar ahora' }).click();
    await expect(
      page.getByText('1 regla revisada · 0 candidatas · 0 avisos · 0 fallos'),
    ).toBeVisible();
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
      page.getByText('No tienes permiso para administrar automatizaciones en este proyecto.'),
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
      page.getByText(
        'Las reglas de este proyecto no se pueden ver ni administrar mientras esté suspendido.',
      ),
    ).toBeVisible();
    await expect(
      page.getByText('No tienes permiso para administrar automatizaciones en este proyecto.'),
    ).not.toBeVisible();
  });
});
