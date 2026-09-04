import { createGatewayProxy } from '@praxis/commons/auth';

/**
 * El proxy autenticado de la aplicación. Uno para todo.
 *
 * `/api/gateway/projects` → `GATEWAY_URL/api/projects` con el Bearer leído de
 * la cookie httpOnly. Toda la lógica vive en @praxis/commons/auth para que
 * cada zona nueva sea este mismo archivo de dos líneas.
 *
 * Se llama `gateway` y no `proxy` para no confundirlo con `src/proxy.ts`, que
 * en Next 16 es el sustituto de `middleware.ts` y es otra cosa distinta.
 */
export const { GET, POST, PUT, PATCH, DELETE } = createGatewayProxy();
