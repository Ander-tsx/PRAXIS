'use server';

import {
  ApiError,
  CHAT_ATTACHMENT_MAX_BYTES,
  type ChatAttachment,
  type ChatMessage,
  el403SeExplicaSolo,
} from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { revalidatePath } from 'next/cache';

/**
 * Acciones del chat de un proyecto, **desde la zona de mensajes**.
 *
 * ## Por qué están aquí y no en `projects-front`
 *
 * Porque el chat de un proyecto se lee aquí. Estuvo dentro de la pantalla del
 * proyecto, compartiendo sitio con el título, la descripción, las pestañas y
 * los contadores: la conversación se quedaba con un tercio de la pantalla y
 * había que bajar para leerla. Ahora vive junto a las conversaciones privadas,
 * que es donde se va a hablar, y la pantalla del proyecto solo enseña una
 * muestra con su enlace.
 *
 * Las rutas del gateway **no cambian** (`/projects/:id/chat/...`): lo que
 * cambia es qué zona las llama. Cada zona tiene su propio proxy y su propio
 * `revalidatePath`, así que estas son las de esta zona; las de `projects-front`
 * se quedan para lo que sigue viviendo allí.
 *
 * El tope del texto y la validación son los mismos que en el chat privado — es
 * el mismo `ChatPanel` el que los usa.
 */

const MAX = 4000;

async function requireApi() {
  const session = await getSession();
  if (!session) return null;
  return createServerApiClient();
}

/** Revalida la conversación del proyecto y la bandeja, que enseña el último. */
function revalidarChat(projectId: string) {
  /* Rutas **internas** de la zona, sin el basePath. Ver la nota gemela en
     `actions.ts`. */
  revalidatePath(`/proyecto/${projectId}`);
  revalidatePath('/');
}

function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      /* ⚠️ **No todos los 403 son de permisos.** Un proyecto suspendido y un
         equipo sin asientos también responden 403, traen su propio `code` y su
         mensaje explica la salida — que no es «pídeselo a quien administra».
         Sustituirlo por la frase de abajo le dice al dueño de un proyecto que no
         tiene permiso sobre lo suyo. */
      if (el403SeExplicaSolo(error.code)) return error.message;
      return 'Tu rol en este proyecto no incluye escribir en su chat.';
    }
    if (error.status >= 500) return fallback;
    return error.message;
  }
  return fallback;
}

/** Colapsa saltos de línea de más, como el chat privado. */
function normalizar(texto: string): string {
  return texto
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Escribe en el chat de un equipo y **devuelve el mensaje creado**.
 *
 * ⚠️ **Ya no revalida la ruta.** Mismo motivo, palabra por palabra, que en
 * `sendDirectMessageAction`: la revalidación competía en la cola de transición
 * del App Router con los refrescos del flujo en vivo, y perder esa carrera era
 * el fallo de «se envía y no se pinta». El panel inserta el mensaje que devuelve
 * esto, y a los demás les llega por `chat.mensaje`.
 */
export async function sendProjectMessageAction(
  projectId: string,
  cuerpo: string,
  replyToId: string | null,
  attachmentIds: string[] = [],
  enHilo = false,
): Promise<{ error: string | null; mensaje: ChatMessage | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', mensaje: null };

  const body = normalizar(cuerpo);
  /* Un mensaje puede ir sin texto si lleva archivos: el tope solo se
     comprueba cuando hay algo escrito. */
  if (body.length > MAX) {
    return { error: `El mensaje no puede superar ${MAX} caracteres.`, mensaje: null };
  }
  if (!body && attachmentIds.length === 0)
    return { error: 'El mensaje está vacío.', mensaje: null };
  if (attachmentIds.length > 5) {
    return { error: 'Un mensaje no puede llevar más de 5 archivos.', mensaje: null };
  }

  try {
    /* Se confirma contra el `data` de la respuesta y no contra el status: un
       200 sin cuerpo ya nos ha mentido antes (CLAUDE.md). */
    const created = await api.post<ChatMessage>(`/projects/${projectId}/chat/messages`, {
      ...(body ? { body } : {}),
      ...(replyToId && { replyToId }),
      ...(attachmentIds.length > 0 && { attachmentIds }),
      ...(enHilo && { enHilo }),
    });
    if (!created?.id) return { error: 'El servidor no guardó el mensaje.', mensaje: null };
    return { error: null, mensaje: created };
  } catch (error) {
    return { error: describe(error, 'No se pudo enviar el mensaje.'), mensaje: null };
  }
}

/** Lo borra su autor, o quien gestione el equipo. El gateway lo resuelve. */
export async function deleteProjectMessageAction(
  projectId: string,
  messageId: string,
): Promise<{ error: string | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.' };

  try {
    await api.delete(`/projects/${projectId}/chat/messages/${messageId}`);
  } catch (error) {
    return { error: describe(error, 'No se pudo eliminar el mensaje.') };
  }

  /* ⚠️ Sin revalidar, por lo mismo que enviar: el panel pinta la lápida al
     instante y a los demás les llega por el flujo (`chat.borrado`). */
  return { error: null };
}

/**
 * Pone o quita una reacción.
 *
 * ⚠️ **No revalida.** Reaccionar repintaría la conversación entera por un
 * emoji, y con varias personas reaccionando seguido eso es un parpadeo
 * constante. El panel pinta lo suyo al instante y lo corrige con el servidor.
 */
export async function reactProjectAction(
  projectId: string,
  messageId: string,
  emoji: string,
  on: boolean,
): Promise<void> {
  const api = await requireApi();
  if (!api) return;

  await api
    .post(`/projects/${projectId}/chat/messages/${messageId}/react`, { emoji, on })
    .catch(() => undefined);
}

/** Fija o desfija. No revalida, por lo mismo que reaccionar. */
export async function pinProjectAction(
  projectId: string,
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
    }>(`/projects/${projectId}/chat/messages/${messageId}/pin`, { on });
    if (!resultado) {
      return { error: 'El servidor no guardó el fijado.', pinned: false, pinnedById: null };
    }
    return { error: null, pinned: resultado.pinned, pinnedById: resultado.pinnedById };
  } catch (error) {
    return {
      error: describe(error, 'No se pudo fijar el mensaje.'),
      pinned: false,
      pinnedById: null,
    };
  }
}

/** Edita un mensaje propio. Solo el autor; el servidor lo comprueba. */
export async function editProjectAction(
  projectId: string,
  messageId: string,
  body: string,
): Promise<{ error: string | null; message: ChatMessage | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', message: null };

  try {
    const resultado = await api.patch<ChatMessage>(
      `/projects/${projectId}/chat/messages/${messageId}`,
      { body },
    );
    if (!resultado) return { error: 'El servidor no guardó el cambio.', message: null };
    return { error: null, message: resultado };
  } catch (error) {
    return { error: describe(error, 'No se pudo editar el mensaje.'), message: null };
  }
}

/**
 * Deja el chat por leído.
 *
 * ⚠️ **Ya no revalida el layout.** Lo hacía por el contador de la barra lateral,
 * pero el panel llama a esto **cada vez que llega un mensaje con el chat
 * abierto**: en una conversación viva era un renderizado completo del armazón
 * por mensaje, compitiendo en la misma cola de transición que el envío. El
 * contador lo bajan ahora las listas al recibir `chat.leido` por el flujo, que
 * además llega a tus otras pestañas — leer en el móvil apaga la insignia en el
 * portátil, cosa que la revalidación no hacía.
 */
export async function markProjectReadAction(projectId: string): Promise<void> {
  const api = await requireApi();
  if (!api) return;

  await api.post(`/projects/${projectId}/chat/read`, {}).catch(() => undefined);
}

/** Sube un archivo y lo deja en borrador hasta que un mensaje lo reclame. */
export async function uploadProjectAttachmentAction(
  projectId: string,
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
    const created = await api.postForm<ChatAttachment>(
      `/projects/${projectId}/chat/attachments`,
      upload,
    );
    if (!created?.id) return { error: 'El servidor no guardó el archivo.', attachment: null };
    return { error: null, attachment: created };
  } catch (error) {
    return { error: describe(error, 'No se pudo subir el archivo.'), attachment: null };
  }
}

/** Borra un adjunto: un borrador propio, o cualquiera si moderas. */
export async function deleteProjectAttachmentAction(
  projectId: string,
  attachmentId: string,
): Promise<{ error: string | null }> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.' };

  try {
    await api.delete(`/projects/${projectId}/chat/attachments/${attachmentId}`);
  } catch (error) {
    return { error: describe(error, 'No se pudo eliminar el archivo.') };
  }

  return { error: null };
}

/**
 * Silencia el chat del proyecto, o le devuelve el sonido.
 *
 * ⚠️ **Silenciar no deja de contar lo no leído.** Lo que se apaga es la tarjeta
 * emergente y el sonido; la insignia sigue.
 */
export async function muteProjectAction(
  projectId: string,
  muted: boolean,
): Promise<{ muted: boolean } | null> {
  const api = await requireApi();
  if (!api) return null;

  const confirmado = await api
    .post<{ muted: boolean }>(`/projects/${projectId}/chat/mute`, { muted })
    .catch(() => null);

  if (confirmado) revalidarChat(projectId);
  return confirmado;
}
