/**
 * Tema claro/oscuro, compartido por todas las zonas.
 *
 * ⚠️ Módulo de servidor: usa `next/headers`. NO se re-exporta desde
 * `@praxis/commons` (el índice raíz lo consumen componentes de cliente).
 * Impórtalo siempre por su subruta:
 *
 *   import { getTheme } from '@praxis/commons/theme';
 */

export * from './cookie';
export * from './theme';
/* La barra lateral plegada vive aquí por lo mismo que el tema: es una
   preferencia que el servidor tiene que conocer al pintar, o parpadea. */
export * from './sidebar';
/* La organización activa, por lo mismo que las dos de arriba: si no la sabe el
   servidor al pintar, la lista de proyectos sale entera y se recorta después. */
export * from './organizacion';
