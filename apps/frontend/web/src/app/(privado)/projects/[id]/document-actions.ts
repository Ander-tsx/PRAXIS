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
 * Renombra un documento. **Solo el título**: el contenido se escribe en vivo,
 * por el tiempo real (E4 de `docs/PLAN-DOCUMENTOS.md`).
 */
export async function renameDocumentAction(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  const api = await requireApi();
  if (!api) return { error: 'Tu sesión ha caducado.', done: null, conflicto: false };

  const projectId = String(formData.get('projectId') ?? '');
  const workspaceId = String(formData.get('workspaceId') ?? '');
  const documentId = String(formData.get('documentId') ?? '');
  const title = String(formData.get('title') ?? '').trim() || 'Sin título';
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
      { title },
    );
    if (doc?.title !== title) {
      return { error: 'El servidor no guardó el título.', done: null, conflicto: false };
    }
  } catch (error) {
    return {
      error: describe(error, 'No se pudo renombrar el documento.'),
      done: null,
      conflicto: false,
    };
  }

  revalidatePath(`/projects/${projectId}`);
  return { error: null, done: title, conflicto: false };
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
