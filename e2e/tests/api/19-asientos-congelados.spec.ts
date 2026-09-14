import { type APIRequestContext, expect, test } from '@playwright/test';
import { comoBearer, crearProyecto, data, error, nombreUnico, registrar } from '../../fixtures/api';
import { cancelarPlan, darPlan } from '../../fixtures/suscripcion';

/**
 * Bajar de plan no puede echar a nadie: se congela dentro, en solo lectura.
 *
 * ## Lo que se fija aquí
 *
 * Es A7 de `docs/PLAN-ASIENTOS-CONGELADOS.md`, y el caso literal del encargo:
 * cinco personas, se acaba el plan, **las dos últimas en llegar se quedan
 * congeladas dentro**. Las quince pruebas de `congelados.spec.ts` ya fijan el
 * corte —quién entra en la cola y en qué orden—; lo que esto comprueba es lo
 * otro, que es lo que no se puede probar sin el stack entero:
 *
 * 1. 🔴 **Que congelado de verdad no escribe.** El cálculo puede ser perfecto y
 *    no estar invocado desde ningún guard — que es exactamente lo que pasó tres
 *    veces con las cuotas del plan (trampas 20 y 23 de `CLAUDE.md`): un número
 *    escrito en `plans.ts` que no comprobaba nadie. Una cuota que no se
 *    comprueba no da ningún error.
 * 2. 🔴 **Que congelado sí lee.** Es la mitad del encargo y la más fácil de
 *    romper de más: bloquear entero es indistinguible de haber echado a alguien.
 * 3. 🔴 **Que volver a pagar descongela solo**, sin que nadie reinvite a nadie
 *    ni toque una fila. Es el invariante 3, y lo que hace cierto el diseño
 *    derivado de D1.
 *
 * ## ⚠️ Por qué el plan se pone escribiendo en la base
 *
 * Quien concede un plan es el webhook de Stripe, con la firma comprobada, y ese
 * endpoint no se toca. Ver `e2e/fixtures/suscripcion.ts`, que lo explica: es el
 * segundo y último sitio de la suite que no pasa por el gateway.
 *
 * Todo lo demás —invitar, aceptar, crear, escribir, el 403— va por la API igual
 * que lo haría un navegador.
 */

/** Asientos contratados mientras hay plan. Con el dueño dentro, caben cinco. */
const ASIENTOS_CONTRATADOS = 5;

/** Lo que admite el plan gratuito. Al cancelar, el tope pasa a ser este. */
const ASIENTOS_GRATIS = 3;

/** Crea una organización de equipo y devuelve su id. */
async function crearOrganizacion(request: APIRequestContext, token: string): Promise<string> {
  const respuesta = await request.post('/api/me/organizations', {
    headers: comoBearer(token),
    data: { name: nombreUnico('Organización Congelados') },
  });
  expect(respuesta.status(), 'Crear organización debería devolver 201').toBe(201);
  return (await data<{ id: string }>(respuesta)).id;
}

/** Invita por correo y acepta, que es el camino entero de entrar a una org. */
async function meterEnLaOrganizacion(
  request: APIRequestContext,
  organizationId: string,
  dueña: string,
  quien: { accessToken: string; email: string },
): Promise<void> {
  const papeles = await data<{ id: string; name: string }[]>(
    await request.get(`/api/organizations/${organizationId}/roles`, {
      headers: comoBearer(dueña),
    }),
  );
  /* El papel más pobre que exista: lo que se prueba es el asiento, no el papel,
     y uno con `canManageBilling` dentro saltaría la cola (D8) y rompería el
     orden que la prueba quiere fijar. */
  const basico = papeles.find((papel) => papel.name === 'Miembro') ?? papeles[papeles.length - 1];

  const invitacion = await data<{ enlace: string }>(
    await request.post(`/api/organizations/${organizationId}/members`, {
      headers: comoBearer(dueña),
      data: { email: quien.email, roleId: basico.id },
    }),
  );
  const token = new URL(invitacion.enlace).searchParams.get('token');
  expect(token, 'La invitación trae el token en el enlace').toBeTruthy();

  const aceptada = await request.post('/api/me/organizations/invitations/accept', {
    headers: comoBearer(quien.accessToken),
    data: { token },
  });
  expect(aceptada.status(), `${quien.email} debería poder aceptar la invitación`).toBe(200);
}

test.describe('Asientos congelados', () => {
  /* ⚠️ **Cinco registros son cinco logins, y el limitador es de 10 por minuto y
     por IP** (trampa 16 de `CLAUDE.md`). `registrar` espera y reintenta, pero la
     espera es de un minuto entero cada vez: con el presupuesto ya gastado por
     otra prueba, tres esperas se comen los 120 s del `timeout` global y el fallo
     sale como un timeout limpio que no apunta a nada. Cinco minutos es el margen
     para las cinco esperas, no una estimación de lo que tarda: sin limitador de
     por medio, la prueba entera son unos segundos. */
  test.describe.configure({ timeout: 360_000 });

  test('al cancelar, las dos últimas en llegar leen y no escriben; y al volver a pagar, escriben', async ({
    request,
  }) => {
    const dueña = await registrar(request);
    const organizationId = await crearOrganizacion(request, dueña.accessToken);

    /* Con plan y asientos de sobra, para que entren los cuatro. Sin esto la
       propia puerta de invitar los pararía en el tercero: el tope del gratuito
       ya se aplica desde A1, y esta prueba necesita llegar al exceso **bajando
       el techo**, que es la única forma de llegar ahí. */
    await darPlan(organizationId, 'TEAM', ASIENTOS_CONTRATADOS);

    /* El orden de entrada es el orden de la cola, así que se crean de uno en uno
       y a propósito: en paralelo, `joinedAt` podría empatar al milisegundo y el
       desempate pasaría al `id`, que es aleatorio. La prueba seguiría siendo
       correcta —el invariante 5 dice justo eso— pero dejaría de decir «las dos
       ÚLTIMAS», que es la frase del encargo. */
    const primera = await registrar(request);
    await meterEnLaOrganizacion(request, organizationId, dueña.accessToken, primera);
    const segunda = await registrar(request);
    await meterEnLaOrganizacion(request, organizationId, dueña.accessToken, segunda);
    const tercera = await registrar(request);
    await meterEnLaOrganizacion(request, organizationId, dueña.accessToken, tercera);
    const cuarta = await registrar(request);
    await meterEnLaOrganizacion(request, organizationId, dueña.accessToken, cuarta);

    /* El proyecto va en la organización, no en la personal de la dueña: es de
       donde el guard saca el `organizationId` para preguntar por el asiento. */
    const proyecto = await data<{ id: string }>(
      await request.post('/api/projects', {
        headers: comoBearer(dueña.accessToken),
        data: { name: nombreUnico('Proyecto Congelados'), organizationId },
      }),
    );

    /* ⚠️ Los papeles del proyecto salen **del detalle**, no de una ruta propia:
       `/projects/:id/roles` solo acepta POST. Un `GET` ahí responde 404 con
       `NOT_FOUND`, que se lee como «ese proyecto no existe». */
    const detalle = await data<{ roles?: { id: string; name: string }[] }>(
      await request.get(`/api/projects/${proyecto.id}`, {
        headers: comoBearer(dueña.accessToken),
      }),
    );
    const administrador = (detalle.roles ?? []).find((papel) => papel.name === 'Administrador');
    if (!administrador) {
      throw new Error('Un proyecto nuevo nace con el papel Administrador, y no apareció');
    }

    /* Con el papel más poderoso del proyecto **a propósito**: lo que tiene que
       pararlos después no es la falta de permiso, es el asiento. Si la prueba
       les diera un papel de solo lectura, el 403 saldría igual y no probaría
       nada. */
    for (const quien of [primera, segunda, tercera, cuarta]) {
      const añadida = await request.post(`/api/projects/${proyecto.id}/members`, {
        headers: comoBearer(dueña.accessToken),
        data: { userId: quien.userId, projectRoleId: administrador.id },
      });
      expect(añadida.status(), `${quien.email} debería entrar al proyecto`).toBe(201);
    }

    /* Antes de cancelar, la última en llegar escribe con normalidad. Es la línea
       que convierte el 403 de después en una consecuencia de cancelar y no en un
       permiso que nunca tuvo. */
    const antes = await request.post(`/api/projects/${proyecto.id}/workspaces`, {
      headers: comoBearer(cuarta.accessToken),
      data: { name: nombreUnico('Espacio de antes') },
    });
    expect(antes.status(), 'Con plan, la última en llegar escribe').toBe(201);

    /* ─── Se acaba el plan ──────────────────────────────────────────────────
       Nadie toca ninguna membresía: solo baja el techo de cinco a tres. */
    await cancelarPlan(organizationId);

    /* Con el dueño dentro y un tope de tres, se quedan el dueño y las dos
       primeras. Las dos últimas caen. */
    for (const quien of [primera, segunda]) {
      const escribe = await request.post(`/api/projects/${proyecto.id}/workspaces`, {
        headers: comoBearer(quien.accessToken),
        data: { name: nombreUnico('Espacio de quien cabe') },
      });
      expect(escribe.status(), `${quien.email} cabe en ${ASIENTOS_GRATIS} y debería escribir`).toBe(
        201,
      );
    }

    for (const quien of [tercera, cuarta]) {
      /* 1. Lee. Congelado es solo lectura, no un portazo: dejarle fuera del todo
            es indistinguible de haberle echado, que es lo que el encargo
            prohíbe. */
      const lee = await request.get(`/api/projects/${proyecto.id}`, {
        headers: comoBearer(quien.accessToken),
      });
      expect(
        lee.status(),
        `${quien.email} está congelada y tiene que seguir viendo el proyecto`,
      ).toBe(200);

      /* 2. No escribe, y con código propio. Un `FORBIDDEN` a secas mandaría a
            esta persona a pedirle permiso a quien administra el proyecto, que no
            se lo puede dar: lo que falta es un asiento, y eso se arregla en
            facturación. */
      const escribe = await request.post(`/api/projects/${proyecto.id}/workspaces`, {
        headers: comoBearer(quien.accessToken),
        data: { name: nombreUnico('Espacio que no debería existir') },
      });
      expect(escribe.status(), `${quien.email} no cabe y no debería poder escribir`).toBe(403);
      expect(
        (await error(escribe)).code,
        'Un asiento congelado no es un permiso denegado, y la pantalla tiene que distinguirlo',
      ).toBe('SEAT_FROZEN');

      /* 3. Tampoco crea un proyecto nuevo en esa organización. Es la única
            puerta de escritura que no pasa por `ProjectPermissionGuard` —no hay
            proyecto todavía que le dé contexto— así que se cierra aparte, y sin
            esta línea nadie se enteraría: quien no puede tocar una tarea podría
            crear un tablero entero. */
      const creaProyecto = await request.post('/api/projects', {
        headers: comoBearer(quien.accessToken),
        data: { name: nombreUnico('Proyecto que no debería existir'), organizationId },
      });
      expect(creaProyecto.status(), `${quien.email} congelada tampoco crea proyectos`).toBe(403);
      expect((await error(creaProyecto)).code).toBe('SEAT_FROZEN');
    }

    /* ─── Y se vuelve a pagar ───────────────────────────────────────────────
       🔴 Sin reinvitar a nadie y sin descongelar nada a mano. Que esto baste es
       el invariante 3, y es la razón entera de que congelado se derive (D1) en
       vez de guardarse en una columna: un flag habría que apagarlo aquí, y el
       día que se olvidara habría gente en solo lectura en una organización que
       ya paga, sin que nada fallara. */
    await darPlan(organizationId, 'TEAM', ASIENTOS_CONTRATADOS);

    for (const quien of [tercera, cuarta]) {
      const escribe = await request.post(`/api/projects/${proyecto.id}/workspaces`, {
        headers: comoBearer(quien.accessToken),
        data: { name: nombreUnico('Espacio de después') },
      });
      expect(escribe.status(), `${quien.email} vuelve a escribir en cuanto se paga`).toBe(201);
    }
  });
});
