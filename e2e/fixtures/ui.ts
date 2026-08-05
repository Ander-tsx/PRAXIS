import type { Page } from '@playwright/test';
import { correoUnico } from './api';

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
 * Crea una cuenta desde la interfaz y espera a aterrizar en el panel.
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

  /* Navegación dura al salir de la zona: `router.push` se convertiría en
     `/auth/...` por el basePath. Por eso se espera la URL y no un elemento. */
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

  return email;
}

/** Entra con una cuenta que ya existe. */
export async function entrarConCuenta(page: Page, email: string): Promise<void> {
  await page.goto('/auth/login');
  await page.locator(campos.email).fill(email);
  await page.locator(campos.password).fill(CONTRASENNA_DE_PRUEBA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

/** Crea un proyecto desde el diálogo de `/projects` y devuelve su nombre. */
export async function crearProyectoEnLaInterfaz(page: Page, nombre: string): Promise<void> {
  await page.goto('/projects');

  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill(nombre);
  await page.getByRole('button', { name: 'Crear proyecto' }).click();
}
