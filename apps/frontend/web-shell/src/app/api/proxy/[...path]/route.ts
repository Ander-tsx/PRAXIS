import { createGatewayProxy } from '@praxis/commons/auth';

/**
 * Proxy autenticado del web-shell.
 *
 * `/api/proxy/projects` → `GATEWAY_URL/api/projects` con el Bearer leído de la
 * cookie httpOnly. Toda la lógica vive en @praxis/commons/auth para que cada
 * zona nueva sea este mismo archivo de tres líneas.
 */
export const { GET, POST, PUT, PATCH, DELETE } = createGatewayProxy();
