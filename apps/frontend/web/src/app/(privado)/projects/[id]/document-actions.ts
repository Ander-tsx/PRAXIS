'use server';

import type { DocumentState } from '@/lib/projects/action-state';
import {
  ApiError,
  DOCUMENT_CHANGED_CODE,
  type ProjectDocument,
  el403SeExplicaSolo,
} from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { revalidatePath } from 'next/cache';

/**
 * Documentos de un espacio (`docs/PLAN-DOCUMENTOS.md`). Mismo trato que las
 * demás acciones del proyecto: sesión comprobada aquí y confirmación contra el
 * `data`, no contra el status.
 */

async function requireApi() {
  const session = await getSession();
  if (!session) return null;
  return createServerApiClient();
}

function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      if (el403SeExplicaSolo(error.code)) return error.message;
      return 'No tienes permiso para editar documentos en este proyecto.';
    }
    if (error.status >= 500) return fallback;
    return error.message;
  }
  return fallback;
}

const MAX_TITULO = 200;

/** Crea un documento «Sin título» y devuelve su id para abrirlo. */
export async function createDocumentAction(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null, conflicto: false };

  const projectId = String(formData.get('projectId') ?? '');
  const workspaceId = String(formData.get('workspaceId') ?? '');
  const title = String(formData.get('title') ?? '').trim() || 'Sin título';

  try {
    const doc = await api.post<ProjectDocument>(`/workspaces/${workspaceId}/documents`, {
      title: title.slice(0, MAX_TITULO),
    });
    if (!doc?.id)
      return { error: 'El servidor no creó el documento.', done: null, conflicto: false };
    revalidatePath(`/projects/${projectId}`);
    return { error: null, done: doc.id, conflicto: false };
  } catch (error) {
    return {
      error: describe(error, 'No se pudo crear el documento.'),
      done: null,
      conflicto: false,
    };
  }
}

/**
 * Guarda título y contenido **si nadie lo cambió desde que se abrió** (D4).
 *
 * El 409 no es un error más: vuelve con `conflicto: true` para que la pantalla
 * conserve lo escrito y ofrezca copiarlo antes de recargar.
 */
export async function saveDocumentAction(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null, conflicto: false };

  const projectId = String(formData.get('projectId') ?? '');
  const workspaceId = String(formData.get('workspaceId') ?? '');
  const documentId = String(formData.get('documentId') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  /* `multipart/form-data` normaliza los saltos de línea a CRLF por norma, y un
     `\r` al final de `## Título` basta para que el Markdown no lo reconozca. */
  const content = String(formData.get('content') ?? '').replace(/\r\n?/g, '\n');
  const expectedUpdatedAt = String(formData.get('expectedUpdatedAt') ?? '');

  if (!title) return { error: 'El documento necesita un título.', done: null, conflicto: false };
  if (title.length > MAX_TITULO) {
    return {
      error: `El título no puede pasar de ${MAX_TITULO} caracteres.`,
      done: null,
      conflicto: false,
    };
  }

  try {
    const doc = await api.patch<ProjectDocument>(
      `/workspaces/${workspaceId}/documents/${documentId}`,
      {
        title,
        content,
        expectedUpdatedAt,
      },
    );
    if (doc?.content !== content) {
      return { error: 'El servidor no guardó el documento.', done: null, conflicto: false };
    }
  } catch (error) {
    if (error instanceof ApiError && error.code === DOCUMENT_CHANGED_CODE) {
      return { error: error.message, done: null, conflicto: true };
    }
    return {
      error: describe(error, 'No se pudo guardar el documento.'),
      done: null,
      conflicto: false,
    };
  }

  revalidatePath(`/projects/${projectId}`);
  return { error: null, done: 'saved', conflicto: false };
}

export async function deleteDocumentAction(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null, conflicto: false };

  const projectId = String(formData.get('projectId') ?? '');
  const workspaceId = String(formData.get('workspaceId') ?? '');
  const documentId = String(formData.get('documentId') ?? '');

  try {
    await api.delete(`/workspaces/${workspaceId}/documents/${documentId}`);
  } catch (error) {
    return {
      error: describe(error, 'No se pudo borrar el documento.'),
      done: null,
      conflicto: false,
    };
  }

  revalidatePath(`/projects/${projectId}`);
  return { error: null, done: 'deleted', conflicto: false };
}
