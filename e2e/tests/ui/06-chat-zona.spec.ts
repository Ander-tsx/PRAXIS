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

test.describe('El chat en su propia zona', () => {
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
     * ⚠️ **La insignia de Mensajes, estando todavía en `/dashboard`.**
     *
     * Se mira aquí y no en el chat porque es donde puede fallar: el contador
     * vivo se empareja con la entrada del menú por **igualdad de `href`**
     * (`item.href === HREF_DE_MENSAJES` en `AppShell`), y esa ruta está escrita
     * en **tres** constantes distintas —`navigation.tsx`,
     * `AppShell.HREF_DE_MENSAJES` y `nav.CHAT_HREF`—. Cambiar solo dos, que es
     * lo natural al mudar la zona, deja el `find` sin coincidencia: la insignia
     * se queda a cero **para siempre y sin un solo error**.
     *
     * El mensaje ya está enviado y sin leer, así que aquí tiene que haber un 1.
     */
    const mensajes = page.getByRole('link', { name: 'Mensajes' }).first();
    await expect(mensajes).toBeVisible();
    await expect(mensajes, 'La insignia de Mensajes debe contar el sin leer').toContainText('1');

    /* Se entra **por el menú**, que es como entra la gente: así se comprueba de
       paso que `navigation.tsx` apunta a la zona nueva. Un href viejo aquí sale
       como un 404 al pulsar, nunca como un error de compilación. */
    await mensajes.click();
    await page.waitForURL(/\/chat\/?$/, { timeout: 30_000 });

    /* La columna de conversaciones la pinta el layout de la zona. Si faltara el
       `AppShell` que la envuelve, esto respondería 500 con la página a medio
       pintar — que es exactamente como falló la primera vez. */
    await expect(page.getByRole('navigation', { name: 'Conversaciones' })).toBeVisible();

    /* Abrir la conversación: el enlace lo construye `ChatDirectory` con la ruta
       interna de la zona. Con la ruta vieja saldría `/chat/chat/<id>`. */
    await page
      .getByRole('link', { name: new RegExp(invitado.email.split('@')[0] ?? '', 'i') })
      .or(page.locator(`a[href="/chat/${invitado.userId}"]`))
      .first()
      .click();
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

  test('el flujo en vivo se abre contra el proxy de ESTA zona', async ({ page }) => {
    const api = await contextoDePeticion.newContext({
      baseURL: process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000',
    });
    const { duenno, invitado } = await parejaQueSePuedeEscribir(api);

    /**
     * ⚠️ **Se mira la URL del flujo, y no solo que el mensaje aparezca.**
     *
     * La primera versión de esta prueba enviaba un mensaje y comprobaba que
     * salía en pantalla sin recargar. Pasaba — y también pasaba con el
     * `zonePath` puesto a `/dashboard`, y hasta con uno inventado que no existe.
     * O sea que no probaba nada: al caerse el flujo, la reconexión acaba
     * provocando un refresco del árbol de servidor y el mensaje entra igual, por
     * el camino de respaldo. Una prueba que pasa con el sujeto roto es peor que
     * no tenerla, porque da por cubierto lo que no lo está.
     *
     * Lo que **sí** distingue una cosa de otra es contra qué URL se abre el
     * `EventSource`. `FuenteEnVivo` lo abre contra
     * `<zonePath>/api/gateway/me/notifications/stream`, y `zonePath` lo pone el
     * layout de la zona. Si se quedara en `/dashboard`, seguiría funcionando
     * —el shell reescribe `/dashboard/*` a la otra zona, que tiene su propio
     * proxy— y esta zona estaría hablando por la puerta de otra: invisible
     * mirando la pantalla, y roto en cuanto las zonas se sirvan por separado,
     * que es justo lo que un multi-zone permite.
     */
    const flujos: string[] = [];
    page.on('request', (peticion) => {
      if (peticion.url().includes('/api/gateway/me/notifications/stream')) {
        flujos.push(new URL(peticion.url()).pathname);
      }
    });

    await entrarConCuenta(page, duenno.email);

    /* ⚠️ Se vacía **después de entrar y antes de ir al chat**. Entrar aterriza
       en `/dashboard`, que abre su propio flujo por su propio proxy —eso está
       bien y es lo que debe pasar—, y sin este corte el primer elemento sería
       el del panel: la prueba fallaría acusando a la zona equivocada. Le pasó a
       esta misma prueba al escribirla. */
    flujos.length = 0;

    await page.goto(`/chat/${invitado.userId}`);
    await expect(page.getByRole('navigation', { name: 'Conversaciones' })).toBeVisible();

    /**
     * Se exige que **aparezca** el de esta zona, no que sean todos.
     *
     * ⚠️ Y no es una aserción débil por comodidad: exigir «todos» falla por un
     * motivo que no es el que se vigila. Al navegar fuera del panel su flujo se
     * rompe, `useReconexion` reintenta, y ese reintento sale por
     * `/dashboard/...` mientras la página vieja se descarga. Es correcto: cada
     * zona reconecta por su puerta.
     *
     * Los dientes siguen puestos: si el `zonePath` de esta zona estuviera mal,
     * **nunca** aparecería un flujo contra `/chat/api/gateway`, y esto se pondría
     * rojo por espera agotada.
     */
    const DEL_CHAT = '/chat/api/gateway/me/notifications/stream';
    await expect
      .poll(() => flujos.includes(DEL_CHAT), {
        timeout: 20_000,
        message: `chat-front no abrió su flujo en vivo. Abiertos: ${flujos.join(', ') || 'ninguno'}`,
      })
      .toBe(true);

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

    /* Lo que se exige no es «no hay 404»: es que se llegue al **directorio**,
       que es la pantalla desde la que se puede seguir. */
    await expect(page.getByRole('navigation', { name: 'Conversaciones' })).toBeVisible();
    await expect(page).toHaveURL(/\/chat\/?$/);
  });
});
