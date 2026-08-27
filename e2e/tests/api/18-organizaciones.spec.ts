import { expect, test } from '@playwright/test';
import { comoBearer, crearProyecto, data, error, nombreUnico, registrar } from '../../fixtures/api';

/**
 * Organizaciones: quién está dentro, quién puede qué, y qué pasa al llenarlas.
 *
 * ## Qué se fija aquí y por qué importa
 *
 * Esta es la capa que convierte PRAXIS en un producto de equipos, y **toda ella
 * se verificó a mano** mientras se construía. Lo que estas pruebas fijan son las
 * tres reglas que, si se rompen, no dan ningún error visible:
 *
 * 1. 🔴 **Repartir permisos no puede crear permisos.** Sin esa regla, quien
 *    gestiona miembros se fabrica un papel con la facturación dentro y se lo
 *    pone. No falla nada: simplemente alguien acaba pudiendo cobrar.
 * 2. 🔴 **El filtro por organización es un filtro, no una llave.** La cookie que
 *    lo lleva no es `httpOnly` y cualquiera puede escribir en ella: si el
 *    servidor la tratara como permiso, escribir el identificador de otra empresa
 *    enseñaría sus proyectos.
 * 3. 🔴 **El tope de proyectos se cuenta por organización.** Contarlo por persona
 *    da un plan que promete N para el equipo y da N para cada uno, y la tabla de
 *    precios seguiría diciendo lo mismo.
 */

/** El plan gratuito, que es el que tiene una cuenta recién registrada. */
const FREE = { proyectos: 3, asientos: 3 } as const;

/** Crea una organización de equipo y devuelve su id. */
async function crearOrganizacion(
  request: Parameters<typeof crearProyecto>[0],
  token: string,
  nombre = nombreUnico('Organización E2E'),
): Promise<{ id: string; name: string }> {
  /* ⚠️ **Solo el nombre.** El cuerpo pedía `tier` y `seats` hasta 2026-08-27, y
     mandarlos ahora da **400**: el gateway rechaza lo que el DTO no declara. Una
     organización nace gratuita y el plan lo concede el webhook de Stripe. */
  const respuesta = await request.post('/api/me/organizations', {
    headers: comoBearer(token),
    data: { name: nombre },
  });
  expect(respuesta.status(), 'Crear organización debería devolver 201').toBe(201);
  return data(respuesta);
}

test.describe('Organizaciones', () => {
  test('quien se registra tiene su espacio personal, y sale en la lista', async ({ request }) => {
    /* ⚠️ Antes la personal era invisible y se creaba perezosamente. Desde que
       contiene los proyectos, esconderla dejaba a quien trabaja solo sin poder
       llegar a los suyos. */
    const usuario = await registrar(request);

    const respuesta = await request.get('/api/me/organizations', {
      headers: comoBearer(usuario.accessToken),
    });
    expect(respuesta.status()).toBe(200);

    const suyas = await data<{ id: string; kind: string; soyDueno: boolean }[]>(respuesta);
    expect(suyas.length).toBeGreaterThanOrEqual(1);
    expect(suyas.some((organizacion) => organizacion.kind === 'PERSONAL')).toBe(true);
  });

  test('un proyecto creado sin decir dónde cae en tu organización personal', async ({
    request,
  }) => {
    const usuario = await registrar(request);
    const proyecto = await crearProyecto(request, usuario.accessToken);

    const personales = await data<{ id: string; kind: string }[]>(
      await request.get('/api/me/organizations', { headers: comoBearer(usuario.accessToken) }),
    );
    const personal = personales.find((organizacion) => organizacion.kind === 'PERSONAL');

    const detalle = await data<{ organizationId: string }>(
      await request.get(`/api/projects/${proyecto.id}`, {
        headers: comoBearer(usuario.accessToken),
      }),
    );
    expect(detalle.organizationId).toBe(personal?.id);
  });

  test('🔴 el filtro por organización es un filtro, no una llave', async ({ request }) => {
    /* Ana tiene un proyecto en su espacio. Beto pregunta por la organización de
       Ana: tiene que recibir CERO, no el proyecto de ella. */
    const ana = await registrar(request);
    const beto = await registrar(request);

    await crearProyecto(request, ana.accessToken);

    const deAna = await data<{ id: string; kind: string }[]>(
      await request.get('/api/me/organizations', { headers: comoBearer(ana.accessToken) }),
    );
    const suPersonal = deAna.find((organizacion) => organizacion.kind === 'PERSONAL')!;

    const respuesta = await request.get(`/api/projects?organizationId=${suPersonal.id}`, {
      headers: comoBearer(beto.accessToken),
    });
    expect(respuesta.status(), 'No es un 403: es un filtro, y filtra a cero').toBe(200);

    const pagina = await data<{ items: unknown[] }>(respuesta);
    expect(pagina.items, 'Beto no puede ver los proyectos de Ana filtrando por su id').toHaveLength(
      0,
    );
  });

  test('🔴 el tope de proyectos se cuenta por organización, no por persona', async ({
    request,
  }) => {
    const usuario = await registrar(request);
    const organizacion = await crearOrganizacion(request, usuario.accessToken);

    /* Se llena la organización nueva hasta el tope del plan gratuito. */
    for (let i = 0; i < FREE.proyectos; i++) {
      const respuesta = await request.post('/api/projects', {
        headers: comoBearer(usuario.accessToken),
        data: { name: nombreUnico(`Cupo ${i}`), organizationId: organizacion.id },
      });
      expect(respuesta.status(), `El proyecto ${i + 1} debería caber`).toBe(201);
    }

    const lleno = await request.post('/api/projects', {
      headers: comoBearer(usuario.accessToken),
      data: { name: nombreUnico('No cabe'), organizationId: organizacion.id },
    });
    expect(lleno.status(), 'Un tope agotado es 402, no 403: se paga, no se pide').toBe(402);

    const fallo = await error(lleno);
    const detalles = fallo.details as { kind: string; tope: number; puedeAmpliar?: boolean };
    expect(fallo.code).toBe('QUOTA_EXCEEDED');
    expect(detalles.kind).toBe('proyectos');
    expect(detalles.tope).toBe(FREE.proyectos);

    /* 🔴 Y la misma persona SÍ puede crear en su espacio personal: si el tope se
       contara por persona, esto también daría 402 — y el plan estaría prometiendo
       una cosa y dando otra sin que nada fallara. */
    const enSuEspacio = await request.post('/api/projects', {
      headers: comoBearer(usuario.accessToken),
      data: { name: nombreUnico('En mi espacio') },
    });
    expect(enSuEspacio.status(), 'El tope es de la organización, no de la persona').toBe(201);
  });

  test('el 402 dice si quien lo recibe puede ampliar el plan', async ({ request }) => {
    /* Es la diferencia entre ofrecer «ver los planes» y ofrecer «avísale a quien
       administra». Un botón de pagar delante de quien no puede pagar se lee como
       una avería. */
    const usuario = await registrar(request);
    const organizacion = await crearOrganizacion(request, usuario.accessToken);

    for (let i = 0; i < FREE.proyectos; i++) {
      await request.post('/api/projects', {
        headers: comoBearer(usuario.accessToken),
        data: { name: nombreUnico(`Cupo ${i}`), organizationId: organizacion.id },
      });
    }

    const fallo = await error(
      await request.post('/api/projects', {
        headers: comoBearer(usuario.accessToken),
        data: { name: nombreUnico('No cabe'), organizationId: organizacion.id },
      }),
    );
    /* Es el dueño: lo puede todo, así que puede ampliar. */
    expect((fallo.details as { puedeAmpliar?: boolean }).puedeAmpliar).toBe(true);
  });
});

test.describe('Papeles de la organización', () => {
  test('nace con dos papeles, y «Administración» NO puede tocar la facturación', async ({
    request,
  }) => {
    /* Es la decisión que más se nota: quien lleva el equipo no toca la tarjeta de
       la empresa salvo que el dueño se lo dé a propósito. Si esto se invierte por
       accidente, nadie lo ve hasta que llega un recibo. */
    const usuario = await registrar(request);
    const organizacion = await crearOrganizacion(request, usuario.accessToken);

    const papeles = await data<
      { name: string; isDefault: boolean; permissions: Record<string, boolean> }[]
    >(
      await request.get(`/api/organizations/${organizacion.id}/roles`, {
        headers: comoBearer(usuario.accessToken),
      }),
    );

    const administracion = papeles.find((papel) => papel.name === 'Administración');
    const miembro = papeles.find((papel) => papel.name === 'Miembro');

    expect(administracion, 'Toda organización nace con «Administración»').toBeTruthy();
    expect(miembro?.isDefault, '«Miembro» es el papel con el que entra la gente nueva').toBe(true);
    expect(administracion?.permissions.canManageBilling).toBe(false);
    expect(administracion?.permissions.canManageMembers).toBe(true);
  });

  test('🔴 no se puede crear un papel con un permiso que no se tiene', async ({ request }) => {
    /* Sin esta regla el modelo se rompe entero: quien tiene `canManageMembers` se
       fabrica un papel con `canManageBilling`, se lo asigna, y está tocando la
       tarjeta de la empresa. */
    const dueña = await registrar(request);
    const invitada = await registrar(request);
    const organizacion = await crearOrganizacion(request, dueña.accessToken);

    const papeles = await data<{ id: string; name: string }[]>(
      await request.get(`/api/organizations/${organizacion.id}/roles`, {
        headers: comoBearer(dueña.accessToken),
      }),
    );
    const administracion = papeles.find((papel) => papel.name === 'Administración')!;

    /* Se mete a la invitada con «Administración», que puede gestionar miembros
       pero NO la facturación. */
    const invitacion = await data<{ enlace: string }>(
      await request.post(`/api/organizations/${organizacion.id}/members`, {
        headers: comoBearer(dueña.accessToken),
        data: { email: invitada.email, roleId: administracion.id },
      }),
    );
    const token = new URL(invitacion.enlace).searchParams.get('token');
    expect(token, 'La invitación devuelve el enlace con el token dentro').toBeTruthy();

    const aceptada = await request.post('/api/me/organizations/invitations/accept', {
      headers: comoBearer(invitada.accessToken),
      data: { token },
    });
    expect(aceptada.status()).toBe(200);

    /* Y ahora intenta fabricarse el ascensor a la cima. */
    const intento = await request.post(`/api/organizations/${organizacion.id}/roles`, {
      headers: comoBearer(invitada.accessToken),
      data: { name: nombreUnico('Cobrador'), permissions: { canManageBilling: true } },
    });
    expect(intento.status(), 'Repartir permisos no puede crear permisos').toBe(403);

    /* Pero un papel dentro de lo que sí tiene, sí lo puede crear. */
    const permitido = await request.post(`/api/organizations/${organizacion.id}/roles`, {
      headers: comoBearer(invitada.accessToken),
      data: { name: nombreUnico('Invitadora'), permissions: { canInviteMembers: true } },
    });
    expect(permitido.status()).toBe(201);
  });

  test('un papel que todavía lleva gente no se borra, y dice cuánta', async ({ request }) => {
    const usuario = await registrar(request);
    const organizacion = await crearOrganizacion(request, usuario.accessToken);

    const papeles = await data<{ id: string; name: string; miembros: number }[]>(
      await request.get(`/api/organizations/${organizacion.id}/roles`, {
        headers: comoBearer(usuario.accessToken),
      }),
    );
    const conGente = papeles.find((papel) => papel.miembros > 0);
    expect(conGente, 'El dueño lleva uno de los dos papeles de arranque').toBeTruthy();

    const intento = await request.delete(
      `/api/organizations/${organizacion.id}/roles/${conGente!.id}`,
      { headers: comoBearer(usuario.accessToken) },
    );
    expect(intento.status(), 'Es un conflicto con el estado, no una petición mal formada').toBe(
      409,
    );
    /* El mensaje tiene que decir **cuánta** gente hay que mover: sin ese número
       no se puede arreglar. */
    expect((await error(intento)).message).toMatch(/persona|personas/);
  });

  test('toda organización trae plantillas de rol para sus proyectos', async ({ request }) => {
    /* Resuelven que cada proyecto invente sus roles desde cero. Y solo afectan a
       los que se creen después: cambiar una no reescribe los que ya existen. */
    const usuario = await registrar(request);
    const organizacion = await crearOrganizacion(request, usuario.accessToken);

    const plantillas = await data<{ name: string; permissions: Record<string, boolean> }[]>(
      await request.get(`/api/organizations/${organizacion.id}/role-templates`, {
        headers: comoBearer(usuario.accessToken),
      }),
    );
    expect(plantillas.length).toBeGreaterThanOrEqual(3);
    expect(plantillas.map((plantilla) => plantilla.name)).toContain('Administrador');

    const lectura = plantillas.find((plantilla) => plantilla.name === 'Lectura');
    expect(lectura?.permissions.canViewProject, 'El rol de solo lectura ve el proyecto').toBe(true);
    expect(lectura?.permissions.canDeleteProject, 'Y no borra nada').toBe(false);
  });
});

test.describe('El asiento es la puerta de un proyecto', () => {
  test('🔴 meter a alguien sin asiento da 403 NOT_IN_ORG, no un 402', async ({ request }) => {
    /* Es lo que sostiene el modelo de precios: si se pudiera meter a gente de
       fuera, nadie compraría un asiento nunca. Y no es una cuota agotada — no se
       ha agotado nada: esa persona no está dentro. */
    const dueña = await registrar(request);
    const extraña = await registrar(request);

    const organizacion = await crearOrganizacion(request, dueña.accessToken);
    const proyecto = await data<{ id: string }>(
      await request.post('/api/projects', {
        headers: comoBearer(dueña.accessToken),
        data: { name: nombreUnico('Del equipo'), organizationId: organizacion.id },
      }),
    );

    const detalle = await data<{ roles: { id: string; name: string }[] }>(
      await request.get(`/api/projects/${proyecto.id}`, {
        headers: comoBearer(dueña.accessToken),
      }),
    );
    const unRol = detalle.roles[0];

    const intento = await request.post(`/api/projects/${proyecto.id}/members`, {
      headers: comoBearer(dueña.accessToken),
      data: { userId: extraña.userId, projectRoleId: unRol.id },
    });

    expect(intento.status()).toBe(403);
    expect(
      (await error(intento)).code,
      'La salida es un asiento, no ampliar el plan: por eso tiene código propio',
    ).toBe('NOT_IN_ORG');
  });
});
