import {
  type APIRequestContext,
  request as contextoDePeticion,
  expect,
  test,
} from '@playwright/test';
import {
  type Usuario,
  comoBearer,
  crearProyecto,
  data,
  nombreUnico,
  registrar,
} from '../../fixtures/api';
import { entrarConCuenta } from '../../fixtures/ui';

/**
 * El chat en su propia zona (`chat-front`, E3).
 *
 * ## Por qué esta prueba existe
 *
 * El chat vivía dentro de `dashboard-front`, en `/dashboard/chat`, y E3 lo mudó
 * a una zona propia con `basePath: '/chat'`. Esa mudanza rompe cosas que **el
 * compilador no ve y las pruebas de API tampoco**, porque no son ni tipos ni
 * contrato del gateway: son rutas.
 *
 * Lo que puede romperse sin que nada dé error:
 *
 * - **El basePath se recorta.** Dentro de la zona, `usePathname()`,
 *   `revalidatePath()`, `redirect()` y `router.push()` trabajan con la ruta
 *   **sin** `/chat`. Las expresiones y las rutas que venían de la zona vieja
 *   empezaban por `/chat/`, y ahí eso significa `/chat/chat/`. Ninguna de esas
 *   equivocaciones lanza: dan un 404, una fila que no se marca nunca o un
 *   refresco que no refresca.
 * - **El proxy del gateway cambia de sitio** (`/dashboard/api/gateway` →
 *   `/chat/api/gateway`). Con el viejo, la zona **parece** funcionar mientras
 *   habla por el proxy de otra: se ve al servir la página y no se ve al usarla.
 * - **Los enlaces de fuera.** Trece sitios en cinco zonas apuntaban a
 *   `/dashboard/chat`. Ninguno da error de compilación al quedarse viejo.
 *
 * ## Lo que se prueba aquí y lo que no
 *
 * Aquí se prueba **que la zona es navegable y que el tiempo real llega hasta el
 * navegador**. La lógica del chat —paginación, borrado suave, fijados, no
 * leídos— ya la cubre `api/15-chat.spec.ts` y no se repite.
 */

/** Dos cuentas que comparten proyecto, que es el requisito del chat privado. */
async function parejaQueSePuedeEscribir(
  request: APIRequestContext,
): Promise<{ duenno: Usuario; invitado: Usuario }> {
  const duenno = await registrar(request);
  const proyectoId = (await crearProyecto(request, duenno.accessToken)).id;
  const invitado = await registrar(request);

  const delDuenno = comoBearer(duenno.accessToken);
  const rol = await request.post(`/api/projects/${proyectoId}/roles`, {
    headers: delDuenno,
    data: {
      name: nombreUnico('Rol').slice(0, 50),
      /* Diccionario de booleanos, nunca un array. */
      permissions: { canViewProject: true, canComment: true },
    },
  });
  expect(rol.status(), 'Crear rol de proyecto').toBe(201);

  const alta = await request.post(`/api/projects/${proyectoId}/members`, {
    headers: delDuenno,
    data: { userId: invitado.userId, projectRoleId: (await data<{ id: string }>(rol)).id },
  });
  expect(alta.status(), 'Dar de alta al miembro').toBe(201);

  return { duenno, invitado };
}

test.describe('El chat como sección de la aplicación', () => {
  test('se abre en /chat, no en /dashboard/chat, y pinta la conversación', async ({ page }) => {
    const api = await contextoDePeticion.newContext({
      baseURL: process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000',
    });
    const { duenno, invitado } = await parejaQueSePuedeEscribir(api);

    /* Un mensaje puesto por API: la prueba es la zona, no el compositor. */
    const enviado = await api.post(`/api/me/chats/${duenno.userId}/messages`, {
      headers: comoBearer(invitado.accessToken),
      data: { body: 'hola desde la zona nueva' },
    });
    expect(enviado.status(), 'Escribir por API').toBe(201);
    await api.dispose();

    await entrarConCuenta(page, duenno.email);

    /**
     * ⚠️ **El directorio del chat ya no vive en la zona: vive en la barra
     * lateral global (`SidebarChatList` en `AppShell`), en la pestaña «Chat».**
     *
     * Se abre desde ahí, que es como entra la gente. La fila del compañero es
     * un `<a href="/chat/<peerId>">` que construye el propio `SidebarChatList`
     * con la ruta del shell — nunca `/dashboard/chat/...`—, y lleva la insignia
     * de sin leer. El mensaje está enviado y sin leer, así que tiene que haber
     * un 1.
     */
    /* ⚠️ `role="tab"`, no `button`: `2d4d1a5` convirtió las tres secciones de la
       barra en un `tablist` de verdad. Un `getByRole('button', …)` no casa un
       `role="tab"` y se queda esperando los 120 s enteros. */
    await page.getByRole('tab', { name: 'Chat' }).first().click();

    const fila = page.locator(`a[href="/chat/${invitado.userId}"]`);
    await expect(fila).toBeVisible({ timeout: 15_000 });
    await expect(
      fila.getByText('1', { exact: true }),
      'La fila del chat debe contar el mensaje sin leer',
    ).toBeVisible();

    await fila.click();
    await page.waitForURL(`**/chat/${invitado.userId}`, { timeout: 30_000 });

    await expect(page.getByText('hola desde la zona nueva').first()).toBeVisible();
  });

  test('una dirección vieja de /dashboard/chat sigue llevando a la conversación', async ({
    page,
  }) => {
    const api = await contextoDePeticion.newContext({
      baseURL: process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000',
    });
    const { duenno, invitado } = await parejaQueSePuedeEscribir(api);
    await api.dispose();

    await entrarConCuenta(page, duenno.email);

    /**
     * La redirección de cortesía (E3.5).
     *
     * Hay enlaces vivos a las direcciones viejas que no controlamos: los
     * compartidos por privado, los del historial y los de los marcadores. Sin
     * esto, todos serían un 404 por una decisión de arquitectura que a quien
     * pulsa no le importa.
     */
    await page.goto(`/dashboard/chat/${invitado.userId}`);
    await page.waitForURL(`**/chat/${invitado.userId}`, { timeout: 30_000 });
    expect(page.url(), 'No debe quedar rastro de /dashboard/chat').not.toContain('/dashboard/chat');
  });

  test('el flujo en vivo se abre contra el proxy único, y trae el mensaje', async ({ page }) => {
    const api = await contextoDePeticion.newContext({
      baseURL: process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000',
    });
    const { duenno, invitado } = await parejaQueSePuedeEscribir(api);

    /**
     * ⚠️ **Se mira la URL del flujo, y no solo que el mensaje aparezca.**
     *
     * La primera versión de esta prueba enviaba un mensaje y comprobaba que
     * salía en pantalla sin recargar. Pasaba — y también pasaba con el
     * `zonePath` puesto a otra zona, y hasta con uno inventado. O sea que no
     * probaba nada: al caerse el flujo, la reconexión acaba provocando un
     * refresco del árbol de servidor y el mensaje entra igual, por el camino de
     * respaldo. Una prueba que pasa con el sujeto roto es peor que no tenerla.
     *
     * ## Lo que vigila ahora, que no es lo mismo que antes
     *
     * Mientras hubo zonas, esto comprobaba que **cada una abriera su propio**
     * `<zonePath>/api/gateway/...`: hablar por la puerta de otra zona era
     * invisible mirando la pantalla y se rompía en cuanto se sirvieran por
     * separado.
     *
     * Desde la fusión (F3 y F8) hay **un solo** proxy, así que lo que se vigila
     * es lo contrario: que `zonePath` se quedara en `""` y el flujo salga por
     * `/api/gateway`. Si alguien le devolviera un prefijo —`/chat`, por
     * ejemplo— la URL sería `/chat/api/gateway/...`, que en esta aplicación es
     * un 404: el flujo no abriría y el chat volvería a enterarse de los
     * mensajes solo al recargar, sin un error en ninguna consola.
     */
    const flujos: string[] = [];
    page.on('request', (peticion) => {
      if (peticion.url().includes('/api/gateway/me/notifications/stream')) {
        flujos.push(new URL(peticion.url()).pathname);
      }
    });

    await entrarConCuenta(page, duenno.email);
    await page.goto(`/chat/${invitado.userId}`);

    const PROXY_UNICO = '/api/gateway/me/notifications/stream';
    await expect
      .poll(() => flujos.includes(PROXY_UNICO), {
        timeout: 20_000,
        message: `No se abrió el flujo en vivo contra el proxy único. Abiertos: ${flujos.join(', ') || 'ninguno'}`,
      })
      .toBe(true);

    /* ⚠️ Y que **ninguno** salga con un prefijo de sección delante, que es la
       forma en que esto se rompería sin dar error. */
    expect(
      flujos.filter((ruta) => ruta !== PROXY_UNICO),
      'Ningún flujo debería llevar un prefijo de sección delante del proxy',
    ).toEqual([]);

    /* Y una vez comprobado por dónde sale, que efectivamente traiga el mensaje.
       Sin `reload()`: si hiciera falta recargar, no sería tiempo real. */
    const texto = `en vivo ${Date.now().toString(36)}`;
    const enviado = await api.post(`/api/me/chats/${duenno.userId}/messages`, {
      headers: comoBearer(invitado.accessToken),
      data: { body: texto },
    });
    expect(enviado.status(), 'Escribir por API').toBe(201);
    await api.dispose();

    await expect(page.getByText(texto).first()).toBeVisible({ timeout: 20_000 });
  });
});

/**
 * Entrar en Mensajes con un recuerdo que ya no vale.
 *
 * ## El fallo que fija
 *
 * Reportado por el usuario. El proxy de la zona anota la última conversación
 * abierta en una cookie y el índice redirige a ella — «vuelve a donde lo
 * dejaste». La cookie se validaba en la **forma** (un UUID, para que su valor no
 * pudiera convertir el redirect en uno abierto) pero no en si esa conversación
 * **seguía existiendo**.
 *
 * Con un compañero que sale de un proyecto compartido, o una cuenta que
 * desaparece, el recuerdo apunta a un sitio que ya devuelve 404. Y lo grave no
 * es el 404: es que ocurría **al entrar**, así que la persona no llegaba al
 * directorio **nunca** — cada intento de abrir Mensajes la devolvía al mismo
 * error, sin salida salvo conociendo otra URL. Un atajo de conveniencia dejaba
 * inservible la pantalla entera.
 *
 * ## Por qué con una cookie inventada y no reproduciendo el escenario
 *
 * El escenario real —dar de alta a alguien, hablar, sacarlo del proyecto— prueba
 * lo mismo con cuatro llamadas más y una dependencia extra: que sacar a alguien
 * de un proyecto rompa la conversación privada, que es **otra** regla y ya tiene
 * su sitio. Lo que aquí importa es qué hace el índice ante un recuerdo que no
 * resuelve, y eso una cookie a un id inexistente lo dice igual de bien.
 */
test.describe('El recuerdo de la última conversación', () => {
  test('un recuerdo que ya no vale no deja atrapado en un 404', async ({ page, context }) => {
    const api = await contextoDePeticion.newContext({
      baseURL: process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000',
    });
    const { duenno } = await parejaQueSePuedeEscribir(api);
    await api.dispose();

    await entrarConCuenta(page, duenno.email);

    /* Un id con forma válida y sin nadie detrás: es justo lo que queda en la
       cookie cuando la otra persona deja de ser accesible. */
    await context.addCookies([
      {
        name: 'praxis_ultimo_chat',
        value: '99999999-9999-4999-8999-999999999999',
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto('/chat');

    /* Lo que se exige no es «no hay 404»: es que se llegue al **índice de
       Mensajes**, que es la pantalla desde la que se puede seguir. En
       escritorio el directorio vive en la barra lateral y el índice solo dice
       qué hacer (`9b6343c9`); «Tus mensajes» es la versión del móvil, que aquí
       está oculta. */
    await expect(
      page.getByRole('main', { name: 'Mensajes directos' }).getByText('Selecciona un chat'),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/chat\/?$/);
  });
});
