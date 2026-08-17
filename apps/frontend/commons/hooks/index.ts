/**
 * Hooks compartidos.
 *
 * `useAccion` y `useRefrescoAgrupado` existen por el mismo motivo —la cola de
 * acciones del App Router es una sola para toda la aplicación— y se leen juntos:
 * el primero explica el fallo y el segundo baja la presión que lo destapa.
 *
 * `useTemaActual` no tiene nada que ver con ellos: dice qué tema hay puesto,
 * para lo que necesite saberlo desde el cliente.
 */

export { TECHO_DE_ESPERA_MS, useAccion } from './useAccion';
export { ESPERA_DE_AGRUPACION_MS, useRefrescoAgrupado } from './useRefrescoAgrupado';
export { type TemaActual, useTemaActual } from './useTemaActual';
