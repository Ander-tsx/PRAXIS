'use server';

import type { CreateProjectState } from '@/lib/action-state';
import { validateProject } from '@/lib/validation';
import {
  ApiError,
  type Project,
  type ProjectTemplate,
  type TemplateDraftState,
  type TemplateResult,
} from '@praxis/commons';
import { detallesDeCuota } from '@praxis/commons/billing/planes';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { aplicarPlantilla, pedirBorrador } from '@praxis/commons/template';
import { revalidatePath } from 'next/cache';

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
    return {
      error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
      createdName: null,
      cuota: null,
    };
  }

  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();

  const invalid = validateProject({ name, description });
  if (invalid) return { error: invalid, createdName: null, cuota: null };

  const api = createServerApiClient();

  let created: Project;
  try {
    created = await api.post<Project>('/projects', {
      name,
      ...(description ? { description } : {}),
    });
  } catch (error) {
    /* El 402 sale por su propia puerta: el diálogo necesita el detalle para
       ofrecer una salida, no solo la frase. Ver `QuotaNotice`. */
    return {
      error: describeProjectError(error),
      createdName: null,
      cuota: detallesDeCuota(error),
    };
  }

  if (!created?.id || created.name !== name) {
    return {
      error: 'El servidor respondió correctamente pero no guardó el proyecto.',
      createdName: null,
      cuota: null,
    };
  }

  revalidatePath('/');
  return { error: null, createdName: created.name, cuota: null };
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
  ajuste?: { texto: string; previa: ProjectTemplate },
): Promise<TemplateDraftState> {
  const session = await getSession();
  if (!session) {
    return { resultado: null, error: 'Tu sesión ha caducado.', sinCuota: false, cuota: null };
  }
  return pedirBorrador(brief, ajuste);
}

/**
 * Crea el proyecto y todo lo que la plantilla propone.
 *
 * Llama a los endpoints de siempre, uno a uno, con esta sesión: no hay ninguna
 * vía de escritura nueva. Ver `commons/template/apply`.
 */
export async function crearProyectoDesdePlantillaAction(
  plantilla: ProjectTemplate,
): Promise<TemplateResult> {
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
