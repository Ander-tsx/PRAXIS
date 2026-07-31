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
