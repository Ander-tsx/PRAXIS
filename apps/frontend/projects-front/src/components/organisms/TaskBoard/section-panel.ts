import { alpha, colors } from '@praxis/commons';

/**
 * Fondo de los bloques del diálogo de tarea: etiquetas, encargados, archivos y
 * comentarios.
 *
 * Era `bg-background`, el **negro base de la aplicación**, sobre el `surface`
 * del diálogo: el salto era tan grande que cada bloque parecía un agujero. Un
 * gris translúcido de borde queda **entre** el fondo del diálogo y los campos
 * —que siguen en `surface-elevated`—, así que los tres niveles se distinguen sin
 * que ninguno grite.
 *
 * En un módulo propio y no en `TaskDialog`: las secciones lo necesitan y el
 * diálogo las importa, así que sacarlo de ahí evita el ciclo. Y en un solo sitio
 * porque cuatro copias del mismo valor acaban con una distinta.
 */
export const SECTION_PANEL = { background: alpha(colors.border, 35) } as const;
