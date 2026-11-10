import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { McpActionsService, type RegistrarAccion } from './mcp-actions.service';
import { McpConnectionsService } from './mcp-connections.service';
import { PersonalTokensService } from './personal-tokens.service';

/**
 * Los tokens personales, por TCP. Solo los llama el gateway.
 *
 * ⚠️ Como el resto de servicios internos, confía en el `userId` que le llega:
 * lo pone el gateway desde el JWT verificado. La pertenencia a la
 * organización y el plan los comprueba el gateway antes de `pat_create`.
 */
@Controller()
export class PersonalTokensController {
  constructor(
    private readonly tokens: PersonalTokensService,
    private readonly conexiones: McpConnectionsService,
    private readonly acciones: McpActionsService,
  ) {}

  /** Anota una escritura hecha por un agente. La llama el gateway tras cada una que sale bien. */
  @MessagePattern({ cmd: 'mcp_action_record' })
  registrarAccion(@Payload() dto: RegistrarAccion) {
    return this.acciones.registrar(dto);
  }

  @MessagePattern({ cmd: 'mcp_task_editors' })
  editoresDeTarea(@Payload() dto: { taskId: string }) {
    return this.acciones.editoresDeTarea(dto.taskId);
  }

  @MessagePattern({ cmd: 'pat_create' })
  crear(
    @Payload()
    dto: {
      userId: string;
      organizationId: string;
      name: string;
      scopes: string[];
      expiresInDays?: number;
    },
  ) {
    return this.tokens.crear(dto);
  }

  @MessagePattern({ cmd: 'pat_list' })
  listar(@Payload() dto: { userId: string }) {
    return this.tokens.listar(dto.userId);
  }

  @MessagePattern({ cmd: 'pat_revoke' })
  revocar(@Payload() dto: { userId: string; id: string }) {
    return this.tokens.revocar(dto.userId, dto.id);
  }

  /** El canje de cada llamada al MCP. El token en claro no se registra (I3). */
  @MessagePattern({ cmd: 'pat_exchange' })
  canjear(@Payload() dto: { token: string }) {
    return this.tokens.canjear(dto.token);
  }

  /* ─── Conexiones por OAuth (Kyloo Accounts) ───────────────────────────── */

  @MessagePattern({ cmd: 'mcp_conn_identify' })
  identificar(@Payload() dto: { sub: string; email: string }) {
    return this.conexiones.identificar(dto);
  }

  @MessagePattern({ cmd: 'mcp_conn_save' })
  guardarConexion(
    @Payload()
    dto: {
      userId: string;
      kylooSub: string;
      clientId: string;
      clientName: string;
      allowedOrgIds: string[];
      activeOrgId: string;
    },
  ) {
    return this.conexiones.guardar(dto);
  }

  @MessagePattern({ cmd: 'mcp_conn_list' })
  listarConexiones(@Payload() dto: { userId: string }) {
    return this.conexiones.listar(dto.userId);
  }

  @MessagePattern({ cmd: 'mcp_conn_update' })
  actualizarConexion(
    @Payload()
    dto: { userId: string; id: string; allowedOrgIds?: string[]; activeOrgId?: string },
  ) {
    return this.conexiones.actualizar(dto.userId, dto.id, dto);
  }

  @MessagePattern({ cmd: 'mcp_conn_revoke' })
  revocarConexion(@Payload() dto: { userId: string; id: string }) {
    return this.conexiones.revocar(dto.userId, dto.id);
  }

  /** La sesión de cada llamada del MCP con token OAuth. */
  @MessagePattern({ cmd: 'mcp_conn_session' })
  sesionDeConexion(@Payload() dto: { connectionId: string; sub: string }) {
    return this.conexiones.sesion(dto);
  }
}
