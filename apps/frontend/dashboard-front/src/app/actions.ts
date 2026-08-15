'use server';

import type { CreateProjectState } from '@/lib/action-state';
import { validateProject } from '@/lib/validation';
import { ApiError } from '@praxis/commons';
import type {
  PlantillaBorradorState,
  PlantillaDeProyecto,
  PlantillaResultado,
  Project,
} from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { aplicarPlantilla, pedirBorrador } from '@praxis/commons/plantilla';
import { revalidatePath } from 'next/cache';

/**
 * Crea un proyecto.
 *
 * Tres cosas que no son obvias:
 *
 * 1. **No se manda `ownerId`.** El gateway lo inyecta desde el token, después
 *    del spread del body (`{ ...body, ownerId }`), así que mandarlo no serviría
 *    de nada — y el DTO no lo declara para esta ruta. Regla de compatibilidad
 *    hacia adelante: solo los campos que el DTO declara, ni uno más.
 * 2. **Se confirma contra el `data`, no contra el status.** El hábito viene de
 *    cuando el gateway no validaba y devolvía 200 sin guardar; sigue siendo lo
 *    correcto, porque un 2xx no promete que se guardara lo que mandamos.
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

/**
 * Le pide al asistente una plantilla para un proyecto nuevo.
 *
 * **No crea nada.** Es la mitad que propone; la que ejecuta es
 * `crearProyectoDesdePlantillaAction`, y solo después de que alguien haya visto
 * el plan. La lógica vive en `commons` porque el diálogo que la usa lo montan
 * dos zonas; aquí solo se le pone el `'use server'` de esta.
 */
export async function borradorDePlantillaAction(
  brief: string,
  ajuste?: { texto: string; previa: PlantillaDeProyecto },
): Promise<PlantillaBorradorState> {
  const session = await getSession();
  if (!session) {
    return { resultado: null, error: 'Tu sesión ha caducado.', sinCuota: false };
  }
  return pedirBorrador(brief, ajuste);
}

/**
 * Crea el proyecto y todo lo que la plantilla propone.
 *
 * Llama a los endpoints de siempre, uno a uno, con esta sesión: no hay ninguna
 * vía de escritura nueva. Ver `commons/plantilla/aplicar`.
 */
export async function crearProyectoDesdePlantillaAction(
  plantilla: PlantillaDeProyecto,
): Promise<PlantillaResultado> {
  const session = await getSession();
  if (!session) {
    return {
      proyecto: null,
      creado: { etiquetas: 0, roles: 0, espacios: 0, tableros: 0, columnas: 0 },
      fallos: [],
      error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
    };
  }

  const resultado = await aplicarPlantilla(plantilla);
  if (resultado.proyecto) revalidatePath('/');
  return resultado;
}
