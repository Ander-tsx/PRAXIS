import type { AssistantQuota } from '../api/assistant';
import { el403SeExplicaSolo } from '../api/domain';
import { ApiError } from '../api/envelope';

/**
 * Cómo se cuentan los fallos de PRAX, sin nada de servidor dentro.
 *
 * Estaban en `helpers.ts`, que importa el cliente de servidor; el turno en vivo
 * (F3) corre en el navegador y necesita traducirlos igual, con las mismas
 * palabras. Una sola copia: `helpers.ts` los reexporta.
 */

/**
 * Traduce el fallo a algo que se pueda leer en una burbuja de chat.
 *
 * El 429 es el único con un mensaje propio del backend que merece salir tal
 * cual: lleva el límite y la fecha de reinicio.
 */
export function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    /* Un proyecto suspendido y un equipo sin asientos también son 403, y su
       mensaje explica la salida. Ver `el403SeExplicaSolo`. */
    if (error.status === 403) {
      if (el403SeExplicaSolo(error.code)) return error.message;
      return 'No tienes permiso para hacer esto en este proyecto.';
    }
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
