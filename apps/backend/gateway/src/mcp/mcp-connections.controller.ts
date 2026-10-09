import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type McpConnectionView, UpdateMcpConnectionBodyDto } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { QuotaService } from '../billing/quota.service';

/**
 * Los clientes de IA conectados por OAuth a tu cuenta (Integraciones).
 *
 * Son **de la persona**, como los tokens personales. Aquí se cambia lo que
 * abarcan —qué organizaciones, cuál está activa— sin reconectar, y se revocan.
 */
@ApiTags('MCP')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('me/mcp/connections')
export class McpConnectionsController {
  constructor(
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
    private readonly quota: QuotaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Tus clientes de IA conectados por OAuth' })
  listar(@Request() req: Express.Request): Promise<McpConnectionView[]> {
    return firstValueFrom(
      this.credentialsClient.send<McpConnectionView[]>(
        { cmd: 'mcp_conn_list' },
        { userId: req.user!.userId },
      ),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cambia las organizaciones de una conexión o la activa' })
  async actualizar(
    @Request() req: Express.Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateMcpConnectionBodyDto,
  ): Promise<McpConnectionView> {
    const userId = req.user!.userId;
    /* Cada organización que se añade hay que tenerla: 403 `NOT_IN_ORG`, no una
       conexión que apunta a donde no puedes entrar. */
    for (const organizationId of new Set([...(body.allowedOrgIds ?? []), body.activeOrgId ?? ''])) {
      if (organizationId) await this.quota.organizacionElegida(userId, organizationId);
    }
    return firstValueFrom(
      this.credentialsClient.send<McpConnectionView>(
        { cmd: 'mcp_conn_update' },
        { userId, id, allowedOrgIds: body.allowedOrgIds, activeOrgId: body.activeOrgId },
      ),
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoca una conexión. Deja de funcionar en la siguiente llamada' })
  revocar(
    @Request() req: Express.Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<McpConnectionView> {
    return firstValueFrom(
      this.credentialsClient.send<McpConnectionView>(
        { cmd: 'mcp_conn_revoke' },
        { userId: req.user!.userId, id },
      ),
    );
  }
}
