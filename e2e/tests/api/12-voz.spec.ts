import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { comoBearer, data, registrar, type Usuario } from '../../fixtures/api';
import { crearMundo, crearTarea } from '../../fixtures/mundo';

/**
 * # La capa de voz, sin Alexa y sin túnel
 *
 * `alexa-service` tenía cero cobertura, y se daba por supuesto que hacía falta
 * un dispositivo para probarlo. **No hace falta.** La vinculación es una frase
 * que se canjea por un token opaco, y el `alexaUserId` es una cadena que manda
 * quien canjea: se puede inventar.
 *
 * Lo único que queda fuera es el modelo de intenciones —qué frases entiende
 * Alexa— y eso vive en la skill, no aquí.
 *
 * ## Los dos tokens, que no se mezclan
 *
 * - **JWT** (`praxis_session`) — la web. Abre `/alexa/link` y `/alexa/links`.
 * - **voiceToken** (`v_tok_v1_…`) — la voz. Opaco, no es un JWT, y es lo único
 *   que abre las rutas de lectura de `/alexa/projects/*`.
 *
 * Que **ninguno sirva para lo del otro** es la mitad del diseño: un token de voz
 * vive siete días en un dispositivo de salón y no puede valer para la web.
 */

test.describe.configure({ timeout: 120_000 });

interface Vinculacion {
  voiceToken: string;
  usuario: Usuario;
}

/** Genera la frase, la canja y devuelve el token de voz. */
async function vincular(
  request: APIRequestContext,
  usuario: Usuario,
  alexaUserId = `amzn1.ask.account.${Date.now().toString(36)}`,
): Promise<Vinculacion> {
  const semilla = await data<{ phrase: string; expiresInSeconds: number }>(
    await request.post('/api/alexa/link', { headers: comoBearer(usuario.accessToken) }),
  );

  const canje = await request.post('/api/alexa/link/redeem', {
    data: { phrase: semilla.phrase, alexaUserId },
  });
  expect(canje.status(), 'El canje debería emitir un token de voz').toBe(200);

  const { voiceToken } = await data<{ voiceToken: string }>(canje);
  return { voiceToken, usuario };
}

test.describe('Vinculación por frase', () => {
  test('la frase es de palabras y caduca en minutos', async ({ request }) => {
    const usuario = await registrar(request);

    const semilla = await data<{ phrase: string; expiresInSeconds: number }>(
      await request.post('/api/alexa/link', { headers: comoBearer(usuario.accessToken) }),
    );

    /* Palabras y no caracteres: hay que **dictarla en voz alta**. Un código
       alfanumérico es indictable, y ese es todo el motivo del diseño. */
    expect(semilla.phrase.split(' ').length).toBeGreaterThanOrEqual(3);
    expect(semilla.phrase).toMatch(/^[a-záéíóúñ ]+$/i);

    /* Cinco minutos: se dicta en el momento o no se dicta. */
    expect(semilla.expiresInSeconds).toBeGreaterThan(0);
    expect(semilla.expiresInSeconds).toBeLessThanOrEqual(600);
  });

  test('generar la frase exige sesión web', async ({ request }) => {
    const respuesta = await request.post('/api/alexa/link');
    expect(respuesta.status()).toBe(401);
  });

  test('una frase inventada no se canjea', async ({ request }) => {
    const respuesta = await request.post('/api/alexa/link/redeem', {
      data: { phrase: 'mesa silla ventana lampara', alexaUserId: 'amzn1.ask.account.INVENTADO' },
    });

    expect([400, 401, 404, 410], `Llegó ${respuesta.status()}`).toContain(respuesta.status());
  });

  /**
   * 🔴 Lo que separa un código de un solo uso de una contraseña permanente.
   *
   * Si la frase se pudiera canjear dos veces, cualquiera que la oyera —y se
   * dicta **en voz alta, en una habitación**— tendría su propio token.
   */
  test('la frase no se canjea dos veces', async ({ request }) => {
    const usuario = await registrar(request);

    const semilla = await data<{ phrase: string }>(
      await request.post('/api/alexa/link', { headers: comoBearer(usuario.accessToken) }),
    );

    const primero = await request.post('/api/alexa/link/redeem', {
      data: { phrase: semilla.phrase, alexaUserId: 'amzn1.ask.account.PRIMERO' },
    });
    expect(primero.status()).toBe(200);

    const segundo = await request.post('/api/alexa/link/redeem', {
      data: { phrase: semilla.phrase, alexaUserId: 'amzn1.ask.account.SEGUNDO' },
    });
    expect(segundo.status(), 'La frase se dicta en voz alta: un solo uso').not.toBe(200);
  });
});

test.describe('Los dos tokens no se mezclan', () => {
  test('un JWT no abre las rutas de voz', async ({ request }) => {
    const usuario = await registrar(request);

    const respuesta = await request.get('/api/alexa/me', {
      headers: comoBearer(usuario.accessToken),
    });

    expect(respuesta.status(), 'La voz tiene su propio guard y su propio token').toBe(401);
  });

  test('un token de voz no abre la API de la web', async ({ request }) => {
    const usuario = await registrar(request);
    const { voiceToken } = await vincular(request, usuario);

    /**
     * ⚠️ Lo importante del bloque.
     *
     * El token de voz vive siete días en un aparato de salón que responde a
     * quien hable. Si además abriera `/users/me` o `/projects`, ese aparato
     * sería una sesión web permanente sin contraseña.
     */
    for (const ruta of ['/api/users/me', '/api/projects', '/api/me/tasks']) {
      const respuesta = await request.get(ruta, { headers: comoBearer(voiceToken) });
      expect(respuesta.status(), `${ruta} no debería aceptar un token de voz`).toBe(401);
    }
  });

  test('el token de voz sí abre lo suyo', async ({ request }) => {
    const usuario = await registrar(request);
    const { voiceToken } = await vincular(request, usuario);

    /* La contraparte: cerrar la puerta equivocada no puede cerrar la buena. */
    const yo = await request.get('/api/alexa/me', { headers: comoBearer(voiceToken) });
    expect(yo.status()).toBe(200);

    const proyectos = await request.get('/api/alexa/projects', {
      headers: comoBearer(voiceToken),
    });
    expect(proyectos.status()).toBe(200);
  });

  test('un token de voz inventado no vale', async ({ request }) => {
    const respuesta = await request.get('/api/alexa/me', {
      headers: comoBearer('v_tok_v1_esto_me_lo_acabo_de_inventar'),
    });
    expect(respuesta.status()).toBe(401);
  });
});

test.describe('Revocar la vinculación', () => {
  test('el listado enseña las vinculaciones propias y solo esas', async ({ request }) => {
    const usuario = await registrar(request);
    await vincular(request, usuario);

    const mias = await data<{ id: string }[]>(
      await request.get('/api/alexa/links', { headers: comoBearer(usuario.accessToken) }),
    );
    expect(mias.length).toBeGreaterThan(0);

    /* A otra cuenta no le sale ninguna: el listado va por el userId del token. */
    const otra = await registrar(request);
    const suyas = await data<{ id: string }[]>(
      await request.get('/api/alexa/links', { headers: comoBearer(otra.accessToken) }),
    );
    expect(suyas).toHaveLength(0);
  });

  test('revocar deja el token de voz sin efecto de inmediato', async ({ request }) => {
    const usuario = await registrar(request);
    const { voiceToken } = await vincular(request, usuario);

    expect((await request.get('/api/alexa/me', { headers: comoBearer(voiceToken) })).status()).toBe(
      200,
    );

    const revocacion = await request.delete('/api/alexa/links', {
      headers: comoBearer(usuario.accessToken),
    });
    expect(revocacion.status()).toBe(200);

    /**
     * Sin esto, «desvincular» sería un botón decorativo: el aparato del salón
     * seguiría contestando durante días. Es la única forma que tiene alguien de
     * cortar el acceso de un dispositivo que ya no controla.
     */
    const despues = await request.get('/api/alexa/me', { headers: comoBearer(voiceToken) });
    expect(despues.status(), 'Revocar tiene que cortar ya, no al caducar').toBe(401);
  });

  test('no se revoca la vinculación de otra persona', async ({ request }) => {
    const duenno = await registrar(request);
    const { voiceToken } = await vincular(request, duenno);

    const mias = await data<{ id: string }[]>(
      await request.get('/api/alexa/links', { headers: comoBearer(duenno.accessToken) }),
    );

    const intrusa = await registrar(request);
    await request.delete(`/api/alexa/links/${mias[0].id}`, {
      headers: comoBearer(intrusa.accessToken),
    });

    /* Responda lo que responda, lo que importa es que no la haya tocado: el
       servicio filtra por userId, así que el borrado no alcanza a nadie. */
    const sigueViva = await request.get('/api/alexa/me', { headers: comoBearer(voiceToken) });
    expect(sigueViva.status(), 'Una revocación ajena no puede desconectar a nadie').toBe(200);
  });
});

test.describe('Lo que la voz puede leer', () => {
  test('los informes de voz responden sobre un proyecto propio', async ({ request }) => {
    const mundo = await crearMundo(request);
    await crearTarea(request, mundo.duenno.accessToken, mundo);
    const { voiceToken } = await vincular(request, mundo.duenno);

    /* Se selecciona el proyecto igual que lo haría la skill al oír su nombre. */
    const seleccion = await request.post(`/api/alexa/projects/${mundo.proyecto.id}/select`, {
      headers: comoBearer(voiceToken),
    });
    expect(seleccion.status()).toBe(200);

    for (const informe of ['progress', 'forecast', 'blocked-tasks', 'workload', 'members']) {
      const respuesta = await request.get(`/api/alexa/projects/${mundo.proyecto.id}/${informe}`, {
        headers: comoBearer(voiceToken),
      });
      expect(respuesta.status(), `El informe de voz «${informe}» debería responder`).toBe(200);
    }
  });

  /**
   * 🔴 El aislamiento, por la puerta de la voz.
   *
   * Es la misma regla que en la web, pero por un camino distinto y con otro
   * guard: si aquí se olvidara, no lo cazaría ninguna de las pruebas de la web.
   */
  test('la voz no lee un proyecto ajeno', async ({ request }) => {
    const mundo = await crearMundo(request);
    const extrana = await registrar(request);
    const { voiceToken } = await vincular(request, extrana);

    for (const informe of ['progress', 'forecast', 'workload', 'members']) {
      const respuesta = await request.get(`/api/alexa/projects/${mundo.proyecto.id}/${informe}`, {
        headers: comoBearer(voiceToken),
      });
      expect(
        [401, 403, 404],
        `«${informe}» respondió ${respuesta.status()} sobre un proyecto ajeno`,
      ).toContain(respuesta.status());
    }
  });

  test('la voz solo lee: no hay forma de escribir', async ({ request }) => {
    const mundo = await crearMundo(request);
    const { voiceToken } = await vincular(request, mundo.duenno);

    /* La capa de voz es de solo lectura por diseño. Comprobado desde fuera: las
       rutas de escritura de la web no aceptan este token. */
    const creacion = await request.post(`/api/boards/${mundo.boardId}/tasks`, {
      headers: comoBearer(voiceToken),
      data: {
        columnId: mundo.primeraColumna.id,
        title: 'Dictada',
        status: mundo.primeraColumna.name,
      },
    });
    expect(creacion.status()).toBe(401);
  });
});
