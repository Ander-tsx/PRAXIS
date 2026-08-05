import type { APIRequestContext, APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';

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

/** Registra un usuario nuevo y devuelve sus credenciales y su sesión. */
export async function registrar(
  request: APIRequestContext,
  password = 'Prueba@12345!',
): Promise<Usuario> {
  const email = correoUnico();
  const respuesta = await request.post('/api/auth/register', {
    data: { email, password },
  });
  expect(respuesta.status(), 'El registro debería devolver 201').toBe(201);

  const sesion = await data<Sesion>(respuesta);
  return { ...sesion, email, password };
}

/** Inicia sesión con credenciales ya existentes. */
export async function entrar(
  request: APIRequestContext,
  credenciales: { email: string; password: string },
): Promise<Sesion> {
  const respuesta = await request.post('/api/auth/login', { data: credenciales });
  expect(
    respuesta.status(),
    `Login fallido para ${credenciales.email}. ¿Se ejecutaron los seeds?`,
  ).toBe(200);
  return data<Sesion>(respuesta);
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
