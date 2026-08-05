import { expect, test } from '@playwright/test';
import { comoBearer, data, error, registrar } from '../../fixtures/api';

/**
 * El contrato de respuesta del gateway.
 *
 * Todo lo demás —el cliente de navegador, el cliente de servidor, los cinco
 * proxies de zona— asume que **toda** respuesta viene envuelta. `unwrapEnvelope`
 * lanza si no lo está, así que un endpoint que devuelva el objeto pelado no da
 * un fallo local: rompe la pantalla que lo consume, lejos de donde está la causa.
 *
 * Estas pruebas fijan esa forma para que un cambio en el interceptor o en el
 * filtro de excepciones se note aquí y no en producción.
 */

test.describe('Contrato de respuesta', () => {
  test('el éxito viene envuelto en {success, data}', async ({ request }) => {
    const usuario = await registrar(request);

    const respuesta = await request.get('/api/users/me', {
      headers: comoBearer(usuario.accessToken),
    });

    expect(respuesta.status()).toBe(200);

    const sobre = await respuesta.json();
    expect(sobre).toHaveProperty('success', true);
    expect(sobre).toHaveProperty('data');
    expect(sobre.data).toMatchObject({ id: usuario.userId });
  });

  test('el error viene envuelto en {success:false, error:{code,message}}', async ({ request }) => {
    const respuesta = await request.post('/api/auth/login', {
      data: { email: 'nadie@praxis.test', password: 'NoExiste@12345!' },
    });

    expect(respuesta.status()).toBe(401);

    const fallo = await error(respuesta);
    expect(fallo).toHaveProperty('code');
    expect(fallo).toHaveProperty('message');
    expect(typeof fallo.message).toBe('string');
  });

  test('un endpoint inexistente responde 404 envuelto, no HTML de Nest', async ({ request }) => {
    const respuesta = await request.get('/api/no-existe-esta-ruta');

    expect(respuesta.status()).toBe(404);
    expect(respuesta.headers()['content-type']).toContain('application/json');
    await error(respuesta);
  });

  /**
   * `forbidNonWhitelisted` en el ValidationPipe global. Es la regla que más
   * veces nos ha mordido —«envía solo los campos que el DTO declara»— y la que
   * más fácil se desactiva sin querer al tocar `main.ts`.
   */
  test('un campo de más en el cuerpo da 400', async ({ request }) => {
    const usuario = await registrar(request);

    const respuesta = await request.post('/api/projects', {
      headers: comoBearer(usuario.accessToken),
      data: { name: 'Proyecto con campo de sobra', campoQueNoExiste: true },
    });

    expect(
      respuesta.status(),
      'forbidNonWhitelisted debería rechazar el campo desconocido',
    ).toBe(400);
  });

  test('un cuerpo que incumple el DTO da 400 con los mensajes en details', async ({ request }) => {
    const respuesta = await request.post('/api/auth/register', {
      data: { email: 'esto-no-es-un-correo', password: 'corta' },
    });

    expect(respuesta.status()).toBe(400);

    const fallo = await error(respuesta);
    expect(fallo.details, 'Los mensajes de class-validator deberían viajar en details').toBeTruthy();
  });

  /**
   * Los listados paginados salen como `{ items, total }`. La molécula
   * `Pagination` lee `total` para calcular las páginas: si el backend devolviera
   * un array pelado, el componente pinta cero páginas sin quejarse.
   */
  test('los listados traen items y total', async ({ request }) => {
    const usuario = await registrar(request);

    const respuesta = await request.get('/api/projects?page=1&limit=5', {
      headers: comoBearer(usuario.accessToken),
    });

    expect(respuesta.status()).toBe(200);

    const pagina = await data<{ items: unknown[]; total: number }>(respuesta);
    expect(Array.isArray(pagina.items)).toBe(true);
    expect(typeof pagina.total).toBe('number');
  });
});
