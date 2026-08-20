import type { AssistantQuota } from '../api/assistant';
import { ApiError } from '../api/envelope';
import { createServerApiClient } from '../auth/server-client';
import { getSession } from '../auth/session';

/**
 * Los ayudantes que comparten los dos archivos de acciones del asistente.
 *
 * ## ⚠️ Por qué viven aparte y no dentro del `'use server'`
 *
 * Un módulo marcado con `'use server'` **solo puede exportar funciones
 * asíncronas**: es el contrato de las Server Functions, y Next lo comprueba al
 * compilar. Así que un `describe()` síncrono o una interfaz no caben ahí como
 * exportación, y dejarlos privados obligaba a tener una copia en cada archivo de
 * acciones —que es justo lo que pasaba, porque hasta ahora solo había uno—.
 *
 * Este archivo **no** lleva `'use server'`. Solo lo importan módulos que sí lo
 * llevan, así que nunca acaba en el navegador.
 */

/**
 * El cliente del gateway, o `null` si la sesión ya no vale.
 *
 * Cada acción lo comprueba por su cuenta, como las del tablero: una Server
 * Function viaja como POST a la ruta donde se usa, y un cambio de `matcher` en
 * el `proxy.ts` de una zona podría dejarla fuera del guard sin que nada avise.
 */
export async function requireApi() {
  const session = await getSession();
  if (!session) return null;
  return createServerApiClient();
}

/**
 * Traduce el fallo a algo que se pueda leer en una burbuja de chat.
 *
 * El 429 es el único con un mensaje propio del backend que merece salir tal
 * cual: lleva el límite y la fecha de reinicio.
 */
export function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'No tienes permiso para hacer esto en este proyecto.';
    if (error.status === 404) return 'Eso ya no existe en el proyecto.';
    if (error.status >= 500 && error.status !== 502) return fallback;
    return error.message;
  }
  return fallback;
}

/** La cuota que el backend mete en `details` del 429, si viene. */
export function cuotaDelError(error: unknown): AssistantQuota | null {
  if (!(error instanceof ApiError)) return null;
  const details = error.details;
  if (details && typeof details === 'object' && 'cuota' in details) {
    return (details as { cuota: AssistantQuota }).cuota;
  }
  return null;
}

/** El conversationId que el backend mete en details cuando falla después de crearlo, si viene. */
export function conversationIdDelError(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const details = error.details;
  if (details && typeof details === 'object' && 'conversationId' in details) {
    return (details as { conversationId: string }).conversationId;
  }
  return null;
}
