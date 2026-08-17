import type { Page } from '@playwright/test';
import { correoUnico } from './api';
import { confirmarCorreo } from './verificacion';

/**
 * Ayudas de navegador.
 *
 * ## Por qué se localiza por `id` y no por etiqueta
 *
 * `getByLabel('Contraseña')` **no sirve** en estos formularios: casa también con
 * el botón de mostrar/ocultar, que lleva `aria-label="Mostrar contraseña"`, y en
 * el registro casa además con «Confirmar contraseña». Playwright entra en modo
 * estricto y falla con cuatro coincidencias.
 *
 * Los átomos `Input` reciben un `id` explícito y lo pasan al `<input>` y al
 * `<label for>`, así que el `id` es el localizador estable aquí. Donde el `id` lo
 * genera `useId()` —el diálogo de proyecto— se usa el rol con nombre exacto.
 */

export const CONTRASENNA_DE_PRUEBA = 'Prueba@12345!';

export const campos = {
  email: '#email',
  password: '#password',
  confirmarPassword: '#confirm-password',
} as const;

/**
 * Crea una cuenta desde la interfaz, **la confirma** y entra.
 *
 * Devuelve el correo por si la prueba necesita volver a entrar con él.
 */
export async function crearCuentaYEntrar(page: Page): Promise<string> {
  const email = correoUnico('ui');

  await page.goto('/auth/signup');
  await page.locator(campos.email).fill(email);
  await page.locator(campos.password).fill(CONTRASENNA_DE_PRUEBA);
  await page.locator(campos.confirmarPassword).fill(CONTRASENNA_DE_PRUEBA);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  /**
   * ⚠️ **Registrarse ya no deja dentro, y aquí se nota en tres pasos.**
   *
   * Antes de la confirmación por correo, el alta abría sesión y aterrizaba en
   * `/dashboard`; esta función solo tenía que esperar esa URL. Ahora la cuenta
   * nace sin confirmar, la pantalla se queda en «te hemos escrito a…» y el
   * login responde 403 hasta que se confirma — así que hay que confirmar y
   * entrar a mano.
   *
   * La confirmación se hace escribiendo en la base (ver `verificacion.ts`): el
   * token del enlace se guarda con hash y en claro solo existe dentro del
   * correo. Es un paso fuera de banda que una prueba no puede dar.
   *
   * Se espera a que el alta haya llegado al servidor antes de tocar la base:
   * sin esto, `confirmarCorreo` puede adelantarse a la fila que va a confirmar.
   */
  await page.getByRole('heading', { name: 'Mira tu correo' }).waitFor({ timeout: 15_000 });

  await confirmarCorreo(email);
  await entrarConCuenta(page, email);

  return email;
}

/**
 * Entra con una cuenta que ya existe.
 *
 * ⚠️ **Reintenta una vez si se topó con el límite de login.** `/auth/login`
 * acepta 10 intentos por minuto y por IP, y la suite se los gasta sola: desde
 * que registrarse dejó de abrir sesión, cada cuenta que crea necesita un login,
 * y las de navegador se suman a las de API.
 *
 * Cuando eso pasa, el formulario se queda en su sitio con un error y **la
 * navegación no ocurre nunca**: el `waitForURL` expiraba y el fallo salía como
 * un timeout limpio a los 30 s que no apunta a nada. Es el mismo problema que
 * resuelve `intentarLogin()` en las pruebas de API, aquí visto desde el
 * navegador.
 *
 * Se ve enseguida si vuelve a pasar: varias pruebas de UI fallando **todas
 * alrededor de los 30 s** no es un problema de código, es el reloj.
 */
export async function entrarConCuenta(page: Page, email: string): Promise<void> {
  async function intentar(espera: number): Promise<boolean> {
    await page.goto('/auth/login');
    await page.locator(campos.email).fill(email);
    await page.locator(campos.password).fill(CONTRASENNA_DE_PRUEBA);
    await page.getByRole('button', { name: 'Entrar' }).click();

    try {
      await page.waitForURL(/\/dashboard/, { timeout: espera });
      return true;
    } catch {
      return false;
    }
  }

  /* 15 s de primer intento: si el login va a funcionar, funciona en menos de
     dos. Esperar 30 solo alarga el diagnóstico cuando no va a funcionar. */
  if (await intentar(15_000)) return;

  /* Un minuto es la ventana del límite. Solo se paga cuando de verdad se topó. */
  await page.waitForTimeout(61_000);

  if (!(await intentar(15_000))) {
    throw new Error(
      `No se pudo entrar con ${email} ni tras esperar el límite de login. ` +
        'Si el error de la pantalla no habla de intentos, el fallo es otro.',
    );
  }
}

/** Crea un proyecto desde el diálogo de `/projects` y devuelve su nombre. */
export async function crearProyectoEnLaInterfaz(page: Page, nombre: string): Promise<void> {
  await page.goto('/projects');

  /**
   * ⚠️ **El disparador tiene dos nombres, según haya proyectos o no.**
   *
   * Con la cuenta vacía, `/projects` pinta su estado vacío y el botón dice
   * «Crear mi primer proyecto»; en cuanto hay alguno, la rejilla lo enseña como
   * una tarjeta que dice «Nuevo proyecto». Esta función servía a las dos y solo
   * conocía el segundo, así que en una cuenta recién creada —que es como
   * empiezan todas estas pruebas— esperaba un botón que no existe.
   *
   * Se aceptan los dos en vez de elegir uno: cuál toca depende del estado de la
   * cuenta, y quien llama a esta función no debería tener que saberlo.
   *
   * ⚠️ Y `.first()`, porque con la cuenta vacía hay **dos** disparadores en
   * pantalla —el de la cabecera y el del estado vacío— y sin esto Playwright
   * aborta por ambigüedad. Sirve cualquiera: abren el mismo diálogo.
   */
  await page
    .getByRole('button', { name: /Nuevo proyecto|Crear mi primer proyecto/ })
    .first()
    .click();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill(nombre);
  await page.getByRole('button', { name: 'Crear proyecto' }).click();
}
