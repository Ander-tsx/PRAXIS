import { createGatewayProxy } from '@praxis/commons/auth';

/**
 * Proxy autenticado de chat-front.
 *
 * `/chat/api/gateway/chat/channels` → `GATEWAY_URL/api/chat/channels` con el
 * Bearer leído de la cookie httpOnly. Toda la lógica vive en
 * @praxis/commons/auth para que cada zona nueva sea este mismo archivo de dos
 * líneas.
 *
 * ⚠️ **Aquí sí tiene clientes desde el primer día**, al revés que en las otras
 * zonas. El chat es la superficie más de cliente del sistema: el panel escucha
 * el flujo de eventos, pide historial al desplazarse hacia arriba, resuelve
 * avatares y marca leído — todo desde el navegador, con
 * `createApiClient({ gatewayPath: '/chat/api/gateway' })`. Ver E3.4 del plan de
 * pulido: la constante `GATEWAY` de `useConversacionesEnVivo` y los
 * `hrefDeAvatar` son justo las que hay que repuntar aquí al mudar las
 * pantallas.
 */
export const { GET, POST, PUT, PATCH, DELETE } = createGatewayProxy();
