'use client';

import type { CustomField, UserProfile } from '@praxis/commons';
import { createContext, useContext } from 'react';

/**
 * Los campos personalizados del proyecto, para el panel, la tabla y la
 * tarjeta (`docs/PLAN-CAMPOS-PERSONALIZADOS.md`).
 *
 * Contexto y no prop por la misma razón que `documentos-de-tarea.tsx`: los
 * tres sitios que los pintan cuelgan de `WorkspaceCanvas` a tres o cuatro
 * niveles, a través de componentes que no los usan. Lo pone `WorkspaceCanvas`
 * una vez.
 *
 * Fuera del proveedor no hay campos y nada se pinta: nunca rompe.
 */
export interface ProjectFieldsValue {
  projectId: string;
  /** En su orden: el de las columnas de la tabla y las filas del panel. */
  fields: CustomField[];
  /**
   * Crear, editar y borrar campos, y escribir valores. Es `canEditTask` (D2 del
   * plan): quien edita tareas decide qué se anota en ellas.
   */
  canEdit: boolean;
  /** A quién se puede elegir en un campo de tipo persona: los del proyecto. */
  members: UserProfile[];
  usersById: Map<string, UserProfile>;
}

const ProjectFields = createContext<ProjectFieldsValue>({
  projectId: '',
  fields: [],
  canEdit: false,
  members: [],
  usersById: new Map(),
});

export const ProjectFieldsProvider = ProjectFields.Provider;

export function useProjectFields(): ProjectFieldsValue {
  return useContext(ProjectFields);
}
