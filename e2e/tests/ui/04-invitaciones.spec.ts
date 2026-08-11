import { request as contextoDePeticion, expect, test } from '@playwright/test';
import { nombreUnico, registrar } from '../../fixtures/api';
import { crearCuentaYEntrar, crearProyectoEnLaInterfaz } from '../../fixtures/ui';

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
    await api.dispose();

    await crearCuentaYEntrar(page);

    const proyecto = nombreUnico('Invitaciones');
    await crearProyectoEnLaInterfaz(page, proyecto);

    await page.getByRole('link', { name: proyecto }).first().click();
    await expect(page).toHaveURL(/\/projects\/[^/]+$/);

    /* Las pestañas son enlaces con `?tab=`, no `role="tab"`. */
    await page.goto(`${new URL(page.url()).pathname}?tab=equipo`);

    const dialogo = page.getByRole('dialog');

    for (const [vuelta, invitado] of [primera, segunda].entries()) {
      await page.getByRole('button', { name: 'Invitar persona' }).click();
      await expect(dialogo, `el diálogo debería abrirse en la vuelta ${vuelta + 1}`).toBeVisible();

      await page.getByRole('searchbox', { name: 'Buscar persona' }).fill(invitado.email);
      await page.getByRole('button', { name: 'Buscar' }).click();

      await page
        .getByRole('button', { name: new RegExp(invitado.email, 'i') })
        .first()
        .click();
      await page.getByRole('button', { name: 'Enviar invitación' }).click();

      /**
       * Lo que se comprueba. En la vuelta 2 es donde fallaba: la invitación se
       * creaba —aparece abajo como pendiente— pero el diálogo seguía encima.
       */
      await expect(
        dialogo,
        `el diálogo tiene que cerrarse solo en la vuelta ${vuelta + 1}`,
      ).not.toBeVisible({ timeout: 10_000 });

      /* Y la invitación tiene que estar de verdad, con su correo: es la otra
         mitad del arreglo —antes salía el UUID y «Correo no disponible»—. */
      await expect(page.getByText(invitado.email).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('Correo no disponible')).toHaveCount(0);
    }

    await expect(page.getByText(/Invitaciones pendientes \(2\)/)).toBeVisible();
  });
});
