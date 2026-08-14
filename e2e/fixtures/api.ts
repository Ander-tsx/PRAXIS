import type { APIRequestContext, APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';
import { confirmarCorreo } from './verificacion';

/**
 * Ayudas compartidas por las pruebas de API.
 *
 * Todo endpoint del gateway responde envuelto —`{success, data, meta}` en éxito,
 * `{success:false, error:{code,message,details}}` en error—, así que desenvolver
 * a mano en cada prueba sería repetir el mismo bloque cuarenta veces y perder de
 * vista lo que cada una comprueba de verdad.
 */

/** Credenciales que deja `pnpm prisma:seed`. Ver README, paso 6. */
export const SEED = {
  admin: { email: 'admin@praxis.dev', password: 'Admin@12345!' },
  maria: { email: 'maria@praxis.dev', password: 'User@12345!' },
  carlos: { email: 'carlos@praxis.dev', password: 'User@12345!' },
} as const;

export interface Sesion {
  userId: string;
  accessToken: string;
  refreshToken: string;
}

export interface Usuario extends Sesion {
  email: string;
  password: string;
}

/** Cabecera de autorización, que es lo único que el gateway mira. */
export function comoBearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Desenvuelve una respuesta de éxito y devuelve el `data`.
 *
 * Falla la prueba —en vez de devolver `undefined`— si el sobre viene en error:
 * un `data` vacío propagado silenciosamente convierte un fallo claro en un
 * `TypeError` diez líneas más abajo, que cuesta mucho más leer.
 */
export async function data<T = any>(respuesta: APIResponse): Promise<T> {
  const sobre = await respuesta.json();
  expect(
    sobre.success,
    `Se esperaba un sobre de éxito y llegó: ${JSON.stringify(sobre).slice(0, 300)}`,
  ).toBe(true);
  return sobre.data as T;
}

/** Desenvuelve una respuesta de error y devuelve `error`. */
export async function error(
  respuesta: APIResponse,
): Promise<{ code: string; message: string; details?: unknown }> {
  const sobre = await respuesta.json();
  expect(
    sobre.success,
    `Se esperaba un sobre de error y llegó: ${JSON.stringify(sobre).slice(0, 300)}`,
  ).toBe(false);
  return sobre.error;
}

/** Un correo que no ha usado nadie, para no chocar con ejecuciones anteriores. */
export function correoUnico(prefijo = 'e2e'): string {
  const sufijo = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefijo}-${sufijo}@praxis.test`;
}

/** Nombre de proyecto irrepetible, por el mismo motivo. */
export function nombreUnico(prefijo = 'Proyecto E2E'): string {
  return `${prefijo} ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Registra un usuario nuevo, **le confirma el correo** y devuelve su sesión.
 *
 * ⚠️ **Registrarse ya no abre sesión, y por eso hay tres pasos donde había uno.**
 * Desde `2bc9983` el registro responde `{ userId, email, verificacionPendiente }`
 * sin tokens, y el login rechaza con 403 `EMAIL_NOT_VERIFIED` hasta que la cuenta
 * se confirma.
 *
 * Esta función seguía esperando el contrato viejo y leía `accessToken` de una
 * respuesta que ya no lo traía: valía `undefined`, todas las peticiones salían
 * con `Authorization: Bearer undefined` y **la suite entera caía en 401** desde
 * el primer archivo. Nada de eso apuntaba a la causa.
 *
 * La confirmación se hace escribiendo en la base (ver `verificacion.ts`): el
 * token del enlace se guarda con hash y en claro solo existe dentro del correo,
 * así que es un paso fuera de banda que una prueba no puede dar por la API.
 */
export async function registrar(
  request: APIRequestContext,
  password = 'Prueba@12345!',
): Promise<Usuario> {
  const email = correoUnico();

  const alta = await request.post('/api/auth/register', { data: { email, password } });
  expect(alta.status(), 'El registro debería devolver 201').toBe(201);

  await confirmarCorreo(email);

  /* Ahora sí hay sesión que obtener, y por la puerta de siempre. */
  const sesion = await entrar(request, { email, password });
  return { ...sesion, email, password };
}

/**
 * Registra una cuenta y **la deja sin confirmar**.
 *
 * Es lo que hace falta para probar justo eso: que el login la rechaza. Devuelve
 * las credenciales, no una sesión, porque no hay ninguna.
 */
export async function registrarSinConfirmar(
  request: APIRequestContext,
  password = 'Prueba@12345!',
): Promise<{ email: string; password: string }> {
  const email = correoUnico();
  const alta = await request.post('/api/auth/register', { data: { email, password } });
  expect(alta.status(), 'El registro debería devolver 201').toBe(201);
  return { email, password };
}

/**
 * Inicia sesión con credenciales ya existentes.
 *
 * ⚠️ **Aguanta un 429 y reintenta.** `/auth/login` está limitado a 10 intentos
 * por minuto y por IP, y la propia suite gasta ese presupuesto: la prueba de
 * fuerza bruta de `06-seguridad` dispara catorce a propósito. Sin esta espera,
 * cualquier login posterior fallaba con «¿Se ejecutaron los seeds?» — un
 * mensaje que apunta al sitio equivocado y cuesta un rato descartar.
 *
 * La espera es de un minuto porque esa es la ventana del límite. Solo se paga
 * cuando de verdad se topó con él.
 */
export async function entrar(
  request: APIRequestContext,
  credenciales: { email: string; password: string },
): Promise<Sesion> {
  const respuesta = await intentarLogin(request, credenciales);

  expect(
    respuesta.status(),
    `Login fallido para ${credenciales.email}. ¿Se ejecutaron los seeds?`,
  ).toBe(200);
  return data<Sesion>(respuesta);
}

/**
 * Un intento de login que **espera si se topó con el límite**, y devuelve la
 * respuesta tal cual sea.
 *
 * ⚠️ Úsalo en vez de `request.post('/api/auth/login')` a pelo **siempre**, aunque
 * la prueba espere un 401 o un 403. El límite son 10 por minuto y por IP, y la
 * suite los gasta sola: desde que registrarse dejó de abrir sesión, cada cuenta
 * nueva necesita un login, y son 84. Sin esto, una prueba que comprueba que una
 * contraseña mala da 401 recibe un 429 y falla **por el reloj, no por el
 * código** — que es exactamente lo que pasó al arreglar la suite.
 *
 * La espera es de un minuto porque esa es la ventana. Solo se paga cuando de
 * verdad se topó con el límite.
 */
export async function intentarLogin(
  request: APIRequestContext,
  credenciales: { email: string; password: string },
): Promise<APIResponse> {
  let respuesta = await request.post('/api/auth/login', { data: credenciales });

  if (respuesta.status() === 429) {
    await new Promise((listo) => setTimeout(listo, 61_000));
    respuesta = await request.post('/api/auth/login', { data: credenciales });
  }

  return respuesta;
}

/**
 * Sesión de administración, pedida **una sola vez** por proceso.
 *
 * Cada `entrar()` consume presupuesto del límite de intentos, así que las
 * pruebas que necesitan al administrador comparten la misma sesión en lugar de
 * gastar uno cada una.
 */
let sesionDeAdmin: Promise<Sesion> | null = null;

export function entrarComoAdmin(request: APIRequestContext): Promise<Sesion> {
  if (!sesionDeAdmin) sesionDeAdmin = entrar(request, SEED.admin);
  return sesionDeAdmin;
}

/** Crea un proyecto y devuelve el registro completo, con su `id` y su `slug`. */
export async function crearProyecto(
  request: APIRequestContext,
  token: string,
  nombre = nombreUnico(),
): Promise<{ id: string; slug: string; name: string; ownerId: string }> {
  const respuesta = await request.post('/api/projects', {
    headers: comoBearer(token),
    data: { name: nombre },
  });
  expect(respuesta.status(), 'Crear proyecto debería devolver 201').toBe(201);
  return data(respuesta);
}
