import { createGatewayProxy } from '@praxis/commons/auth';

/**
 * Proxy autenticado de dashboard-front.
 *
 * `/dashboard/api/gateway/projects` → `GATEWAY_URL/api/projects` con el Bearer
 * leído de la cookie httpOnly. Toda la lógica vive en @praxis/commons/auth para
 * que cada zona nueva sea este mismo archivo de dos líneas.
 *
 * Hoy el panel se sirve entero desde el servidor y usa `createServerApiClient`,
 * así que este handler todavía no tiene clientes. Se monta igualmente porque es
 * el contrato de la zona: en cuanto un componente cliente necesite hablar con
 * el gateway, `createApiClient({ gatewayPath: '/dashboard/api/gateway' })`
 * funciona sin tocar nada.
 */
export const { GET, POST, PUT, PATCH, DELETE } = createGatewayProxy();
