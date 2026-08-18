import { createGatewayProxy } from '@praxis/commons/auth';

/**
 * Proxy autenticado de assistant-front.
 *
 * `/assistant/api/gateway/me/assistant/quota` → `GATEWAY_URL/api/me/assistant/quota`
 * con el Bearer leído de la cookie httpOnly. Toda la lógica vive en
 * `@praxis/commons/auth`.
 *
 * En esta zona pesa más que en las demás: la conversación es una isla de
 * cliente que habla con `POST /projects/:id/assistant/chat` en cada turno, y la
 * cuota se refresca después de cada respuesta. Sin este proxy habría que mandar
 * el token al navegador, que es justo lo que la cookie httpOnly evita.
 *
 * ⚠️ Las **propuestas no se aceptan por aquí**. Cuando alguien pulsa «Aceptar»,
 * quien llama a `POST /projects/:id/tasks` (o a la ruta que toque) es una Server
 * Action de la zona, con la sesión de quien acepta. Es la invariante de §26.1:
 * el asistente propone y el frontend ejecuta, por los endpoints de siempre.
 */
export const { GET, POST, PUT, PATCH, DELETE } = createGatewayProxy();
