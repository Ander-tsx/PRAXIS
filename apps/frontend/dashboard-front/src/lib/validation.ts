/**
 * Validación de proyecto: **reexportada desde commons**.
 *
 * La definición vive en `commons/organisms/CreateProjectDialog/project-form.ts`
 * porque la comparten el organismo y las Server Actions de las dos zonas, y las
 * tres tienen que decir lo mismo. Estuvo copiada aquí y allí.
 *
 * Se reexporta en lugar de cambiar los imports de media zona: el nombre local
 * ya está en uso y la fuente única es lo que importaba.
 */
export {
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
  PROJECT_NAME_MIN,
  type ProjectInput,
  validateProject,
} from '@praxis/commons';

/**
 * Validación del perfil.
 *
 * `UpdateUserDto` solo pide `@IsString()` para ambos campos: no fija longitudes
 * ni obliga a ninguno. Los límites de aquí son nuestros, para que el formulario
 * tenga sentido, y son **más estrictos** que los del backend — así nunca
 * mandamos algo que el servidor rechazaría el día que valide de verdad.
 */
export const NAME_MIN = 2;
export const NAME_MAX = 60;

export interface ProfileInput {
  firstName: string;
  lastName: string;
}

export function validateProfile({ firstName, lastName }: ProfileInput): string | null {
  const fields = [
    { value: firstName.trim(), label: 'El nombre' },
    { value: lastName.trim(), label: 'El apellido' },
  ];

  for (const { value, label } of fields) {
    if (value.length < NAME_MIN) {
      return `${label} debe tener al menos ${NAME_MIN} caracteres.`;
    }
    if (value.length > NAME_MAX) {
      return `${label} no puede superar ${NAME_MAX} caracteres.`;
    }
  }

  return null;
}
