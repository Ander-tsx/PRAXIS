/**
 * Capa de autenticación compartida por todas las zonas.
 *
 * ⚠️ Módulo de servidor: `session` usa `next/headers` y `proxy` usa
 * `next/server`. NO se re-exporta desde `@praxis/commons` (el índice raíz lo
 * consumen componentes de cliente). Impórtalo siempre por su subruta:
 *
 *   import { getSession } from '@praxis/commons/auth';
 */

export * from './cookies';
export * from './session';
export * from './proxy';
export * from './refresh-proxy';
export * from './zone';
