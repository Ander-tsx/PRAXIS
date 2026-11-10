import { type AgentClaim, JwtPayloadDto } from '@praxis/contracts';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        /**
         * Presente solo si la petición viene de un agente por el MCP. Sale del
         * JWT que firma credentials: no lo puede poner el cliente.
         */
        agent?: AgentClaim;
      };
      /**
       * Proyecto al que pertenece el recurso de la ruta, resuelto por
       * `ProjectPermissionGuard` a partir de los parámetros de la URL.
       *
       * **Es la única fuente válida del `projectId`.** Los controladores lo
       * inyectan en el payload al microservicio; nunca lo toman del cuerpo,
       * porque entonces sería el cliente quien decide sobre qué proyecto se
       * evalúa su permiso.
       */
      projectId?: string;
    }
  }
}
