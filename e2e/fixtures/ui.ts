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
   * el panel; esta función solo tenía que esperar esa URL. Ahora la cuenta
   * nace sin confirmar, la pantalla se queda en «te hemos escrito a…» y el
   * login responde 403 hasta que se confirma — así que hay que confirmar y
   * entrar a mano.
   *
   * ⚠️ Y el destino posterior al login es **`/projects`** (`POST_AUTH_DESTINATION`
   * de auth-front), no `/dashboard`: la zona de panel pasó a servirse en `/main`
   * y el aterrizaje se movió a proyectos.
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
      /* El aterrizaje tras el login es `/projects` (`POST_AUTH_DESTINATION`). */
      await page.waitForURL(/\/projects/, { timeout: espera });
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

/**
 * Crea un proyecto para la prueba y deja el navegador en `/projects`.
 *
 * ⚠️ **Ya no rellena un formulario, y no es un atajo: es que el formulario dejó
 * de existir.** `97140eb` —«reemplazar creación de proyectos por asistente
 * PRAX»— quitó el disparador de `CreateProjectSlideOver` de `/projects`. Hoy el
 * estado vacío de esa pantalla solo ofrece «Crear proyecto con PRAX», que abre
 * el cajón del asistente en vez de un diálogo con un campo.
 *
 * Esta función seguía esperando el botón anterior, así que las cinco pruebas
 * que la llaman caían con un timeout de dos minutos cada una — y el mensaje,
 * «waiting for getByRole button /Nuevo proyecto|Crear mi primer proyecto/», no
 * dice en ningún sitio que el botón se haya retirado a propósito: parece que la
 * pantalla no carga.
 *
 * ## Por qué no se conduce el flujo de PRAX
 *
 * Porque cada corrida gastaría cuota de Gemini y dependería de una respuesta no
 * determinista. Es el mismo motivo por el que la auditoría dejó al asistente
 * fuera de las pruebas automáticas: gasta dinero en cada ejecución y no
 * devuelve datos verificables, así que como prueba no aporta.
 *
 * ## Por dónde se crea entonces
 *
 * Por **el mismo camino autenticado que usa la zona**: el proxy de
 * projects-front. `page.request` comparte el almacén de cookies del contexto,
 * así que la cookie httpOnly de sesión viaja sola y el proxy le pone la cabecera
 * de autorización. No se salta la sesión, ni los guards, ni los permisos — es
 * exactamente la petición que haría el navegador.
 *
 * ## Qué se pierde y qué no
 *
 * Lo que estas cinco pruebas verifican sigue estando **después** de este paso:
 * que la rejilla pinta el proyecto, que la URL lleva el slug y no el UUID, que
 * la pestaña Equipo resuelve los nombres con el directorio lleno y que el
 * diálogo de invitar cierra a la segunda. Lo único que dejan de cubrir es el
 * formulario de alta, y es porque no hay ninguno que cubrir.
 */
export async function crearProyectoParaLaPrueba(page: Page, nombre: string): Promise<void> {
  const respuesta = await page.request.post('/projects/api/gateway/projects', {
    data: { name: nombre },
  });

  /* Contra el `data` de la respuesta, no contra el status: es la misma regla
     que sigue el resto del repositorio, y sale de que hubo una época en la que
     22 endpoints devolvían 200 sin guardar nada.

     Y se falla aquí, con el cuerpo delante. Si la creación no sale y esto pasa
     de largo, la prueba muere más adelante buscando un proyecto que nunca
     existió, con un mensaje que no menciona esta llamada por ninguna parte. */
  const cuerpo = respuesta.ok() ? await respuesta.json().catch(() => null) : null;

  if (!cuerpo?.data?.id) {
    throw new Error(
      `No se pudo crear el proyecto «${nombre}»: ${respuesta.status()} ${await respuesta.text()}`,
    );
  }

  /* A `/projects`, que es donde dejaba la versión anterior: varias de las
     pruebas que llaman aquí siguen desde esa pantalla. */
  await page.goto('/projects');
}
