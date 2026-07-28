/**
 * Organismos compartidos.
 *
 * Un organismo sube aquí cuando lo consumen ≥2 zonas. `AppLayout` cumple por
 * construcción: en multi-zones cada zona privada es una app Next independiente
 * y renderiza su propio armazón, así que todas lo necesitan.
 */

export * from './AppLayout';
