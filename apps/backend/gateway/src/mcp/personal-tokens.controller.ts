import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CreatePersonalTokenBodyDto,
  type CreatedPersonalToken,
  type PersonalTokenView,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { QuotaService } from '../billing/quota.service';

/**
 * Los tokens personales del MCP de quien llama (M1 y M5 de docs/PLAN-MCP.md).
 *
 * Son **de la persona**: nadie más los ve, tampoco el dueño de la organización
 * (pregunta 5 de M0). Lo que la organización controla es si se pueden usar,
 * con su interruptor.
 */
@ApiTags('MCP')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('me/tokens')
export class PersonalTokensController {
  constructor(
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
    @Inject('BILLING_SERVICE') private readonly billingClient: ClientProxy,
    private readonly quota: QuotaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Tus tokens del MCP. Nunca devuelve el token' })
  listar(@Request() req: Express.Request): Promise<PersonalTokenView[]> {
    return firstValueFrom(
      this.credentialsClient.send<PersonalTokenView[]>(
        { cmd: 'pat_list' },
        { userId: req.user!.userId },
      ),
    );
  }

  /**
   * Crea un token. Devuelve el token en claro **esta única vez**.
   *
   * El orden de las comprobaciones es el de los mensajes que hay que dar:
   * primero si estás dentro (403 `NOT_IN_ORG`), luego si el plan lo trae (402
   * con `puedeAmpliar`), y por último si la organización lo permite.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crea un token del MCP para una organización' })
  @ApiResponse({ status: 402, description: 'El plan de la organización no trae integraciones' })
  @ApiResponse({
    status: 403,
    description: 'No perteneces a esa organización, o no permite el MCP',
  })
  async crear(
    @Request() req: Express.Request,
    @Body() body: CreatePersonalTokenBodyDto,
  ): Promise<CreatedPersonalToken> {
    const userId = req.user!.userId;
    const organizationId = (await this.quota.organizacionElegida(
      userId,
      body.organizationId,
    )) as string;

    await this.quota.exigirIntegraciones(userId, organizationId);

    const acceso = await firstValueFrom(
      this.billingClient.send<{ miembro: boolean; mcpAllowed: boolean }>(
        { cmd: 'billing_org_mcp_access' },
        { organizationId, userId },
      ),
    ).catch(() => null);
    if (!acceso?.mcpAllowed) {
      throw new ForbiddenException({
        code: 'MCP_DISABLED',
        message: 'Esta organización no permite conectar agentes por MCP.',
      });
    }

    return firstValueFrom(
      this.credentialsClient.send<CreatedPersonalToken>(
        { cmd: 'pat_create' },
        {
          userId,
          organizationId,
          name: body.name,
          scopes: body.scopes,
          expiresInDays: body.expiresInDays,
        },
      ),
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoca un token. Deja de funcionar al instante' })
  revocar(
    @Request() req: Express.Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PersonalTokenView> {
    return firstValueFrom(
      this.credentialsClient.send<PersonalTokenView>(
        { cmd: 'pat_revoke' },
        { userId: req.user!.userId, id },
      ),
    );
  }
}
