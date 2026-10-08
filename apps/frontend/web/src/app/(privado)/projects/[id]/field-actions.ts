'use server';

import {
  ApiError,
  CUSTOM_FIELD_TYPES,
  type CustomField,
  type CustomFieldOption,
  type CustomFieldType,
  type FieldInput,
  LABEL_COLORS,
  el403SeExplicaSolo,
  fieldTakesOptions,
} from '@praxis/commons';
import { createServerApiClient, getSession } from '@praxis/commons/auth';
import { revalidatePath } from 'next/cache';

/**
 * Campos personalizados: definirlos y escribir su valor en una tarea
 * (`docs/PLAN-CAMPOS-PERSONALIZADOS.md`).
 *
 * Aparte de `actions.ts` por lo mismo que `sprint-actions.ts`: es un dominio
 * propio. Se llaman **directamente** desde el editor, no desde un `<form>`:
 * cada campo se guarda al cambiarlo (D5), y meterlos en el formulario del panel
 * los ataría a su guardado al cerrar, que reescribe encargados y etiquetas.
 *
 * Confirman contra el `data` de la respuesta, no contra el status (regla de
 * `CLAUDE.md`).
 */

export type FieldActionResult = { error: string | null };

async function requireApi() {
  const session = await getSession();
  if (!session) return null;
  return createServerApiClient();
}

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
}

/** Mismo criterio que `describe` de `actions.ts`: un 403 con código propio se explica solo. */
function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      if (el403SeExplicaSolo(error.code)) return error.message;
      return 'No tienes permiso para cambiar los campos de este proyecto.';
    }
    if (error.status >= 500) return fallback;
    return error.message;
  }
  return fallback;
}

const SESSION_EXPIRED = 'Tu sesión ha caducado. Vuelve a iniciar sesión.';

/** Lo mismo que valida el DTO, para que el mensaje llegue antes y en español. */
function validateField(input: {
  name: string;
  type?: string;
  options?: { name: string; color: string }[];
}): string | null {
  const name = input.name.trim();
  if (!name) return 'El campo necesita un nombre.';
  if (name.length > 40) return 'El nombre no puede pasar de 40 caracteres.';
  if (input.type !== undefined && !CUSTOM_FIELD_TYPES.includes(input.type as CustomFieldType)) {
    return 'Ese tipo de campo no existe.';
  }
  if (input.options) {
    if (input.options.length > 50) return 'Un campo admite hasta 50 opciones.';
    const seen = new Set<string>();
    for (const option of input.options) {
      const optionName = option.name.trim();
      if (!optionName) return 'Todas las opciones necesitan un nombre.';
      if (optionName.length > 40) return 'Una opción no puede pasar de 40 caracteres.';
      if (!LABEL_COLORS.includes(option.color as CustomFieldOption['color'])) {
        return 'Ese color no existe.';
      }
      const key = optionName.toLocaleLowerCase('es');
      if (seen.has(key)) return `La opción «${optionName}» está repetida.`;
      seen.add(key);
    }
  }
  return null;
}

/**
 * Crea un campo o, con `fieldId`, lo edita. El tipo solo se manda al crear: un
 * campo no cambia de tipo.
 */
export async function saveCustomFieldAction(input: {
  projectId: string;
  fieldId?: string;
  name: string;
  type: CustomFieldType;
  options: { id?: string; name: string; color: string }[];
  showOnCard: boolean;
}): Promise<FieldActionResult & { field?: CustomField }> {
  const api = await requireApi();
  if (!api) return { error: SESSION_EXPIRED };

  const name = input.name.trim();
  const options = fieldTakesOptions(input.type)
    ? input.options.map((o) => ({
        ...(o.id ? { id: o.id } : {}),
        name: o.name.trim(),
        color: o.color,
      }))
    : undefined;

  const invalid = validateField({
    name,
    type: input.fieldId ? undefined : input.type,
    options,
  });
  if (invalid) return { error: invalid };

  try {
    const saved = input.fieldId
      ? await api.patch<CustomField>(`/projects/${input.projectId}/fields/${input.fieldId}`, {
          name,
          showOnCard: input.showOnCard,
          ...(options !== undefined && { options }),
        })
      : await api.post<CustomField>(`/projects/${input.projectId}/fields`, {
          name,
          type: input.type,
          showOnCard: input.showOnCard,
          ...(options !== undefined && { options }),
        });

    if (!saved?.id || saved.name !== name) {
      return { error: 'El servidor no guardó el campo.' };
    }
    revalidateProject(input.projectId);
    return { error: null, field: saved };
  } catch (error) {
    // El nombre repetido llega como 409 con su propio mensaje.
    return { error: describe(error, 'No se pudo guardar el campo.') };
  }
}

/** Cambia solo si un campo sale en la tarjeta: el atajo de la tabla. */
export async function toggleFieldOnCardAction(input: {
  projectId: string;
  fieldId: string;
  showOnCard: boolean;
}): Promise<FieldActionResult> {
  const api = await requireApi();
  if (!api) return { error: SESSION_EXPIRED };
  try {
    const saved = await api.patch<CustomField>(
      `/projects/${input.projectId}/fields/${input.fieldId}`,
      { showOnCard: input.showOnCard },
    );
    if (saved?.showOnCard !== input.showOnCard) {
      return { error: 'El servidor no guardó el cambio.' };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo cambiar el campo.') };
  }
  revalidateProject(input.projectId);
  return { error: null };
}

/**
 * Mueve un campo un puesto a la izquierda o a la derecha.
 *
 * Reescribe el `order` de **todos**: los campos creados antes pueden compartir
 * número, y cambiar solo dos dejaría empates que el servidor resuelve por fecha.
 */
export async function reorderCustomFieldsAction(input: {
  projectId: string;
  orderedIds: string[];
}): Promise<FieldActionResult> {
  const api = await requireApi();
  if (!api) return { error: SESSION_EXPIRED };
  try {
    await Promise.all(
      input.orderedIds.map((id, order) =>
        api.patch<CustomField>(`/projects/${input.projectId}/fields/${id}`, { order }),
      ),
    );
  } catch (error) {
    return { error: describe(error, 'No se pudo reordenar los campos.') };
  }
  revalidateProject(input.projectId);
  return { error: null };
}

/** Borra el campo **y su valor en todas las tareas**. Quien llama lo advierte antes. */
export async function deleteCustomFieldAction(input: {
  projectId: string;
  fieldId: string;
}): Promise<FieldActionResult> {
  const api = await requireApi();
  if (!api) return { error: SESSION_EXPIRED };
  try {
    const result = await api.delete<{ success: boolean }>(
      `/projects/${input.projectId}/fields/${input.fieldId}`,
    );
    if (!result?.success) return { error: 'El servidor no borró el campo.' };
  } catch (error) {
    return { error: describe(error, 'No se pudo eliminar el campo.') };
  }
  revalidateProject(input.projectId);
  return { error: null };
}

/** Escribe —o vacía, con `null`— el valor de un campo en una tarea. */
export async function setTaskFieldValueAction(input: {
  projectId: string;
  taskId: string;
  fieldId: string;
  value: FieldInput;
}): Promise<FieldActionResult> {
  const api = await requireApi();
  if (!api) return { error: SESSION_EXPIRED };
  try {
    const saved = await api.put<{ taskId: string; fieldId: string }>(
      `/tasks/${input.taskId}/fields/${input.fieldId}`,
      { value: input.value },
    );
    if (saved?.taskId !== input.taskId || saved.fieldId !== input.fieldId) {
      return { error: 'El servidor no guardó el valor.' };
    }
  } catch (error) {
    return { error: describe(error, 'No se pudo guardar el valor.') };
  }
  revalidateProject(input.projectId);
  return { error: null };
}
