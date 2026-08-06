import { expect, test } from '@playwright/test';
import { comoBearer, data, nombreUnico, registrar } from '../../fixtures/api';
import { crearMundo, crearTarea, darDeAlta } from '../../fixtures/mundo';
import type { Mundo } from '../../fixtures/mundo';

/**
 * La bandeja de avisos.
 *
 * Los avisos no los crea nadie a mano: **son un efecto** de invitar, aceptar,
 * asignar o sacar a alguien. Por eso cada prueba de aquí provoca la acción real
 * y después mira la bandeja, en vez de escribir en ella.
 *
 * Es lo que hace que valga la pena automatizarlo: el aviso se pierde en silencio.
 * Nada falla si deja de emitirse — sencillamente la insignia se queda a cero y a
 * la gente no le llega lo que le tenía que llegar.
 */

/** Invita a alguien y devuelve el id de la invitación. */
async function invitar(
  request: import('@playwright/test').APIRequestContext,
  mundo: Mundo,
  invitado: { userId: string },
): Promise<string> {
  const delDuenno = comoBearer(mundo.duenno.accessToken);

  const rol = await request.post(`/api/projects/${mundo.proyecto.id}/roles`, {
    headers: delDuenno,
    data: {
      name: nombreUnico('Rol').slice(0, 50),
      permissions: { canViewProject: true, canComment: true },
    },
  });
  expect(rol.status()).toBe(201);
  const projectRoleId = (await data<{ id: string }>(rol)).id;

  const invitacion = await request.post(`/api/projects/${mundo.proyecto.id}/invitations`, {
    headers: delDuenno,
    data: { userId: invitado.userId, projectRoleId },
  });
  expect(invitacion.status(), 'Invitar debería devolver 201').toBe(201);

  return (await data<{ id: string }>(invitacion)).id;
}

interface Bandeja {
  items: { id: string; type: string; projectId?: string; readAt?: string | null }[];
  total: number;
  unread: number;
}

test.describe('Bandeja de avisos', () => {
  test('la bandeja nace vacía y responde con la forma esperada', async ({ request }) => {
    const nuevo = await registrar(request);

    const respuesta = await request.get('/api/me/notifications', {
      headers: comoBearer(nuevo.accessToken),
    });
    expect(respuesta.status()).toBe(200);

    const bandeja = await data<Bandeja>(respuesta);
    expect(Array.isArray(bandeja.items)).toBe(true);
    expect(bandeja.total).toBe(0);

    /* `unread` viaja siempre y es lo que pinta la insignia. Sacarlo de
       `items.length` daría un número recortado por el `limit`. */
    expect(bandeja.unread).toBe(0);
  });

  test('una invitación genera aviso a quien la recibe', async ({ request }) => {
    const mundo = await crearMundo(request);
    const invitado = await registrar(request);

    await invitar(request, mundo, invitado);

    const respuesta = await request.get('/api/me/notifications', {
      headers: comoBearer(invitado.accessToken),
    });
    const bandeja = await data<Bandeja>(respuesta);

    expect(bandeja.unread, 'Debería tener un aviso sin leer').toBeGreaterThan(0);
    expect(bandeja.items.map((n) => n.type)).toContain('INVITATION_RECEIVED');
    expect(bandeja.items[0]?.projectId).toBe(mundo.proyecto.id);
  });

  test('aceptar una invitación avisa a quien invitó', async ({ request }) => {
    const mundo = await crearMundo(request);
    const invitado = await registrar(request);

    const invitacionId = await invitar(request, mundo, invitado);

    const aceptacion = await request.post(`/api/me/invitations/${invitacionId}/accept`, {
      headers: comoBearer(invitado.accessToken),
    });
    expect(aceptacion.status()).toBe(200);

    const respuesta = await request.get('/api/me/notifications', {
      headers: comoBearer(mundo.duenno.accessToken),
    });
    const bandeja = await data<Bandeja>(respuesta);

    expect(bandeja.items.map((n) => n.type)).toContain('INVITATION_ACCEPTED');
  });

  test('rechazar también avisa', async ({ request }) => {
    const mundo = await crearMundo(request);
    const invitado = await registrar(request);

    const invitacionId = await invitar(request, mundo, invitado);
    await request.post(`/api/me/invitations/${invitacionId}/reject`, {
      headers: comoBearer(invitado.accessToken),
    });

    const respuesta = await request.get('/api/me/notifications', {
      headers: comoBearer(mundo.duenno.accessToken),
    });
    const bandeja = await data<Bandeja>(respuesta);

    expect(bandeja.items.map((n) => n.type)).toContain('INVITATION_REJECTED');
  });

  test('asignar una tarea avisa a quien la recibe', async ({ request }) => {
    const mundo = await crearMundo(request);
    const encargada = await registrar(request);

    await darDeAlta(request, mundo, encargada, { canViewProject: true });
    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);

    await request.post(`/api/tasks/${tarea.id}/assign`, {
      headers: comoBearer(mundo.duenno.accessToken),
      data: { assigneeIds: [encargada.userId] },
    });

    const respuesta = await request.get('/api/me/notifications', {
      headers: comoBearer(encargada.accessToken),
    });
    const bandeja = await data<Bandeja>(respuesta);

    expect(bandeja.items.map((n) => n.type)).toContain('TASK_ASSIGNED');
  });

  /**
   * ⚠️ **Nadie recibe aviso de lo que hizo él.** Se filtra al crear.
   *
   * Sin esta regla, asignarte una tarea a ti mismo —que es lo más normal del
   * mundo— te llenaba la bandeja de avisos sobre tus propias acciones, y el
   * aviso que sí importa se perdía en el ruido.
   */
  test('lo que uno hace no le genera aviso a sí mismo', async ({ request }) => {
    const mundo = await crearMundo(request);
    const tarea = await crearTarea(request, mundo.duenno.accessToken, mundo);
    const delDuenno = comoBearer(mundo.duenno.accessToken);

    await request.post(`/api/tasks/${tarea.id}/assign`, {
      headers: delDuenno,
      data: { assigneeIds: [mundo.duenno.userId] },
    });

    const respuesta = await request.get('/api/me/notifications', { headers: delDuenno });
    const bandeja = await data<Bandeja>(respuesta);

    const propios = bandeja.items.filter((n) => n.type === 'TASK_ASSIGNED');
    expect(propios, 'Asignarse a uno mismo no debe generar aviso').toHaveLength(0);
  });

  test('marcar como leída baja el contador', async ({ request }) => {
    const mundo = await crearMundo(request);
    const invitado = await registrar(request);
    const delInvitado = comoBearer(invitado.accessToken);

    await invitar(request, mundo, invitado);

    const antes = await data<Bandeja>(
      await request.get('/api/me/notifications', { headers: delInvitado }),
    );
    expect(antes.unread).toBeGreaterThan(0);

    const marcado = await request.patch(`/api/me/notifications/${antes.items[0].id}/read`, {
      headers: delInvitado,
    });
    expect(marcado.status()).toBe(200);

    const despues = await data<Bandeja>(
      await request.get('/api/me/notifications', { headers: delInvitado }),
    );
    expect(despues.unread).toBe(antes.unread - 1);
  });

  test('read-all deja el contador a cero', async ({ request }) => {
    const mundo = await crearMundo(request);
    const invitado = await registrar(request);
    const delInvitado = comoBearer(invitado.accessToken);

    await invitar(request, mundo, invitado);

    const respuesta = await request.post('/api/me/notifications/read-all', {
      headers: delInvitado,
    });
    expect(respuesta.status()).toBe(200);

    const bandeja = await data<Bandeja>(
      await request.get('/api/me/notifications', { headers: delInvitado }),
    );
    expect(bandeja.unread).toBe(0);
  });

  test('unreadOnly filtra pero sigue trayendo el contador entero', async ({ request }) => {
    const mundo = await crearMundo(request);
    const invitado = await registrar(request);
    const delInvitado = comoBearer(invitado.accessToken);

    await invitar(request, mundo, invitado);

    /* `limit=1` a propósito: es justo la llamada que hace `loadAppNavItems` para
       pintar la insignia, y la que demostraría el bug si `unread` saliera de
       `items.length`. */
    const bandeja = await data<Bandeja>(
      await request.get('/api/me/notifications?unreadOnly=true&limit=1', {
        headers: delInvitado,
      }),
    );

    expect(bandeja.items.length).toBeLessThanOrEqual(1);
    expect(bandeja.unread, 'El contador no se recorta con el limit').toBeGreaterThan(0);
    for (const aviso of bandeja.items) {
      expect(aviso.readAt ?? null, 'unreadOnly no debería traer leídos').toBeNull();
    }
  });

  test('no se marca como leída la notificación de otra persona', async ({ request }) => {
    const mundo = await crearMundo(request);
    const invitado = await registrar(request);
    const intrusa = await registrar(request);

    await invitar(request, mundo, invitado);

    const bandeja = await data<Bandeja>(
      await request.get('/api/me/notifications', { headers: comoBearer(invitado.accessToken) }),
    );

    const respuesta = await request.patch(`/api/me/notifications/${bandeja.items[0].id}/read`, {
      headers: comoBearer(intrusa.accessToken),
    });

    /* 404 y no 403: confirmar que existe ya sería filtrar algo. */
    expect(respuesta.status()).toBe(404);
  });
});
