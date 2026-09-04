import { request as contextoDePeticion, expect, test } from '@playwright/test';
import { comoBearer, nombreUnico, registrar } from '../../fixtures/api';
import { crearCuentaYEntrar, crearProyectoParaLaPrueba } from '../../fixtures/ui';

/**
 * El diálogo de invitar, invitando **dos veces seguidas**.
 *
 * ## Por qué dos y no una
 *
 * Una sola invitación pasaba siempre, y por eso el fallo parecía aleatorio. El
 * diálogo se cierra desde un efecto que miraba `state.done`, y ese campo vale
 * siempre lo mismo —la cadena `'invited'`—: la primera vez cambia de `null` a
 * `'invited'` y el efecto corre; la segunda vale `'invited'` otra vez, la
 * dependencia no cambia, el efecto no vuelve a correr y el diálogo se queda
 * abierto encima de un formulario ya enviado.
 *
 * La segunda invitación es, literalmente, la prueba. Si alguien vuelve a poner
 * un campo del estado como dependencia en lugar del estado entero, esto se pone
 * rojo.
 */
test.describe('Invitar al proyecto', () => {
  test('el diálogo se cierra también en la segunda invitación seguida', async ({ page }) => {
    /* Dos personas a las que invitar, creadas por API para no gastar interfaz
       en preparar el escenario. */
    const api = await contextoDePeticion.newContext({
      baseURL: process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000',
    });
    const primera = await registrar(api);
    const segunda = await registrar(api);

    await crearCuentaYEntrar(page);

    const proyecto = nombreUnico('Invitaciones');
    await crearProyectoParaLaPrueba(page, proyecto);

    await page.getByRole('link', { name: proyecto }).first().click();
    await expect(page).toHaveURL(/\/projects\/[^/]+$/);

    /**
     * ⚠️ **El diálogo de invitar al proyecto solo lista a quien ya tiene asiento
     * en la organización.** Así que las dos personas hay que meterlas antes en la
     * organización del dueño —por invitación y aceptación con su propio token—.
     * El plan gratuito da tres asientos: dueño + estas dos, y entran justas.
     */
    const orgs = await (await page.request.get('/api/gateway/me/organizations')).json();
    const orgId = (Array.isArray(orgs?.data) ? orgs.data : [])[0]?.id as string;
    expect(orgId, 'La cuenta nueva trae su organización personal').toBeTruthy();

    const roles = await (
      await page.request.get(`/api/gateway/organizations/${orgId}/roles`)
    ).json();
    const roleId = (Array.isArray(roles?.data) ? roles.data : [])[0]?.id as string;
    expect(roleId, 'La organización trae al menos un papel asignable').toBeTruthy();

    for (const invitado of [primera, segunda]) {
      const inv = await page.request.post(`/api/gateway/organizations/${orgId}/members`, {
        data: { email: invitado.email, roleId },
      });
      expect(inv.ok(), `crear invitación de organización para ${invitado.email}`).toBeTruthy();
      const enlace = (await inv.json())?.data?.enlace as string;
      const token = new URL(enlace).searchParams.get('token');
      const aceptada = await api.post('/api/me/organizations/invitations/accept', {
        headers: comoBearer(invitado.accessToken),
        data: { token },
      });
      expect(aceptada.status(), `${invitado.email} acepta su invitación`).toBe(200);
    }
    await api.dispose();

    /* Las pestañas son enlaces con `?tab=`, no `role="tab"`. */
    await page.goto(`${new URL(page.url()).pathname}?tab=equipo`);

    /**
     * ⚠️ **El panel de invitar no es un `role="dialog"`, y hace tiempo que no lo
     * es.**
     *
     * `InviteMemberDialog` conserva el nombre pero ya no se pinta como una capa
     * encima: `ProjectMembers` lo despliega **en línea** dentro de la pestaña,
     * debajo de la cabecera del equipo. No hay `role="dialog"` en ninguna parte,
     * así que `getByRole('dialog')` no resolvía nunca y la prueba moría en la
     * primera vuelta con «element(s) not found» — un mensaje que suena a que la
     * pantalla no cargó, no a que el componente cambió de forma.
     *
     * Se ancla en su encabezado, que es lo que una persona usa para saber que el
     * panel está abierto, y sobrevive a que vuelva a cambiar de contenedor.
     */
    const panelDeInvitar = page.getByRole('heading', { name: 'Invitar al proyecto' });

    for (const [vuelta, invitado] of [primera, segunda].entries()) {
      await page.getByRole('button', { name: 'Invitar persona' }).click();
      await expect(
        panelDeInvitar,
        `el panel debería abrirse en la vuelta ${vuelta + 1}`,
      ).toBeVisible();

      /* El buscador filtra en vivo mientras se escribe: ya no hay botón «Buscar»,
         y su etiqueta es «Buscar en el equipo». */
      await page.getByRole('searchbox', { name: 'Buscar en el equipo' }).fill(invitado.email);

      await page
        .getByRole('button', { name: new RegExp(invitado.email, 'i') })
        .first()
        .click();
      await page.getByRole('button', { name: 'Enviar invitación' }).click();

      /**
       * Lo que se comprueba. En la vuelta 2 es donde fallaba: la invitación se
       * creaba —aparece abajo como pendiente— pero el panel seguía abierto.
       */
      await expect(
        panelDeInvitar,
        `el panel tiene que cerrarse solo en la vuelta ${vuelta + 1}`,
      ).not.toBeVisible({ timeout: 10_000 });

      /* Y la invitación tiene que estar de verdad, con su correo: es la otra
         mitad del arreglo —antes salía el UUID y «Correo no disponible»—. */
      await expect(page.getByText(invitado.email).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('Correo no disponible')).toHaveCount(0);
    }

    await expect(page.getByText(/Invitaciones pendientes \(2\)/)).toBeVisible();
  });
});
