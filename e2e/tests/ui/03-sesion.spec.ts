import { expect, test } from '@playwright/test';
import { crearCuentaYEntrar, crearProyectoEnLaInterfaz } from '../../fixtures/ui';

/**
 * El recorrido completo en navegador: crear cuenta, entrar, moverse entre zonas
 * y salir.
 *
 * Es la prueba que atraviesa **todas** las piezas a la vez —shell, rewrites,
 * proxy de zona, cookie httpOnly, gateway— y por eso es la que más avisa cuando
 * algo se rompe de verdad.
 */

test.describe('Sesión en el navegador', () => {
  test('crear cuenta deja la sesión abierta y aterriza en el panel', async ({ page }) => {
    await crearCuentaYEntrar(page);

    await expect(page).toHaveURL(/\/dashboard/);
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

    for (const ruta of ['/dashboard', '/projects', '/reports']) {
      await page.goto(ruta);
      await expect(page, `${ruta} debería servirse con sesión`).not.toHaveURL(/\/auth\/login/);
    }
  });

  test('con sesión, el login redirige al panel en vez de mostrarse', async ({ page }) => {
    await crearCuentaYEntrar(page);

    /* El guard de auth-front: quien ya entró no debe ver el formulario. */
    await page.goto('/auth/login');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('el panel muestra la navegación del área privada', async ({ page }) => {
    await crearCuentaYEntrar(page);
    await page.goto('/dashboard');

    /* Los `href` de `APP_NAV_ITEMS` son rutas **del shell**, sin el basePath de
       ninguna zona. Si alguna se escribiera con el prefijo de su zona, el
       enlace saldría como `/dashboard/projects` y aquí se vería. */
    for (const href of ['/dashboard', '/projects', '/reports']) {
      await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
    }
  });

  test('salir borra la sesión y devuelve al área pública', async ({ page, context }) => {
    await crearCuentaYEntrar(page);
    await page.goto('/dashboard');

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/dashboard'), { timeout: 30_000 });

    const cookies = await context.cookies();
    const sesion = cookies.find((c) => c.name === 'praxis_session');
    expect(sesion?.value ?? '', 'La cookie debe quedar vacía o desaparecer').toBe('');

    /* Y el área privada vuelve a estar cerrada. */
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

test.describe('Proyectos desde la interfaz', () => {
  test('se crea un proyecto y aparece en el listado', async ({ page }) => {
    await crearCuentaYEntrar(page);

    const nombre = `Proyecto UI ${Date.now().toString(36)}`;
    await crearProyectoEnLaInterfaz(page, nombre);

    await expect(page.getByText(nombre)).toBeVisible({ timeout: 30_000 });
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
    await crearProyectoEnLaInterfaz(page, nombre);

    await page.getByText(nombre).first().click();
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
