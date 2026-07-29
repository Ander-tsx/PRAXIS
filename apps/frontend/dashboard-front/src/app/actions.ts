'use server';

import { ApiError } from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { revalidatePath } from 'next/cache';
import type { CreateProjectState } from '@/lib/action-state';
import type { Project } from '@/lib/domain';
import { validateProject } from '@/lib/validation';

/**
 * Crea un proyecto.
 *
 * Tres cosas que no son obvias:
 *
 * 1. **No se manda `ownerId`.** El gateway lo inyecta desde el token, después
 *    del spread del body (`{ ...body, ownerId }`), así que mandarlo no serviría
 *    de nada — y el DTO no lo declara para esta ruta. Regla de compatibilidad
 *    hacia adelante: solo los campos que el DTO declara, ni uno más.
 * 2. **Se confirma contra el `data`, no contra el status.** Un 2xx no garantiza
 *    que se haya guardado lo que mandamos (PENDIENTES-BACKEND.md §2).
 * 3. **Se comprueba la sesión aquí también.** Las Server Functions viajan como
 *    POST a la ruta donde se usan, y un cambio de `matcher` en `proxy.ts` puede
 *    dejarlas fuera del guard sin que nadie se entere.
 */
export async function createProjectAction(
  _prevState: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const session = await getSession();
  if (!session) {
    return { error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.', createdName: null };
  }

  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();

  const invalid = validateProject({ name, description });
  if (invalid) {
    return { error: invalid, createdName: null };
  }

  const api = createServerApiClient();

  let created: Project;
  try {
    created = await api.post<Project>('/projects', {
      name,
      ...(description ? { description } : {}),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      /**
       * El backend ya distingue el nombre duplicado (409) de una caída real,
       * así que aquí se puede decir exactamente qué pasa en vez de un genérico.
       *
       * Queda un detalle de diseño del backend: `Project.name` es único a nivel
       * **global**, no por usuario ni por organización, así que el nombre puede
       * chocar con el proyecto de un equipo que no conoces. De ahí la coletilla.
       */
      if (error.code === 'CONFLICT') {
        return {
          error: `${error.message} Los nombres son únicos en toda la plataforma, así que prueba con uno más específico.`,
          createdName: null,
        };
      }
      if (error.status >= 500) {
        return {
          error: 'No se pudo crear el proyecto. Inténtalo de nuevo en un momento.',
          createdName: null,
        };
      }
      return { error: error.message, createdName: null };
    }
    return { error: 'No se pudo crear el proyecto.', createdName: null };
  }

  // Confirmación real: que exista el id y que el nombre sea el que mandamos.
  if (!created?.id || created.name !== name) {
    return {
      error: 'El servidor respondió correctamente pero no guardó el proyecto. Inténtalo de nuevo.',
      createdName: null,
    };
  }

  // Sin el basePath: `revalidatePath` habla de rutas del App Router de esta
  // app, y ahí el panel es `/`, no `/dashboard`.
  revalidatePath('/');

  return { error: null, createdName: created.name };
}
