import { expect, test } from '@playwright/test';
import { campos } from '../../fixtures/ui';

/**
 * Lo que se ve sin haber entrado.
 *
 * El shell no sirve páginas de negocio: es la cáscara —landing, `rewrites()` y
 * la renovación de sesión—. Estas pruebas comprueban que esa cáscara responde y
 * que los atajos de navegación llevan donde dicen.
 */

test.describe('Zona pública', () => {
  test('la landing responde sin sesión', async ({ page }) => {
    const respuesta = await page.goto('/');

    expect(respuesta?.status()).toBe(200);
    await expect(page).toHaveURL(/\/$/);
  });

  test('la landing ofrece entrar y crear cuenta', async ({ page }) => {
    await page.goto('/');

    /* Se busca por destino y no por texto: el copy cambia con el diseño, el
       destino no. */
    await expect(page.locator('a[href="/auth/login"]').first()).toBeVisible();
    await expect(page.locator('a[href="/auth/signup"]').first()).toBeVisible();
  });

  test('/login es un atajo a /auth/login', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/auth\/login$/);
  });

  test('/signup es un atajo a /auth/signup', async ({ page }) => {
    await page.goto('/signup');
    await expect(page).toHaveURL(/\/auth\/signup$/);
  });

  /**
   * El rewrite del shell hacia auth-front. Si se cae, `/auth/login` da 404 del
   * shell en vez de la pantalla de la zona — y el fallo se parece a un problema
   * de rutas de Next cuando en realidad es de `next.config.ts`.
   */
  test('el rewrite hacia auth-front sirve el formulario de login', async ({ page }) => {
    await page.goto('/auth/login');

    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page.locator(campos.email)).toBeVisible();
    await expect(page.locator(campos.password)).toBeVisible();
  });

  test('el formulario de registro también se sirve', async ({ page }) => {
    await page.goto('/auth/signup');

    await expect(page.getByRole('heading', { name: 'Crear cuenta' })).toBeVisible();
    await expect(page.locator(campos.email)).toBeVisible();
    await expect(page.locator(campos.confirmarPassword)).toBeVisible();
  });

  test('la validación de cliente avisa antes de salir a la red', async ({ page }) => {
    await page.goto('/auth/login');

    await page.locator(campos.email).fill('esto-no-es-un-correo');
    await page.locator(campos.password).fill('unaContrasennaLarga');

    /* Sin petición de por medio: el mensaje llega antes y marca el campo, que
       es justo el motivo de validar también en el cliente. */
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByText(/formato válido/i)).toBeVisible();
  });

  test('unas credenciales inválidas muestran el error del servidor', async ({ page }) => {
    await page.goto('/auth/login');

    await page.locator(campos.email).fill('nadie@praxis.test');
    await page.locator(campos.password).fill('NoExiste@12345!');
    await page.getByRole('button', { name: 'Entrar' }).click();

    /**
     * Se busca el texto y no `getByRole('alert')` a secas: Next monta su propio
     * anunciador de rutas (`#__next-route-announcer__`) con ese mismo rol y
     * vacío, así que el rol solo devuelve dos elementos y Playwright falla por
     * modo estricto sin que haya nada roto en la página.
     */
    await expect(page.getByText(/credenciales inválidas/i)).toBeVisible();
  });
});
