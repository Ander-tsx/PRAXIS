import { expect, test } from '@playwright/test';
import { type Usuario, comoBearer, data, registrar } from '../../fixtures/api';

/**
 * La presencia, por la API.
 *
 * ## Qué se está probando en realidad
 *
 * Que **la presencia que sale por la API no es la columna de la base**. Son dos
 * datos cruzados: lo que la persona eligió y si tiene una conexión abierta, y el
 * cruce lo hace el gateway en el último punto por el que pasa un perfil.
 *
 * El estado era front-driven —el navegador avisaba al cerrar la pestaña— así que
 * una conexión que se corta, una batería que se agota o un navegador que se cae
 * dejaban la cuenta «Disponible» **para siempre**. Usuarios fantasma que salían
 * en verde en el chat, en el equipo del proyecto y en la lista de
 * conversaciones. Nada fallaba; sencillamente el dato era mentira.
 *
 * ## Por qué aquí solo se ve media tabla
 *
 * Estas pruebas **no abren un flujo SSE**, así que para el servidor ninguna de
 * estas cuentas está conectada y la respuesta correcta es siempre `AWAY`. Esa es
 * justo la mitad que hay que blindar: es la que se rompe sola si alguien
 * «simplifica» devolviendo la columna.
 *
 * La otra mitad —que estando conectado se respeta lo elegido— es una función
 * pura y se prueba donde vive, sin montar nada:
 * `gateway/src/presence/presence.service.spec.ts`.
 */

/** Los campos del perfil que estas pruebas miran. */
interface Perfil {
  id: string;
  presence: string;
}

/** Cambia el estado elegido y devuelve el perfil tal como responde la API. */
async function elegirEstado(
  request: import('@playwright/test').APIRequestContext,
  usuario: Usuario,
  presence: string,
): Promise<Perfil> {
  const respuesta = await request.patch(`/api/users/${usuario.userId}`, {
    headers: comoBearer(usuario.accessToken),
    data: { presence },
  });
  expect(respuesta.status(), `Elegir «${presence}»`).toBe(200);
  return data<Perfil>(respuesta);
}

test.describe('Presencia efectiva', () => {
  test('sin conexión abierta, la presencia servida es AWAY elija lo que elija', async ({
    request,
  }) => {
    const persona = await registrar(request);

    for (const elegido of ['AVAILABLE', 'BUSY', 'IN_MEETING', 'EATING', 'DO_NOT_DISTURB']) {
      await elegirEstado(request, persona, elegido);

      const detalle = await request.get(`/api/users/${persona.userId}`, {
        headers: comoBearer(persona.accessToken),
      });
      expect(detalle.status()).toBe(200);

      expect(
        (await data<Perfil>(detalle)).presence,
        `Elegido «${elegido}» y sin flujo abierto`,
      ).toBe('AWAY');
    }
  });

  test('la respuesta del propio cambio ya viene cruzada', async ({ request }) => {
    /* Es el sitio más fácil de olvidar: el `PATCH` tiene el valor nuevo en la
       mano y devolverlo tal cual parece lo natural. Pero entonces quien acaba de
       ponerse «Ocupado» se ve «Ocupado» y el resto le ve «Ausente», y esa
       discrepancia entre la propia pantalla y las demás es imposible de
       diagnosticar mirando una sola. */
    const persona = await registrar(request);

    expect((await elegirEstado(request, persona, 'BUSY')).presence).toBe('AWAY');
  });

  test('`/users/me` tampoco se salta el cruce', async ({ request }) => {
    const persona = await registrar(request);
    await elegirEstado(request, persona, 'DO_NOT_DISTURB');

    const mio = await request.get('/api/users/me', {
      headers: comoBearer(persona.accessToken),
    });
    expect(mio.status()).toBe(200);
    expect((await data<Perfil>(mio)).presence).toBe('AWAY');
  });

  test('en `?ids=` se cruza toda la lista, no solo el primero', async ({ request }) => {
    /* ⚠️ **El fallo que esta prueba busca es de una sola línea.** El cruce se
       hace con un `MGET` para toda la lista; un `conPresenciaReal` que se
       aplicara solo al primer elemento —o un `map` que devolviera el original en
       la rama sin marca— compilaría igual y solo se notaría con dos personas
       delante. Con tres, uno de ellos en medio, el fallo tiene dónde esconderse
       y aquí no lo hace. */
    const primera = await registrar(request);
    const segunda = await registrar(request);
    const tercera = await registrar(request);

    await elegirEstado(request, primera, 'AVAILABLE');
    await elegirEstado(request, segunda, 'BUSY');
    await elegirEstado(request, tercera, 'IN_MEETING');

    const ids = [primera.userId, segunda.userId, tercera.userId];
    const lista = await request.get('/api/users', {
      headers: comoBearer(primera.accessToken),
      params: { ids: ids.join(',') },
    });
    expect(lista.status()).toBe(200);

    const { items } = await data<{ items: Perfil[]; total: number }>(lista);
    expect(items).toHaveLength(3);

    for (const perfil of items) {
      expect(perfil.presence, `El perfil ${perfil.id} de la lista`).toBe('AWAY');
    }
  });

  test('un estado que no existe se rechaza', async ({ request }) => {
    /* El conjunto es cerrado a propósito: un texto libre por persona convierte
       la lista del equipo en algo que no se lee de un vistazo ni se traduce. */
    const persona = await registrar(request);

    const respuesta = await request.patch(`/api/users/${persona.userId}`, {
      headers: comoBearer(persona.accessToken),
      data: { presence: 'DE_FIESTA' },
    });

    expect(respuesta.status()).toBe(400);
  });

  test('la presencia de otra persona no se cambia desde fuera', async ({ request }) => {
    const persona = await registrar(request);
    const intrusa = await registrar(request);

    const respuesta = await request.patch(`/api/users/${persona.userId}`, {
      headers: comoBearer(intrusa.accessToken),
      data: { presence: 'DO_NOT_DISTURB' },
    });

    expect(respuesta.status()).toBe(403);
  });
});
