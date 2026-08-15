'use server';

import { ApiError, type ChatMessage } from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { revalidatePath } from 'next/cache';

/**
 * Acciones del chat privado.
 *
 * ## Funciones normales, no `useAccion`
 *
 * El redactor **controla su propio texto** —insertar una mención obliga a
 * reescribirlo y a recolocar el cursor—, así que no hay `FormData` que mandar:
 * el cuerpo ya viene montado. Server Actions llamadas como funciones desde un
 * componente de cliente es una forma tan válida como el formulario, y aquí es la
 * que encaja.
 *
 * Comprueban la sesión por su cuenta: viajan como POST a la ruta donde se usan y
 * un cambio de `matcher` en `proxy.ts` podría dejarlas fuera del guard. La
 * autorización real la hace el gateway, y la regla de fondo —solo puedes
 * escribir a quien comparta proyecto contigo— la aplica projects-service en el
 * único camino por el que se resuelve un canal privado.
 */

const MAX = 4000;

async function requireApi() {
  const session = await getSession();
  if (!session) return null;
  return createServerApiClient();
}

/** Revalida la conversación y la bandeja, que enseña el último mensaje. */
function revalidarChat(peerId: string) {
  revalidatePath(`/chat/${peerId}`);
  revalidatePath('/chat');
}

function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Solo puedes escribir a quien comparta algún proyecto contigo.';
    }
    if (error.status >= 500) return fallback;
    return error.message;
  }
  return fallback;
}

export async function sendDirectMessageAction(
  peerId: string,
  cuerpo: string,
  replyToId: string | null,
): Promise<{ error: string | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.' };

  /* Se valida igualmente en el cliente aunque el DTO lo haga: el mensaje llega
     antes y sin gastar un viaje de red. */
  const limpio = cuerpo.replace(/\r\n/g, '\n').trim();
  if (limpio.length === 0) return { error: 'Escribe algo antes de enviar.' };
  if (limpio.length > MAX) return { error: `El mensaje no puede superar ${MAX} caracteres.` };

  try {
    /* Se confirma contra el `data` de la respuesta y no contra el status: un 200
       sin cuerpo ya nos ha mentido antes. */
    const creado = await api.post<ChatMessage>(`/me/chats/${peerId}/messages`, {
      body: limpio,
      ...(replyToId && { replyToId }),
    });
    if (!creado?.id) return { error: 'El servidor no guardó el mensaje.' };
  } catch (error) {
    return { error: describe(error, 'No se pudo enviar el mensaje.') };
  }

  revalidarChat(peerId);
  return { error: null };
}

/** En privado no hay moderación: cada cual borra lo suyo. Lo impone el backend. */
export async function deleteDirectMessageAction(
  peerId: string,
  messageId: string,
): Promise<{ error: string | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.' };

  try {
    await api.delete(`/me/chats/${peerId}/messages/${messageId}`);
  } catch (error) {
    return { error: describe(error, 'No se pudo eliminar el mensaje.') };
  }

  revalidarChat(peerId);
  return { error: null };
}

/**
 * Pone o quita una reacción.
 *
 * ⚠️ **No revalida.** Reaccionar repintaría la conversación entera por un emoji,
 * y con varias personas reaccionando seguido eso es un parpadeo constante. El
 * panel se queda con lo que devuelve el servidor para ese mensaje.
 */
export async function reactDirectAction(
  peerId: string,
  messageId: string,
  emoji: string,
  on: boolean,
): Promise<void> {
  const api = await requireApi();
  if (!api) return;

  await api
    .post(`/me/chats/${peerId}/messages/${messageId}/react`, { emoji, on })
    .catch(() => undefined);
}

/**
 * Deja la conversación por leída.
 *
 * ⚠️ **No revalida.** La llama el propio panel al abrirse, y revalidar desde ahí
 * volvería a renderizar la página que acaba de pintarse —y con ella el panel,
 * que volvería a llamar—: un bucle.
 */
export async function markDirectReadAction(peerId: string): Promise<void> {
  const api = await requireApi();
  if (!api) return;

  await api.post(`/me/chats/${peerId}/read`, {}).catch(() => undefined);

  /**
   * ⚠️ **Revalida el armazón, y sin esto la insignia mentía.**
   *
   * Marcar leído escribe en el servidor y no cambia nada de lo que se está
   * viendo… salvo el contador de la barra lateral, que lo calcula
   * `loadPrivateChrome()` en el `layout.tsx`. Sin revalidar, abrías la
   * conversación, la leías entera, contestabas — y la burbuja de no leídos
   * seguía ahí hasta cambiar de página o recargar.
   *
   * Se revalida el **layout** y no la página: el contador no vive en la
   * pantalla del chat, vive en el armazón que la envuelve.
   */
  revalidatePath('/', 'layout');
}

/**
 * Silencia la conversación, o le devuelve el sonido.
 *
 * ⚠️ Silenciar **no deja de contar lo no leído**: la insignia sigue. Lo que se
 * apaga es la tarjeta emergente y el sonido.
 */
export async function muteDirectAction(
  peerId: string,
  muted: boolean,
): Promise<{ muted: boolean } | null> {
  const api = await requireApi();
  if (!api) return null;

  const confirmado = await api
    .post<{ muted: boolean }>(`/me/chats/${peerId}/mute`, { muted })
    .catch(() => null);

  if (confirmado) revalidarChat(peerId);
  return confirmado;
}
