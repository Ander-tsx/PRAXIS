'use server';

import {
  ApiError,
  CHAT_ATTACHMENT_MAX_BYTES,
  type ChatAttachment,
  type ChatMessage,
} from '@praxis/commons';
import { type LinkPreview, obtenerPreviewDeEnlace } from '@praxis/commons/api/link-preview';
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
  attachmentIds: string[] = [],
): Promise<{ error: string | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.' };

  /* Se valida igualmente en el cliente aunque el DTO lo haga: el mensaje llega
     antes y sin gastar un viaje de red. El texto es opcional si hay adjuntos. */
  const limpio = cuerpo.replace(/\r\n/g, '\n').trim();
  if (limpio.length === 0 && attachmentIds.length === 0) {
    return { error: 'Escribe algo antes de enviar.' };
  }
  if (limpio.length > MAX) return { error: `El mensaje no puede superar ${MAX} caracteres.` };
  if (attachmentIds.length > 5) return { error: 'Un mensaje no puede llevar más de 5 archivos.' };

  try {
    /* Se confirma contra el `data` de la respuesta y no contra el status: un 200
       sin cuerpo ya nos ha mentido antes. */
    const creado = await api.post<ChatMessage>(`/me/chats/${peerId}/messages`, {
      ...(limpio.length > 0 ? { body: limpio } : {}),
      ...(replyToId && { replyToId }),
      ...(attachmentIds.length > 0 && { attachmentIds }),
    });
    if (!creado?.id) return { error: 'El servidor no guardó el mensaje.' };
  } catch (error) {
    return { error: describe(error, 'No se pudo enviar el mensaje.') };
  }

  revalidarChat(peerId);
  return { error: null };
}

/**
 * Sube un archivo a la conversación privada y lo deja en **borrador**.
 *
 * No revalida: el borrador no se ve en ninguna lista todavía, y revalidar por
 * cada archivo adjuntado repintaría la conversación entera.
 */
export async function uploadDirectAttachmentAction(
  peerId: string,
  file: File,
): Promise<{ error: string | null; attachment: ChatAttachment | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', attachment: null };

  if (file.size === 0) return { error: 'El archivo está vacío.', attachment: null };
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
    return {
      error: `El archivo supera el máximo de ${Math.round(CHAT_ATTACHMENT_MAX_BYTES / 1024 / 1024)} MB.`,
      attachment: null,
    };
  }

  const upload = new FormData();
  upload.append('file', file);

  try {
    const created = await api.postForm<ChatAttachment>(`/me/chats/${peerId}/attachments`, upload);
    if (!created?.id) {
      return { error: 'El servidor no guardó el archivo.', attachment: null };
    }
    return { error: null, attachment: created };
  } catch (error) {
    return { error: describe(error, 'No se pudo subir el archivo.'), attachment: null };
  }
}

/** Borra un adjunto **propio** de la conversación. Lo impone el backend. */
export async function deleteDirectAttachmentAction(
  peerId: string,
  attachmentId: string,
): Promise<{ error: string | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.' };

  try {
    await api.delete(`/me/chats/${peerId}/attachments/${attachmentId}`);
  } catch (error) {
    return { error: describe(error, 'No se pudo eliminar el archivo.') };
  }

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
 * Fija o desfija un mensaje de la conversación.
 *
 * ⚠️ **No revalida**, igual que reaccionar: el panel pinta el resultado con lo
 * que esto devuelve.
 */
export async function pinDirectAction(
  peerId: string,
  messageId: string,
  on: boolean,
): Promise<{ error: string | null; pinned: boolean; pinnedById: string | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', pinned: false, pinnedById: null };

  try {
    const resultado = await api.post<{
      messageId: string;
      pinned: boolean;
      pinnedById: string | null;
    }>(`/me/chats/${peerId}/messages/${messageId}/pin`, { on });
    if (!resultado)
      return { error: 'El servidor no guardó el fijado.', pinned: false, pinnedById: null };
    return { error: null, pinned: resultado.pinned, pinnedById: resultado.pinnedById };
  } catch (error) {
    return {
      error: describe(error, 'No se pudo fijar el mensaje.'),
      pinned: false,
      pinnedById: null,
    };
  }
}

/**
 * Edita el texto de un mensaje propio de la conversación.
 *
 * ⚠️ **No revalida**, igual que fijar y reaccionar: el panel pinta el resultado
 * con lo que esto devuelve. Solo el autor puede editar; el servidor lo
 * comprueba y devuelve 404 si no es suyo.
 */
export async function editDirectAction(
  peerId: string,
  messageId: string,
  body: string,
): Promise<{ error: string | null; message: ChatMessage | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', message: null };

  try {
    const resultado = await api.patch<ChatMessage>(`/me/chats/${peerId}/messages/${messageId}`, {
      body,
    });
    if (!resultado) return { error: 'El servidor no guardó el cambio.', message: null };
    return { error: null, message: resultado };
  } catch (error) {
    return { error: describe(error, 'No se pudo editar el mensaje.'), message: null };
  }
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

/**
 * Preview de la primera URL de un mensaje del chat.
 *
 * ⚠️ **Solo en el servidor** (archivo `'use server'`): es una lectura de una URL
 * ajena y va por `obtenerPreviewDeEnlace`, que lleva el guard SSRF. Un fallo
 * devuelve `null` — una preview que no sale no debe romper el mensaje.
 */
export async function previewDeEnlaceAction(url: string): Promise<LinkPreview | null> {
  const session = await getSession();
  if (!session) return null;
  return obtenerPreviewDeEnlace(url);
}
