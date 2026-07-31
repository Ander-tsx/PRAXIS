import type { Priority } from '../api/domain';
import { colors } from './colors';

/**
 * Un color por prioridad. Urgente y alta comparten familia, para que se lean
 * juntas.
 *
 * Vivía dentro de `TaskCard`, su único consumidor. Sale aquí desde que el
 * desplegable de prioridad también los pinta: dos mapas separados acabarían
 * enseñando un rojo en la tarjeta y otro en el select para la misma tarea.
 *
 * Va en `tokens/` y no en `api/domain.ts` porque lo que produce son colores del
 * sistema de diseño. `domain.ts` describe las formas que devuelve el gateway y
 * **no importa nada**: meterle el design system ahí ataría la capa de datos a
 * la de estilos. Aquí la dependencia va en el sentido correcto, y solo del tipo.
 */
export const PRIORITY_COLORS: Record<Priority, string> = {
  LOW: colors.textDisabled,
  MEDIUM: colors.info,
  HIGH: colors.warning,
  URGENT: colors.error,
};
