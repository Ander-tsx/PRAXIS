import { expect, test } from '@playwright/test';
import {
  SEED,
  comoBearer,
  correoUnico,
  data,
  entrar,
  error,
  intentarLogin,
  registrar,
  registrarSinConfirmar,
} from '../../fixtures/api';

/**
 * Autenticación: registro, login, renovación y cierre de sesión.
 *
 * Es la base de todo lo demás. Si el login cambia de forma —`access_token` en
 * vez de `accessToken`, por ejemplo, que ya nos pasó— no falla el login: fallan
 * las cuarenta pantallas que vienen detrás, con un 401 que no explica nada.
 */

/* La prueba del correo inexistente puede esperar la ventana del límite. */
test.describe.configure({ timeout: 90_000 });

test.describe('Autenticación', () => {
  /**
   * ⚠️ **Registrarse ya NO abre sesión, y esta prueba existe para fijarlo.**
   *
   * Antes comprobaba que el registro devolvía `accessToken`. Desde `2bc9983`
   * devuelve `{ userId, email, verificacionPendiente }` sin tokens: la cuenta
   * nace sin confirmar y se entra por el login, después de confirmar. Es el
   * punto entero de la verificación por correo — con tokens en el registro,
   * cualquiera se daba de alta con un correo inventado y se quedaba dentro.
   *
   * La prueba vieja siguió afirmando el contrato anterior y **arrastró a toda la
   * suite**: `accessToken` valía `undefined`, todo salía con
   * `Authorization: Bearer undefined` y caía en 401.
   */
  test('el registro no abre sesión: la cuenta nace sin confirmar', async ({ request }) => {
    const email = correoUnico();

    const respuesta = await request.post('/api/auth/register', {
      data: { email, password: 'Prueba@12345!' },
    });

    expect(respuesta.status()).toBe(201);

    const alta = await data<Record<string, unknown>>(respuesta);

    expect(alta).toHaveProperty('userId');
    expect(alta).toHaveProperty('verificacionPendiente', true);

    /* Lo importante es lo que NO viene: un token aquí sería saltarse la
       confirmación. */
    expect(alta).not.toHaveProperty('accessToken');
    expect(alta).not.toHaveProperty('refreshToken');
    expect(alta).not.toHaveProperty('access_token');
  });

  /**
   * La otra mitad: sin confirmar no se entra.
   *
   * Va con `EMAIL_NOT_VERIFIED` en `details` y no solo con un 403, porque es lo
   * que la pantalla de login mira para ofrecer el botón de reenviar en vez de
   * decir «credenciales incorrectas».
   */
  test('sin confirmar el correo, el login lo rechaza y dice por qué', async ({ request }) => {
    const { email, password } = await registrarSinConfirmar(request);

    const respuesta = await intentarLogin(request, { email, password });

    expect(respuesta.status()).toBe(403);
    const fallo = await error(respuesta);
    expect((fallo.details as { code?: string })?.code).toBe('EMAIL_NOT_VERIFIED');
  });

  /* Y confirmada, se entra con los tres campos en camelCase de siempre.
     camelCase y no snake_case: el backend devolvió `access_token` en su día y
     el frontend leía `undefined` sin error hasta la siguiente petición. */
  test('una vez confirmada, el login devuelve los tres campos en camelCase', async ({
    request,
  }) => {
    const usuario = await registrar(request);

    expect(typeof usuario.accessToken).toBe('string');
    expect(typeof usuario.refreshToken).toBe('string');
    expect(typeof usuario.userId).toBe('string');
  });

  test('el registro no acepta firstName ni lastName', async ({ request }) => {
    const respuesta = await request.post('/api/auth/register', {
      data: { email: correoUnico(), password: 'Prueba@12345!', firstName: 'Ana' },
    });

    expect(respuesta.status(), 'El perfil se crea vacío; el DTO no declara el nombre').toBe(400);
  });

  test('un email repetido da 409', async ({ request }) => {
    const usuario = await registrar(request);

    const respuesta = await request.post('/api/auth/register', {
      data: { email: usuario.email, password: 'Otra@12345!' },
    });

    expect(respuesta.status()).toBe(409);
    const fallo = await error(respuesta);
    expect(fallo.message).toContain('registrado');
  });

  test('una contraseña de menos de 8 caracteres se rechaza', async ({ request }) => {
    const respuesta = await request.post('/api/auth/register', {
      data: { email: correoUnico(), password: 'corta12' },
    });

    expect(respuesta.status()).toBe(400);
  });

  test('el login de los seeds funciona', async ({ request }) => {
    const sesion = await entrar(request, SEED.admin);

    expect(sesion.userId).toBeTruthy();
    expect(sesion.accessToken).toBeTruthy();
  });

  test('una contraseña incorrecta da 401 sin decir cuál de los dos falla', async ({ request }) => {
    const usuario = await registrar(request);

    const respuesta = await intentarLogin(request, {
      email: usuario.email,
      password: 'Incorrecta@12345!',
    });

    expect(respuesta.status()).toBe(401);

    const fallo = await error(respuesta);
    /* «Credenciales inválidas» y no «esa contraseña no es»: distinguirlos deja
       enumerar qué correos tienen cuenta. */
    expect(fallo.message.toLowerCase()).toContain('credenciales');
  });

  test('un correo que no existe da el mismo 401 que una contraseña mala', async ({ request }) => {
    /**
     * ⚠️ Se reintenta ante un 429. Esta prueba afirma sobre el **código** que
     * devuelve el login, así que el límite de intentos que añadimos nosotros la
     * tumba: sale 429 donde espera 401 y el fallo parece de autenticación.
     */
    let respuesta = await intentarLogin(request, {
      email: correoUnico('fantasma'),
      password: 'Prueba@12345!',
    });

    if (respuesta.status() === 429) {
      await new Promise((listo) => setTimeout(listo, 61_000));
      respuesta = await intentarLogin(request, {
        email: correoUnico('fantasma'),
        password: 'Prueba@12345!',
      });
    }

    expect(respuesta.status(), 'Mismo código que la contraseña incorrecta').toBe(401);
  });

  test('el refresh devuelve un access token nuevo', async ({ request }) => {
    const usuario = await registrar(request);

    const respuesta = await request.post('/api/auth/refresh', {
      data: { refreshToken: usuario.refreshToken },
    });

    expect(respuesta.status()).toBe(200);

    const renovado = await data<{ accessToken: string }>(respuesta);
    expect(typeof renovado.accessToken).toBe('string');
    expect(renovado.accessToken.split('.')).toHaveLength(3);
  });

  test('un refresh token inventado da 401', async ({ request }) => {
    const respuesta = await request.post('/api/auth/refresh', {
      data: { refreshToken: 'esto.no.es.un.jwt' },
    });

    expect(respuesta.status()).toBe(401);
  });

  test('sin Authorization, una ruta privada da 401', async ({ request }) => {
    const respuesta = await request.get('/api/users/me');
    expect(respuesta.status()).toBe(401);
  });

  test('un token con la firma cambiada da 401', async ({ request }) => {
    const usuario = await registrar(request);

    /* Mismo payload, firma de otro: es la manipulación más obvia y la que un
       guard que solo mirase `exp` dejaría pasar. */
    const partes = usuario.accessToken.split('.');
    const manipulado = `${partes[0]}.${partes[1]}.firmaFalsaFirmaFalsaFirmaFalsa`;

    const respuesta = await request.get('/api/users/me', { headers: comoBearer(manipulado) });
    expect(respuesta.status()).toBe(401);
  });

  test('un esquema que no es Bearer se rechaza', async ({ request }) => {
    const usuario = await registrar(request);

    const respuesta = await request.get('/api/users/me', {
      headers: { Authorization: `Basic ${usuario.accessToken}` },
    });

    expect(respuesta.status()).toBe(401);
  });

  test('el logout responde 200 e invalida el refresh token', async ({ request }) => {
    const usuario = await registrar(request);

    const salida = await request.post('/api/auth/logout', {
      headers: comoBearer(usuario.accessToken),
    });
    expect(salida.status()).toBe(200);

    /* La sesión de Redis se borra, así que el refresh ya no puede canjearse.
       Es la mitad del cierre de sesión que sí funciona hoy; la otra mitad —que
       el access token deje de valer— está en 06-seguridad. */
    const renovar = await request.post('/api/auth/refresh', {
      data: { refreshToken: usuario.refreshToken },
    });
    expect(renovar.status(), 'Tras el logout el refresh token debe morir').toBe(401);
  });
});
