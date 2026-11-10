import { type Page, expect, test } from '@playwright/test';
import { crearCuentaYEntrar } from '../../fixtures/ui';

/**
 * La PWA (M1 de `docs/PLAN-MOVIL.md`): que se instala bien, que el service
 * worker toma el mando y que su único trabajo es la pantalla «Sin conexión».
 * Desde 2026-11-10 no guarda nada más: ni estáticos, ni pantallas, ni datos.
 */

/**
 * Espera a que el SW controle la página.
 *
 * El primero se activa tras instalarse; la página que lo registró solo queda
 * controlada desde la siguiente navegación. Se espera al estado `activated` —no
 * a que exista `active`, que también vale durante `activating`— antes de
 * recargar: recargando en mitad de la activación, esa navegación puede salir
 * sin controlar (una carrera del navegador, no de la app: la siguiente ya va
 * controlada). Por eso, si aun así no toma el mando, se recarga una vez más.
 */
async function conServiceWorker(page: Page) {
  await page.waitForFunction(async () => {
    const registro = await navigator.serviceWorker.getRegistration();
    return registro?.active?.state === 'activated';
  });
  for (let intento = 0; intento < 2; intento++) {
    await page.reload();
    const controlada = await page
      .waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (controlada) return;
  }
  throw new Error('El service worker no tomó el mando de la página tras dos recargas');
}

test('el manifiesto trae identidad, iconos maskable y accesos directos', async ({ request }) => {
  const manifiesto = await (await request.get('/manifest.webmanifest')).json();
  expect(manifiesto.id).toBe('/');
  expect(manifiesto.display).toBe('standalone');
  expect(manifiesto.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  expect(manifiesto.shortcuts.map((s: { url: string }) => s.url)).toEqual([
    '/projects',
    '/chat',
    '/assistant',
  ]);
});

test('sw.js nunca se guarda en la caché HTTP', async ({ request }) => {
  const respuesta = await request.get('/sw.js');
  expect(respuesta.headers()['cache-control']).toContain('no-store');
});

test('el SW toma el mando y precarga «Sin conexión» sin scripts', async ({ page }) => {
  await page.goto('/auth/login');
  await conServiceWorker(page);

  const precargada = await page.evaluate(async () => {
    const respuesta = await caches.match('/sin-conexion');
    return respuesta ? await respuesta.text() : null;
  });
  expect(precargada).toContain('Sin conexión');
  /* I3/D4: se guarda sin `<script>`, para que no hidrate otra ruta sin red. */
  expect(precargada).not.toMatch(/<script\b/i);
});

test('sin red, una navegación enseña «Sin conexión» en la URL pedida', async ({
  page,
  context,
}) => {
  await crearCuentaYEntrar(page);
  await conServiceWorker(page);

  await context.setOffline(true);
  await page.goto('/chat').catch(() => undefined);
  await expect(page.getByRole('heading', { name: 'Sin conexión' })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/chat');
  await expect(page.getByRole('link', { name: 'Reintentar' })).toBeVisible();

  /* Vuelve la red y «Reintentar» recarga la pantalla de verdad. */
  await context.setOffline(false);
  await page.getByRole('link', { name: 'Reintentar' }).click();
  await expect(page.getByRole('heading', { name: 'Sin conexión' })).toHaveCount(0);
});

test('sin red, el gateway no se sirve de ninguna caché (I2, I3)', async ({ page, context }) => {
  await crearCuentaYEntrar(page);
  await conServiceWorker(page);
  /* Con red, la petición sale bien… */
  const conRed = await page.evaluate(async () => (await fetch('/api/gateway/users/me')).status);
  expect(conRed).toBe(200);

  /* …y sin red falla: nadie la guardó. */
  await context.setOffline(true);
  const sinRed = await page.evaluate(async () => {
    try {
      await fetch('/api/gateway/users/me');
      return 'respondió';
    } catch {
      return 'falló';
    }
  });
  expect(sinRed).toBe('falló');
  await context.setOffline(false);

  const guardadas = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const nombre of await caches.keys()) {
      /* Ya no hay cachés por persona ni de estáticos: solo la de «Sin conexión». */
      if (!nombre.startsWith('praxis-sin-conexion-')) urls.push(`caché inesperada: ${nombre}`);
      const cache = await caches.open(nombre);
      for (const peticion of await cache.keys()) urls.push(new URL(peticion.url).pathname);
    }
    return urls;
  });
  expect(guardadas.filter((u) => u.startsWith('/api/'))).toEqual([]);
  /* Ni HTML de la aplicación ni datos: solo la pantalla «Sin conexión» y sus hojas. */
  const publico =
    /^\/(_next\/static\/|icons\/|fonts\/|media\/|manifest\.webmanifest$|(apple-)?icon[^/]*\.png$|sin-conexion$)/;
  expect(guardadas.filter((u) => !publico.test(u))).toEqual([]);
});

test('la app registra siempre /sw.js, sin versión en la URL (D6)', async ({ page }) => {
  /* Con la URL fija, el servidor siempre sirve el último script y una pestaña
     vieja no puede registrar una versión anterior como si fuera nueva. */
  await page.goto('/auth/login');
  await conServiceWorker(page);
  const script = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '');
  expect(new URL(script).pathname).toBe('/sw.js');
  expect(new URL(script).search).toBe('');
});

test('una versión nueva toma el mando sin recargar la página ni avisar', async ({ page }) => {
  await page.goto('/auth/login');
  await conServiceWorker(page);

  /**
   * Un despliegue de verdad cambia los bytes de `/sw.js`, pero Playwright no
   * puede interceptar la descarga del propio script del SW para fingirlo. Lo
   * más parecido: registrar el mismo SW con otra URL en el mismo ámbito. Para
   * el navegador es un SW nuevo y recorre el mismo camino —instalar, activar—.
   */
  await page.evaluate(() => {
    (window as unknown as { __sigue: boolean }).__sigue = true;
  });
  await page.evaluate(() => navigator.serviceWorker.register('/sw.js?simulacro=1', { scope: '/' }));
  await page.waitForFunction(() =>
    navigator.serviceWorker.controller?.scriptURL.includes('simulacro=1'),
  );

  /* Ya no se recarga: no hay nada guardado que pueda quedar viejo. Ni hay aviso que pulsar. */
  expect(await page.evaluate(() => (window as unknown as { __sigue?: boolean }).__sigue)).toBe(
    true,
  );
  await expect(page.getByText('Hay una versión nueva')).toHaveCount(0);
});

test('al activarse borra las cachés que dejó la versión anterior', async ({ page }) => {
  await page.goto('/auth/login');
  await conServiceWorker(page);

  /* Las que creaban M1 y M7: estáticos, recursos, pantallas por persona y su huella. */
  await page.evaluate(async () => {
    for (const nombre of [
      'praxis-estaticos-vieja',
      'praxis-recursos-vieja',
      'praxis-paginas-vieja',
      'praxis-datos-abc123',
      'praxis-sesion',
    ]) {
      await (await caches.open(nombre)).put('/x', new Response('viejo'));
    }
    await navigator.serviceWorker.register('/sw.js?simulacro=2', { scope: '/' });
  });
  await page.waitForFunction(() =>
    navigator.serviceWorker.controller?.scriptURL.includes('simulacro=2'),
  );

  /* El borrado va justo después de tomar el mando: se espera a que termine. */
  await expect
    .poll(async () =>
      (await page.evaluate(() => caches.keys())).filter(
        (n) => !n.startsWith('praxis-sin-conexion-'),
      ),
    )
    .toEqual([]);
});
