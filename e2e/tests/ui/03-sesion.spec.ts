import { expect, test } from '@playwright/test';
import { request as contextoDePeticion } from '@playwright/test';
import { registrar } from '../../fixtures/api';
import { campos, crearCuentaYEntrar, crearProyectoParaLaPrueba } from '../../fixtures/ui';

/**
 * El recorrido completo en navegador: crear cuenta, entrar, moverse entre zonas
 * y salir.
 *
 * Es la prueba que atraviesa **todas** las piezas a la vez —shell, rewrites,
 * proxy de zona, cookie httpOnly, gateway— y por eso es la que más avisa cuando
 * algo se rompe de verdad.
 */

test.describe('Sesión en el navegador', () => {
  /**
   * ⚠️ **El nombre de esta prueba decía lo contrario, y era el contrato viejo.**
   *
   * «Crear cuenta deja la sesión abierta» describía el comportamiento anterior a
   * la confirmación por correo. Ahora el alta **no** deja dentro: enseña «Mira tu
   * correo» y hay que confirmar antes de poder entrar. `crearCuentaYEntrar` hace
   * los tres pasos.
   */
  test('crear cuenta, confirmar y entrar aterriza en el panel', async ({ page }) => {
    await crearCuentaYEntrar(page);

    /* El aterrizaje tras el login es `/projects` (`POST_AUTH_DESTINATION`). */
    await expect(page).toHaveURL(/\/projects/);
  });

  /**
   * 🔒 La otra mitad, y el motivo entero de que exista la confirmación: el alta
   * **no abre sesión**. Con sesión desde el registro, cualquiera se daba de alta
   * con un correo inventado y se quedaba usando el sistema sin abrirlo jamás.
   */
  test('crear cuenta NO abre sesión: se queda esperando la confirmación', async ({
    page,
    context,
  }) => {
    await page.goto('/auth/signup');
    const email = `ui-sinconfirmar-${Date.now()}@praxis.test`;
    await page.locator(campos.email).fill(email);
    await page.locator(campos.password).fill('Prueba@12345!');
    await page.locator(campos.confirmarPassword).fill('Prueba@12345!');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page.getByRole('heading', { name: 'Mira tu correo' })).toBeVisible();

    const cookies = await context.cookies();
    expect(
      cookies.some((cookie) => cookie.name === 'praxis_session'),
      'registrarse no puede dejar cookie de sesión',
    ).toBe(false);
  });

  /**
   * 🔒 El invariante que sostiene todo el diseño de autenticación: el JWT vive
   * en una cookie httpOnly y **nunca** en `localStorage` ni en el JS del
   * cliente. Si esto se rompe, cualquier XSS se lleva la sesión entera.
   */
  test('el token no es accesible desde el JavaScript de la página', async ({ page, context }) => {
    await crearCuentaYEntrar(page);

    const cookiesVisibles = await page.evaluate(() => document.cookie);
    expect(cookiesVisibles, 'praxis_session tiene que ser httpOnly').not.toContain(
      'praxis_session',
    );
    expect(cookiesVisibles, 'praxis_refresh también').not.toContain('praxis_refresh');

    /**
     * Se compara contra el **valor real** del token, que Playwright sí puede
     * leer del contexto aunque la página no pueda.
     *
     * Buscar un prefijo genérico de JWT (`eyJ`) daba un falso positivo: el
     * canal de depuración de Next en desarrollo deja su propio base64 en
     * `sessionStorage` y empieza igual. La prueba señalaba una fuga que no
     * existía, que es la peor clase de prueba.
     */
    const cookies = await context.cookies();
    const tokenReal = cookies.find((c) => c.name === 'praxis_session')?.value ?? '';
    expect(tokenReal, 'Sin token no hay nada que comprobar').not.toBe('');

    const almacenamiento = await page.evaluate(() => ({
      local: JSON.stringify(window.localStorage),
      sesion: JSON.stringify(window.sessionStorage),
    }));

    expect(almacenamiento.local, 'El token no puede estar en localStorage').not.toContain(
      tokenReal,
    );
    expect(almacenamiento.sesion, 'Ni en sessionStorage').not.toContain(tokenReal);
    expect(cookiesVisibles, 'Ni en document.cookie').not.toContain(tokenReal);
  });

  test('la cookie de sesión existe y está marcada httpOnly', async ({ page, context }) => {
    await crearCuentaYEntrar(page);

    const cookies = await context.cookies();
    const sesion = cookies.find((c) => c.name === 'praxis_session');

    expect(sesion, 'Debería haberse puesto la cookie de sesión').toBeTruthy();
    expect(sesion?.httpOnly).toBe(true);
    expect(sesion?.sameSite, 'Lax: protege de CSRF sin romper el multi-zone').toBe('Lax');
    expect(sesion?.path, 'path=/ para que todas las zonas la vean').toBe('/');
  });

  test('con sesión se entra a las tres zonas privadas', async ({ page }) => {
    await crearCuentaYEntrar(page);

    for (const ruta of ['/main', '/projects', '/reports']) {
      await page.goto(ruta);
      await expect(page, `${ruta} debería servirse con sesión`).not.toHaveURL(/\/auth\/login/);
    }
  });

  test('con sesión, el login redirige al panel en vez de mostrarse', async ({ page }) => {
    await crearCuentaYEntrar(page);

    /* El guard de auth-front: quien ya entró no debe ver el formulario. Sale al
       destino posterior al login, que es `/projects`. */
    await page.goto('/auth/login');
    await expect(page).toHaveURL(/\/projects/);
  });

  test('el panel muestra la navegación del área privada', async ({ page }) => {
    await crearCuentaYEntrar(page);
    await page.goto('/main');

    /* Los `href` de `APP_NAV_ITEMS` son rutas **del shell**; las de dashboard-front
       llevan su `basePath` `/main` a propósito (`navigation.tsx`). Si alguna se
       escribiera mal, el enlace no aparecería o saldría con un prefijo de más. */
    for (const href of ['/projects', '/assistant', '/main/billing']) {
      await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
    }
  });

  test('salir borra la sesión y devuelve al área pública', async ({ page, context }) => {
    await crearCuentaYEntrar(page);

    /* ⚠️ **«Cerrar sesión» está en la pantalla de cuenta, no en la barra.**
       Esta prueba lo buscaba en `/dashboard`, donde estuvo hasta que el pie de
       la barra lateral pasó a ser el selector de estado (ver `AppShell`). No se
       notó porque la suite de interfaz llevaba sin ejecutarse desde entonces:
       sin navegador instalado, estas 27 pruebas no daban ni un dato. */
    await page.goto('/main/profile');

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/main'), { timeout: 30_000 });

    const cookies = await context.cookies();
    const sesion = cookies.find((c) => c.name === 'praxis_session');
    expect(sesion?.value ?? '', 'La cookie debe quedar vacía o desaparecer').toBe('');

    /* Y el área privada vuelve a estar cerrada. */
    await page.goto('/main');
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

test.describe('Proyectos desde la interfaz', () => {
  test('se crea un proyecto y aparece en el listado', async ({ page }) => {
    await crearCuentaYEntrar(page);

    const nombre = `Proyecto UI ${Date.now().toString(36)}`;
    await crearProyectoParaLaPrueba(page, nombre);

    /* El proyecto sale en dos sitios —la rejilla y el árbol de la barra
       lateral—, así que `getByText` a secas viola el modo estricto. Basta con
       que aparezca en alguno: los dos son «el listado». */
    await expect(page.getByRole('link', { name: new RegExp(nombre) }).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  /**
   * La URL lleva el **slug**, no el UUID. Es la regla que se coló en cinco
   * sitios al introducirlos, y ninguno dio error de compilación: los dos
   * identificadores son `string`, así que equivocarse solo se ve mirando la
   * barra de direcciones — que es exactamente lo que hace esta prueba.
   */
  test('la URL de un proyecto lleva el slug, no el UUID', async ({ page }) => {
    await crearCuentaYEntrar(page);

    const nombre = `Rediseño del panel ${Date.now().toString(36)}`;
    await crearProyectoParaLaPrueba(page, nombre);

    /* Por rol y no por texto: la tarjeta del proyecto es un enlace, y
       `getByText` casaba también con el campo del diálogo que se está cerrando
       —el clic caía en la nada y la página se quedaba en `/projects`—. Buscar
       el enlace hace que Playwright espere a que la rejilla se refresque. */
    await page.getByRole('link').filter({ hasText: nombre }).first().click();
    await page.waitForURL(/\/projects\/[^/?]+/, { timeout: 30_000 });

    const ruta = new URL(page.url()).pathname;
    const identificador = ruta.replace(/^\/projects\//, '').split('/')[0];

    const pareceUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      identificador,
    );

    expect(pareceUuid, `La URL trae un UUID en vez del slug: ${identificador}`).toBe(false);
    expect(identificador, 'El slug es minúsculas, números y guiones').toMatch(/^[a-z0-9-]+$/);
    expect(identificador).toContain('rediseno-del-panel');
  });
});

test.describe('Las personas de un proyecto', () => {
  /**
   * 🔴 Regresión.
   *
   * La pestaña Equipo resolvía los nombres contra `/users?limit=100` — la
   * primera página del directorio de **toda la plataforma**, con el `limit`
   * topado en 100 por el DTO. Cuando había más de cien cuentas, los miembros de
   * este proyecto dejaban de caber ahí y la pestaña enseñaba el UUID crudo y
   * «Correo no disponible», con el selector de encargados vacío. Sin ningún
   * error: solo datos que no aparecían.
   *
   * Lo destapó esta misma suite al llenar la base de cuentas de usar y tirar,
   * pero habría pasado igual el día que la plataforma llegara a 101 cuentas.
   *
   * La prueba **empuja el directorio a propósito**: registra unas cuantas
   * cuentas ajenas al proyecto y después comprueba que la pestaña sigue
   * resolviendo a los suyos. Con el código viejo, esas cuentas nuevas —las más
   * recientes— desplazaban a los miembros y la prueba caía.
   */
  test('se resuelven aunque el directorio esté lleno de gente ajena', async ({ page, request }) => {
    const email = await crearCuentaYEntrar(page);

    const nombre = `Proyecto con gente ${Date.now().toString(36)}`;
    await crearProyectoParaLaPrueba(page, nombre);
    /* Por rol y no por texto: la tarjeta del proyecto es un enlace, y
       `getByText` casaba también con el campo del diálogo que se está cerrando
       —el clic caía en la nada y la página se quedaba en `/projects`—. Buscar
       el enlace hace que Playwright espere a que la rejilla se refresque. */
    await page.getByRole('link').filter({ hasText: nombre }).first().click();
    await page.waitForURL(/\/projects\/[^/?]+/, { timeout: 30_000 });

    /**
     * Ruido en el directorio: cuentas que no tienen nada que ver con el
     * proyecto y que en el listado global van por delante.
     *
     * ⚠️ Contexto propio contra el **gateway**. El `request` que inyecta el
     * proyecto `ui` apunta al shell (4100), donde `/api/auth/register` no
     * existe: da 404 y el fallo parece del registro, no del origen.
     */
    const alGateway = await contextoDePeticion.newContext({
      baseURL: process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000',
    });
    for (let i = 0; i < 8; i++) await registrar(alGateway);
    await alGateway.dispose();

    await page.goto(`${page.url().split('?')[0]}?tab=equipo`);
    await page.waitForLoadState('networkidle');

    const cuerpo = (await page.textContent('body')) ?? '';

    expect(cuerpo, 'El correo del dueño tiene que salir').toContain(email);
    expect(cuerpo, 'Y no el hueco de cuando no se resuelve').not.toContain('Correo no disponible');
  });

  /**
   * La misma regresión, por las otras dos puertas.
   *
   * El fallo del directorio estaba en **tres** sitios y solo se arregló uno al
   * verlo: la pestaña Equipo. La pantalla de Análisis —que pone nombre a un
   * `userId` en las propuestas del asistente— y la bandeja de avisos —donde cada
   * aviso guarda un `actorId`— arrastraban el mismo `/users?limit=100`.
   *
   * Se comprueba que **cargan** con el directorio lleno de gente ajena. Ninguna
   * de las dos tiene un texto tan delator como «Correo no disponible»: la
   * bandeja simplemente decía «Alguien», que es cierto y legible — y por eso el
   * fallo vivió tanto sin que nadie lo viera.
   */
  test('Análisis y la bandeja aguantan un directorio lleno', async ({ page }) => {
    await crearCuentaYEntrar(page);

    const alGateway = await contextoDePeticion.newContext({
      baseURL: process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000',
    });
    for (let i = 0; i < 8; i++) await registrar(alGateway);
    await alGateway.dispose();

    /* `/main` es la bandeja de avisos hoy: la pantalla suelta de notificaciones
       se retiró (`/notifications` redirige a `/main`) y su equivalente vive en
       el panel y en la pestaña de bandeja del `AppShell`. */
    for (const ruta of ['/reports', '/main']) {
      const respuesta = await page.goto(ruta);
      await page.waitForLoadState('networkidle');

      expect(respuesta?.status(), `${ruta} debería servirse`).toBeLessThan(400);
      expect(page.url(), `${ruta} no debería rebotar al login`).not.toContain('/auth/login');
    }
  });
});
