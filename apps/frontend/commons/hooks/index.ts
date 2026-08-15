/**
 * Hooks compartidos.
 *
 * Los dos que hay existen por el mismo motivo —la cola de acciones del App
 * Router es una sola para toda la aplicación— y se leen juntos: [`useAccion`]
 * explica el fallo y [`useRefrescoAgrupado`] baja la presión que lo destapa.
 */

export { TECHO_DE_ESPERA_MS, useAccion } from './useAccion';
export { ESPERA_DE_AGRUPACION_MS, useRefrescoAgrupado } from './useRefrescoAgrupado';
