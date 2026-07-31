'use server';

import { ApiError, type Project } from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { revalidatePath } from 'next/cache';
import type { CreateProjectState } from '@/lib/action-state';
import { validateProject } from '@/lib/validation';

/**
 * Crea un proyecto.
 *
 * No se manda `ownerId`: lo inyecta el gateway desde el token, después del
 * spread del body. Regla de compatibilidad hacia adelante: solo los campos que
 * el DTO declara.
 *
 * Se confirma contra el `data`, no contra el status: el hábito viene de cuando
 * el gateway no validaba y devolvía 200 sin guardar, y sigue siendo lo correcto.
 */
export async function createProjectAction(
  _prev: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const session = await getSession();
  if (!session) {
    return { error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.', createdName: null };
  }

  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();

  const invalid = validateProject({ name, description });
  if (invalid) return { error: invalid, createdName: null };

  const api = createServerApiClient();

  let created: Project;
  try {
    created = await api.post<Project>('/projects', {
      name,
      ...(description ? { description } : {}),
    });
  } catch (error) {
    return { error: describeProjectError(error), createdName: null };
  }

  if (!created?.id || created.name !== name) {
    return {
      error: 'El servidor respondió correctamente pero no guardó el proyecto.',
      createdName: null,
    };
  }

  revalidatePath('/');
  return { error: null, createdName: created.name };
}

function describeProjectError(error: unknown): string {
  if (error instanceof ApiError) {
    /**
     * `Project.name` es único a nivel **global**, no por usuario ni por
     * organización, así que el choque puede ser con el proyecto de un equipo
     * que no conoces. De ahí la coletilla.
     */
    if (error.code === 'CONFLICT') {
      return `${error.message} Los nombres son únicos en toda la plataforma, así que prueba con uno más específico.`;
    }
    if (error.status >= 500) {
      return 'No se pudo crear el proyecto. Inténtalo de nuevo en un momento.';
    }
    return error.message;
  }
  return 'No se pudo crear el proyecto.';
}
