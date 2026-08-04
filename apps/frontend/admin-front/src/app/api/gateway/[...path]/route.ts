import { createGatewayProxy } from '@praxis/commons/auth';

/**
 * Proxy autenticado de admin-front.
 *
 * `/admin/api/gateway/admin/users` → `GATEWAY_URL/api/admin/users` con el Bearer
 * leído de la cookie httpOnly. Toda la lógica vive en @praxis/commons/auth.
 *
 * Lo usan los componentes cliente del panel —la búsqueda con teclado y los
 * filtros del registro— que reconsultan sin recargar la página. Las mutaciones
 * van por Server Functions, que hablan con el gateway desde el servidor.
 */
export const { GET, POST, PUT, PATCH, DELETE } = createGatewayProxy();
