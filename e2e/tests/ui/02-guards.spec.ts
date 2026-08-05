import { expect, test } from '@playwright/test';

/**
 * Los guards de zona.
 *
 * Cada zona privada trae el suyo en `src/proxy.ts` y **no delega en el shell**:
 * es lo que permite desplegar y probar una zona por su cuenta.
 *
 * ## Por qué la raíz de cada zona va en su propia prueba
 *
 * El `matcher` de Next con lookahead negativo —
 * `'/((?!_next/static|…).*)'` — **no casa la raíz**. Hay que añadir `'/'` como
 * entrada aparte o la página principal de la zona se sirve sin guard. Pasó de
 * verdad: `/dashboard/perfil` sí redirigía y `/dashboard` a secas no, que es la
 * forma de fallo más fácil de pasar por alto porque solo se nota en una URL de
 * cada zona.
 *
 * Por eso cada zona tiene dos pruebas: la raíz y una ruta interior.
 */

/** Las tres zonas privadas y una ruta interior de cada una. */
const ZONAS = [
  { nombre: 'dashboard-front', raiz: '/dashboard', interior: '/dashboard/settings' },
  { nombre: 'projects-front', raiz: '/projects', interior: '/projects/no-existe-este-slug' },
  { nombre: 'reports-front', raiz: '/reports', interior: '/reports/no-existe-este-slug' },
] as const;

test.describe('Sin sesión, todo lo privado manda al login', () => {
  for (const zona of ZONAS) {
    test(`${zona.nombre}: la raíz (${zona.raiz}) redirige al login`, async ({ page }) => {
      await page.goto(zona.raiz);

      await expect(
        page,
        'Si esto falla, revisa que el matcher del proxy lleve «/» como entrada aparte',
      ).toHaveURL(/\/auth\/login/);
    });

    test(`${zona.nombre}: una ruta interior (${zona.interior}) redirige al login`, async ({
      page,
    }) => {
      await page.goto(zona.interior);
      await expect(page).toHaveURL(/\/auth\/login/);
    });
  }

  test('el redirect sale al origen público, no al puerto interno de la zona', async ({ page }) => {
    await page.goto('/dashboard');

    /**
     * `redirectToZone` construye la URL sobre `x-forwarded-host`, no sobre
     * `request.url`. Con `request.url` el usuario acabaría en `localhost:4102`
     * —el puerto interno— y saldría del shell sin que nada lo avise.
     */
    const url = new URL(page.url());
    expect(url.port, `Se salió del shell: ${page.url()}`).not.toBe('4102');
    expect(url.port).not.toBe('4103');
    expect(url.port).not.toBe('4104');
  });

  test('el proxy de gateway responde JSON, no un redirect HTML', async ({ request }) => {
    /**
     * `/api/` está excluido del matcher a propósito: quien pide JSON no debe
     * recibir la página de login. Si el proxy entrara en el guard, el cliente
     * intentaría `JSON.parse` de un documento HTML y el error resultante no
     * diría nada sobre la sesión.
     */
    const respuesta = await request.get('http://localhost:4102/dashboard/api/gateway/users/me');

    expect(respuesta.status()).toBe(401);
    expect(respuesta.headers()['content-type']).toContain('application/json');

    const sobre = await respuesta.json();
    expect(sobre.success).toBe(false);
  });
});
