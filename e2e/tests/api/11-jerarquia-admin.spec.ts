import { expect, test } from '@playwright/test';
import { type Usuario, comoBearer, data, entrarComoAdmin, registrar } from '../../fixtures/api';

/**
 * # La jerarquía de la administración
 *
 * `06-administracion` comprueba que una cuenta corriente no entra.
 * `07-suspension` comprueba qué pasa al suspender.
 * Esto comprueba lo que queda, y es lo más delicado de los tres: **quién puede
 * actuar sobre quién entre administradores**.
 *
 * Tres reglas, y ninguna es evidente desde fuera:
 *
 * 1. **Nadie se administra a sí mismo.** Dejarse fuera no tiene deshacer:
 *    haría falta otra cuenta del mismo nivel o superior.
 * 2. **Solo hacia abajo.** Un `Admin` no toca a otro `Admin` ni a un
 *    `SuperAdmin`. Sin esto, cualquier administrador podría echar a todos los
 *    demás — el nivel dejaría de significar nada.
 * 3. **Ni siquiera un `SuperAdmin` crea otro `SuperAdmin`.** Conceder tu propio
 *    nivel es conceder el poder de echarte, y eso ya no es «hacia abajo».
 *
 * ⚠️ **El administrador de los seeds es `SuperAdmin`, no `Admin`.** Es fácil
 * escribir estas pruebas creyendo lo contrario y medir otra cosa: probar «actuar
 * sobre un igual» con un SuperAdmin sobre un Admin da 200 y parece un fallo
 * cuando es la regla funcionando. Por eso aquí el actor de nivel medio se
 * fabrica a propósito.
 */

/** Los cambios de rol y estado cruzan dos servicios; van holgados. */
test.describe.configure({ timeout: 120_000 });

/** Crea una cuenta y la sube a `Admin` usando al SuperAdmin de los seeds. */
async function fabricarAdmin(
  request: Parameters<typeof registrar>[0],
  tokenSuper: string,
): Promise<Usuario> {
  const cuenta = await registrar(request);

  const ascenso = await request.put(`/api/admin/users/${cuenta.userId}/role`, {
    headers: comoBearer(tokenSuper),
    data: { role: 'Admin', reason: 'Fabricado para la prueba de jerarquía' },
  });
  expect(ascenso.status(), 'Un SuperAdmin sí puede crear un Admin').toBe(200);

  /**
   * **No se vuelve a entrar, y es a propósito.**
   *
   * El token solo lleva `sub`: el rol global lo resuelve `GlobalRoleGuard`
   * consultando a permissions-service en cada petición, así que el token
   * emitido antes del ascenso vale igual.
   *
   * Volver a entrar «por si acaso» costaba un login por cada admin fabricado
   * —cinco por ejecución— y eso agota el límite de 10/min que añadimos nosotros:
   * la suite se tumbaba sola en `02-auth`, con un 429 donde la prueba esperaba
   * un 401.
   */
  return cuenta;
}

test.describe('Nadie se administra a sí mismo', () => {
  test('un SuperAdmin no se suspende a sí mismo', async ({ request }) => {
    const jefe = await entrarComoAdmin(request);

    const respuesta = await request.patch(`/api/admin/users/${jefe.userId}/status`, {
      headers: comoBearer(jefe.accessToken),
      data: { status: 'SUSPENDED', reason: 'No debería poder' },
    });

    expect(respuesta.status(), 'Dejarse fuera a uno mismo no tiene deshacer').toBe(403);
  });

  test('ni se cambia su propio rol', async ({ request }) => {
    const jefe = await entrarComoAdmin(request);

    const respuesta = await request.put(`/api/admin/users/${jefe.userId}/role`, {
      headers: comoBearer(jefe.accessToken),
      data: { role: 'User', reason: 'No debería poder' },
    });

    /* Degradarse a uno mismo es la misma trampa por la puerta de al lado: la
       cuenta perdería el panel y nadie podría devolvérselo. */
    expect(respuesta.status()).toBe(403);
  });
});

test.describe('Solo hacia abajo', () => {
  test('un Admin no suspende a otro Admin', async ({ request }) => {
    const jefe = await entrarComoAdmin(request);
    const unAdmin = await fabricarAdmin(request, jefe.accessToken);
    const otroAdmin = await fabricarAdmin(request, jefe.accessToken);

    const respuesta = await request.patch(`/api/admin/users/${otroAdmin.userId}/status`, {
      headers: comoBearer(unAdmin.accessToken),
      data: { status: 'SUSPENDED', reason: 'Entre iguales no' },
    });

    expect(respuesta.status(), 'Si un Admin puede echar a otro, el nivel no significa nada').toBe(
      403,
    );
  });

  test('un Admin no toca a un SuperAdmin', async ({ request }) => {
    const jefe = await entrarComoAdmin(request);
    const unAdmin = await fabricarAdmin(request, jefe.accessToken);

    const suspension = await request.patch(`/api/admin/users/${jefe.userId}/status`, {
      headers: comoBearer(unAdmin.accessToken),
      data: { status: 'SUSPENDED', reason: 'Hacia arriba no' },
    });
    expect(suspension.status()).toBe(403);

    const degradacion = await request.put(`/api/admin/users/${jefe.userId}/role`, {
      headers: comoBearer(unAdmin.accessToken),
      data: { role: 'User', reason: 'Hacia arriba no' },
    });
    expect(degradacion.status()).toBe(403);
  });

  test('un Admin sí administra una cuenta corriente', async ({ request }) => {
    const jefe = await entrarComoAdmin(request);
    const unAdmin = await fabricarAdmin(request, jefe.accessToken);
    const cualquiera = await registrar(request);

    /* La contraparte: cerrar hacia arriba no puede cerrar hacia abajo, o el rol
       de Admin no serviría para nada. */
    const respuesta = await request.patch(`/api/admin/users/${cualquiera.userId}/status`, {
      headers: comoBearer(unAdmin.accessToken),
      data: { status: 'SUSPENDED', reason: 'Esto sí entra en su nivel' },
    });

    expect(respuesta.status(), 'Un Admin administra hacia abajo').toBe(200);
  });
});

test.describe('El techo de SuperAdmin', () => {
  test('ni un SuperAdmin puede crear otro SuperAdmin', async ({ request }) => {
    const jefe = await entrarComoAdmin(request);
    const cuenta = await registrar(request);

    const respuesta = await request.put(`/api/admin/users/${cuenta.userId}/role`, {
      headers: comoBearer(jefe.accessToken),
      data: { role: 'SuperAdmin', reason: 'No debería poder' },
    });

    /**
     * Conceder tu propio nivel es conceder el poder de echarte, y la regla es
     * «solo hacia abajo». La consecuencia práctica —que el SuperAdmin de los
     * seeds no lo pueda suspender nadie, ni él mismo— es deliberada: la
     * plataforma no se queda sin administración por un clic.
     */
    expect(respuesta.status()).toBe(403);
  });

  test('un Admin no se asciende a sí mismo a SuperAdmin', async ({ request }) => {
    const jefe = await entrarComoAdmin(request);
    const unAdmin = await fabricarAdmin(request, jefe.accessToken);

    const respuesta = await request.put(`/api/admin/users/${unAdmin.userId}/role`, {
      headers: comoBearer(unAdmin.accessToken),
      data: { role: 'SuperAdmin', reason: 'Autoascenso' },
    });

    /* Sería la escalada de privilegios más directa que existe. Cae por la regla
       de no administrarse a uno mismo, pero conviene fijarlo por su nombre. */
    expect(respuesta.status()).toBe(403);
  });
});

test.describe('El rol que se guarda es el que se pidió', () => {
  test('el ascenso a Admin se refleja de verdad', async ({ request }) => {
    const jefe = await entrarComoAdmin(request);
    const cuenta = await registrar(request);

    const ascenso = await request.put(`/api/admin/users/${cuenta.userId}/role`, {
      headers: comoBearer(jefe.accessToken),
      data: { role: 'Admin', reason: 'Comprobación' },
    });
    expect(ascenso.status()).toBe(200);

    /* Se confirma contra el `data`, no contra el status: es la regla de la casa
       y aquí importa más que en ningún sitio — un ascenso que responde 200 y no
       guarda deja a alguien creyendo que administra. */
    const resultado = await data<{ globalRole: string }>(ascenso);
    expect(resultado.globalRole).toBe('Admin');

    const roles = await data<{ name: string }[]>(
      await request.get(`/api/permissions/user/${cuenta.userId}`, {
        headers: comoBearer(jefe.accessToken),
      }),
    );
    expect(roles.map((r) => r.name)).toContain('Admin');
  });
});
