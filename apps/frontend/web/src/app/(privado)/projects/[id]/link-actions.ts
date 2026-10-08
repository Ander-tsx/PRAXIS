'use server';

import { ApiError, type TaskLink, el403SeExplicaSolo } from '@praxis/commons';
import { obtenerPreviewDeEnlace } from '@praxis/commons/api/link-preview';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { revalidatePath } from 'next/cache';

/**
 * Enlaces adjuntos a una tarea: un Google Doc, un Figma, un PR. Van en la
 * sección «Archivos» del panel, junto a los PDF.
 *
 * Aparte de `actions.ts` por lo mismo que `field-actions.ts`. Confirman contra
 * el `data` de la respuesta, no contra el status.
 */

export type LinkActionResult = { error: string | null };

const SESSION_EXPIRED = 'Tu sesión ha caducado. Vuelve a iniciar sesión.';

function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      if (el403SeExplicaSolo(error.code)) return error.message;
      return error.message || 'No tienes permiso para cambiar los enlaces de esta tarea.';
    }
    if (error.status >= 500) return fallback;
    return error.message;
  }
  return fallback;
}

/**
 * Títulos que no son de la página sino de su puerta: un Google Doc privado
 * responde con la pantalla de inicio de sesión, y guardar «Google Docs: Sign-in»
 * como título de cada enlace sería peor que no tener ninguno —sin título se
 * enseña el dominio—.
 */
const TITULO_DE_PUERTA =
  /sign[\s-]?in|log[\s-]?in|iniciar sesi[oó]n|acceso denegado|access denied/i;

/** `docs.google.com/document/…` → normaliza lo que escribió la persona. */
function normalizarUrl(raw: string): string | null {
  let valor = raw.trim();
  if (!valor) return null;
  /* Pegar «docs.google.com/…» sin protocolo es lo normal: se asume https. */
  if (!/^[a-z][a-z0-9+.-]*:/i.test(valor)) valor = `https://${valor}`;
  try {
    const url = new URL(valor);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function addTaskLinkAction(input: {
  projectId: string;
  taskId: string;
  url: string;
  title?: string;
}): Promise<LinkActionResult> {
  const session = await getSession();
  if (!session) return { error: SESSION_EXPIRED };

  const url = normalizarUrl(input.url);
  if (!url) return { error: 'Escribe un enlace válido, que empiece por http:// o https://' };
  if (url.length > 2048) return { error: 'El enlace es demasiado largo.' };

  let title = input.title?.trim().slice(0, 200) || undefined;
  if (!title) {
    /* El título de la página, si se puede leer. Con su guard SSRF y su corte de
       tiempo: si tarda o falla, el enlace se guarda igual, sin título. */
    const preview = await obtenerPreviewDeEnlace(url);
    const leido = preview?.title?.trim();
    if (leido && !TITULO_DE_PUERTA.test(leido)) title = leido.slice(0, 200);
  }

  try {
    const api = createServerApiClient();
    const saved = await api.post<TaskLink>(`/tasks/${input.taskId}/links`, {
      url,
      ...(title ? { title } : {}),
    });
    if (!saved?.id || saved.url !== url) return { error: 'El servidor no guardó el enlace.' };
  } catch (error) {
    return { error: describe(error, 'No se pudo añadir el enlace.') };
  }
  revalidatePath(`/projects/${input.projectId}`);
  return { error: null };
}

export async function deleteTaskLinkAction(input: {
  projectId: string;
  taskId: string;
  linkId: string;
}): Promise<LinkActionResult> {
  const session = await getSession();
  if (!session) return { error: SESSION_EXPIRED };
  try {
    const api = createServerApiClient();
    const result = await api.delete<{ success: boolean }>(
      `/tasks/${input.taskId}/links/${input.linkId}`,
    );
    if (!result?.success) return { error: 'El servidor no quitó el enlace.' };
  } catch (error) {
    return { error: describe(error, 'No se pudo quitar el enlace.') };
  }
  revalidatePath(`/projects/${input.projectId}`);
  return { error: null };
}
