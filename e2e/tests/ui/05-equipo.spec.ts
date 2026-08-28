import { type APIRequestContext, expect, test } from '@playwright/test';
import { correoUnico } from '../../fixtures/api';
import { crearCuentaYEntrar, crearProyectoParaLaPrueba } from '../../fixtures/ui';
import { confirmarCorreo } from '../../fixtures/verificacion';

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

    /* El nombre no empieza por «Equipo» a propósito: la tarjeta del proyecto es
       un enlace cuyo texto arranca con su nombre, y llamarlo así lo volvía
       ambiguo con el enlace de la pestaña Equipo. */
    const nombre = `Rediseño ${Date.now().toString(36)}`;
    await crearProyectoParaLaPrueba(page, nombre);

    /* ⚠️ **Crear un proyecto no lleva a su ficha**: el diálogo se cierra y la
       rejilla se refresca, así que hay que entrar a mano. Es lo mismo que hace
       `03-sesion` para comprobar el slug de la URL. */
    /* Por rol y no por texto: la tarjeta es un enlace, y `getByText` casaba
       antes con el propio campo del diálogo que se está cerrando —el clic caía
       en la nada y la página se quedaba en `/projects`—. Buscar el enlace hace
       que Playwright espere a que la rejilla se haya refrescado. */
    await page.getByRole('link').filter({ hasText: nombre }).first().click();
    await page.waitForURL(/\/projects\/[^/?]+/, { timeout: 30_000 });

    /* Un error de frontera servidor/cliente sale como una excepción sin
       capturar en la consola, y la región queda vacía en vez de fallar con un
       mensaje claro. Se vigila explícitamente. */
    const errores: string[] = [];
    page.on('pageerror', (error) => errores.push(error.message));

    /* La pestaña activa vive en la URL (`?tab=`), no en estado de cliente, y el
       enlace es un `<Link>` normal dentro de la barra de secciones del proyecto.

       ⚠️ El nombre tiene que ser el del proyecto: la barra lateral es **otra**
       navegación y hasta hoy las dos se llamaban «Secciones», así que este
       localizador casaba con la de la izquierda y buscaba «Equipo» donde no
       está. Arreglado en `TabNav`. */
    await page
      .getByRole('navigation', { name: 'Secciones del proyecto' })
      .getByRole('link', { name: 'Equipo' })
      .click();

    const equipo = page.getByRole('region', { name: 'Equipo del proyecto' });
    await expect(equipo).toBeVisible();

    /* Quien crea el proyecto es su dueño y entra dentro desde el minuto uno, así
       que la lista nunca está vacía aquí. */
    await expect(equipo.getByText('DUEÑO')).toBeVisible();

    expect(errores, 'La pestaña no debería lanzar nada al pintarse').toEqual([]);
  });
});

/**
 * Registra una cuenta **sin entrar con ella**: solo hace falta que exista en el
 * directorio para poder buscarla desde el diálogo de invitar.
 *
 * Va por el proxy de la zona, igual que `crearProyectoParaLaPrueba`, y no gasta
 * ni un login — que es el recurso escaso de esta suite.
 */
async function registrarSuelta(request: APIRequestContext): Promise<string> {
  const email = correoUnico('sin-asiento');
  const alta = await request.post('/projects/api/gateway/auth/register', {
    data: { email, password: 'Prueba@12345!' },
  });
  const cuerpo = alta.ok() ? await alta.json().catch(() => null) : null;

  if (!cuerpo?.data?.userId) {
    throw new Error(`No se pudo registrar ${email}: ${alta.status()} ${await alta.text()}`);
  }

  await confirmarCorreo(email);
  return cuerpo.data.userId as string;
}

test.describe('Equipo del proyecto — el asiento', () => {
  test('🔴 sin asientos, el error dice que falta un asiento y NO «no tienes permiso»', async ({
    page,
  }) => {
    /* 🔴 **Esto fija un fallo de pantalla, no de servidor.** El gateway responde
       403 con `code: NOT_IN_ORG` y un mensaje que explica la salida —libera un
       asiento o amplía el plan—, y el `describe()` de la zona lo tiraba para
       poner «No tienes permiso para hacer esto en este proyecto». Se lo decía
       **al dueño del proyecto**, que tiene todos los permisos: una mentira sobre
       sí mismo, y encima escondiendo lo único que se podía hacer.

       Es exactamente lo mismo que ya pasó con `PROJECT_SUSPENDED`, y por eso la
       lista de códigos que se explican solos vive en un sitio y no en cuatro. */
    await crearCuentaYEntrar(page);

    const nombre = `Sin asientos ${Date.now().toString(36)}`;
    await crearProyectoParaLaPrueba(page, nombre);

    /* El plan gratuito da tres asientos y quien crea el proyecto ocupa uno. Se
       llenan los otros dos por la API —dar de alta a alguien ocupa su asiento
       solo, que es justo el gesto que arregló `cdef9f2`— y la tercera persona ya
       no cabe. */
    await page.getByRole('link').filter({ hasText: nombre }).first().click();
    await page.waitForURL(/\/projects\/[^/?]+/, { timeout: 30_000 });
    const slug = new URL(page.url()).pathname.split('/').pop() as string;

    const detalle = await (await page.request.get(`/projects/api/gateway/projects/${slug}`)).json();
    const projectId = detalle.data.id as string;
    const projectRoleId = detalle.data.roles[0].id as string;

    for (let hueco = 0; hueco < 2; hueco++) {
      const userId = await registrarSuelta(page.request);
      const alta = await page.request.post(`/projects/api/gateway/projects/${projectId}/members`, {
        data: { userId, projectRoleId },
      });
      expect(alta.status(), `El asiento ${hueco + 2} de 3 debería entrar solo`).toBe(201);
    }

    /* Y ahora, la tercera, por la interfaz — que es lo que se está probando. */
    const sobrante = correoUnico('sin-asiento');
    const alta = await page.request.post('/projects/api/gateway/auth/register', {
      data: { email: sobrante, password: 'Prueba@12345!' },
    });
    expect(alta.status()).toBe(201);
    await confirmarCorreo(sobrante);

    await page.reload();
    await page
      .getByRole('navigation', { name: 'Secciones del proyecto' })
      .getByRole('link', { name: 'Equipo' })
      .click();

    await page.getByRole('button', { name: 'Invitar persona' }).click();
    await page.getByRole('searchbox', { name: 'Buscar persona' }).fill(sobrante);
    await page.getByRole('button', { name: 'Buscar' }).click();

    await page.getByText(sobrante).first().click();
    await page.getByRole('button', { name: 'Enviar invitación' }).click();

    /* ⚠️ Acotado al formulario: Next monta su propio `role="alert"` vacío para
       anunciar las navegaciones (`__next-route-announcer__`), y un
       `getByRole('alert')` a secas casa con los dos y muere por modo estricto. */
    const formulario = page
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Enviar invitación' }) });
    const aviso = formulario.getByRole('alert');
    await expect(aviso).toBeVisible({ timeout: 15_000 });

    /* Lo que importa es **qué** dice, no que diga algo. */
    await expect(aviso).toContainText(/asiento/i);
    await expect(aviso).not.toContainText(/no tienes permiso/i);
  });
});
