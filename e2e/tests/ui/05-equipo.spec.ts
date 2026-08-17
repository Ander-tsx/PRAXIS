import { expect, test } from '@playwright/test';
import { crearCuentaYEntrar, crearProyectoEnLaInterfaz } from '../../fixtures/ui';

/**
 * La pestaña Equipo de un proyecto.
 *
 * ## Por qué una prueba de interfaz para esto
 *
 * `ProjectMembers` es un componente de **servidor**, y su avatar acaba de pasar
 * a un componente de **cliente** (`MemberAvatar`) para que la esfera de estado
 * se actualice sin recargar. Ese tipo de cambio no lo ve el compilador: `tsc`
 * da verde y el fallo aparece al pedir la página, como un error de frontera
 * servidor/cliente que tumba la pantalla entera.
 *
 * Así que esto no prueba la lógica de la presencia —eso está en
 * `api/16-presencia.spec.ts` y en la unitaria del gateway—: prueba que **la
 * pestaña sigue pintándose**, que es justo lo que el resto de la red no cubre.
 */
test.describe('Equipo del proyecto', () => {
  test('la pestaña Equipo se pinta con el avatar de quien lo creó', async ({ page }) => {
    await crearCuentaYEntrar(page);
    await crearProyectoEnLaInterfaz(page, `Equipo ${Date.now().toString(36)}`);

    /* Un error de frontera servidor/cliente sale como una excepción sin
       capturar en la consola, y la región queda vacía en vez de fallar con un
       mensaje claro. Se vigila explícitamente. */
    const errores: string[] = [];
    page.on('pageerror', (error) => errores.push(error.message));

    /* La pestaña activa vive en la URL (`?tab=`), no en estado de cliente, y el
       enlace es un `<Link>` normal dentro de la barra de secciones. */
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Equipo' }).click();

    const equipo = page.getByRole('region', { name: 'Equipo del proyecto' });
    await expect(equipo).toBeVisible();

    /* Quien crea el proyecto es su dueño y entra dentro desde el minuto uno, así
       que la lista nunca está vacía aquí. */
    await expect(equipo.getByText('DUEÑO')).toBeVisible();

    expect(errores, 'La pestaña no debería lanzar nada al pintarse').toEqual([]);
  });
});
