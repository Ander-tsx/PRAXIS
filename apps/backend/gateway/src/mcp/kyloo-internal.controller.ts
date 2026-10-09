import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { MCP_CONNECTION_MAX_ORGS, type McpConnectionView } from '@praxis/contracts';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { firstValueFrom } from 'rxjs';
import { KylooInternalGuard } from './kyloo-internal.guard';
import { McpAccessError, McpAccessService } from './mcp-access.service';

class IdentidadKylooDto {
  @IsString()
  @MaxLength(200)
  sub: string;

  @IsEmail()
  email: string;

  /** El cliente que se está conectando, para recordar lo que ya tenía. */
  @IsString()
  @MaxLength(200)
  clientId: string;
}

class GuardarConexionDto extends IdentidadKylooDto {
  @IsString()
  @MaxLength(80)
  clientName: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MCP_CONNECTION_MAX_ORGS)
  @IsUUID('all', { each: true })
  orgIds: string[];

  @IsUUID()
  activeOrgId: string;
}

interface OrgDeBilling {
  id: string;
  name: string | null;
  kind: string;
}

/**
 * Lo que Kyloo Accounts necesita de Praxis para conectar un cliente de IA
 * (docs/PLAN-OAUTH-KYLOO.md): decirle a la persona qué organizaciones puede
 * ofrecer y guardar la elección.
 *
 * ⚠️ **No están detrás de `JwtGuard`** (Accounts no tiene sesión de Praxis) sino
 * de `KylooInternalGuard`, que firma con un secreto compartido. Y la identidad
 * que llega —`sub` y `email`— sale de Accounts **ya verificada**: este
 * controlador la traduce a una cuenta de Praxis, no la vuelve a comprobar.
 */
@ApiExcludeController()
@SkipThrottle()
@UseGuards(KylooInternalGuard)
@Controller('internal/kyloo')
export class KylooInternalController {
  constructor(
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
    @Inject('BILLING_SERVICE') private readonly billingClient: ClientProxy,
    private readonly access: McpAccessService,
  ) {}

  private async persona(dto: IdentidadKylooDto): Promise<string> {
    const encontrada = await firstValueFrom(
      this.credentialsClient.send<{ userId: string } | null>(
        { cmd: 'mcp_conn_identify' },
        { sub: dto.sub, email: dto.email },
      ),
    ).catch(() => null);
    if (!encontrada) {
      throw new NotFoundException({
        code: 'NO_PRAXIS_ACCOUNT',
        message:
          'No hay una cuenta de Praxis para este correo. Entra primero en Praxis con tu cuenta de Kyloo.',
      });
    }
    return encontrada.userId;
  }

  /** Cuáles se pueden ofrecer: aquellas en las que el MCP se puede usar, con el porqué de las demás. */
  private async disponibles(userId: string) {
    const orgs = await firstValueFrom(
      this.billingClient.send<OrgDeBilling[]>({ cmd: 'billing_orgs_of' }, { userId }),
    ).catch(() => [] as OrgDeBilling[]);

    return Promise.all(
      (Array.isArray(orgs) ? orgs : []).map(async (o) => {
        try {
          await this.access.exigirOrganizacionUsable(userId, o.id);
          return { id: o.id, name: o.name, personal: o.kind === 'PERSONAL', disponible: true };
        } catch (error) {
          const motivo =
            error instanceof McpAccessError ? error.message : 'No se puede usar ahora mismo.';
          return {
            id: o.id,
            name: o.name,
            personal: o.kind === 'PERSONAL',
            disponible: false,
            motivo,
          };
        }
      }),
    );
  }

  @Post('organizations')
  @HttpCode(HttpStatus.OK)
  async organizaciones(@Body() dto: IdentidadKylooDto) {
    const userId = await this.persona(dto);
    const [organizaciones, existentes] = await Promise.all([
      this.disponibles(userId),
      firstValueFrom(
        this.credentialsClient.send<McpConnectionView[]>({ cmd: 'mcp_conn_list' }, { userId }),
      ).catch(() => [] as McpConnectionView[]),
    ]);
    const actual = existentes.find((c) => c.clientId === dto.clientId && !c.revokedAt);
    return {
      organizaciones,
      /* Reconectar el mismo cliente parte de lo que ya tenía, no de cero. */
      actual: actual
        ? { allowedOrgIds: actual.allowedOrgIds, activeOrgId: actual.activeOrgId }
        : null,
    };
  }

  @Post('connections')
  @HttpCode(HttpStatus.OK)
  async guardar(@Body() dto: GuardarConexionDto) {
    const userId = await this.persona(dto);
    const orgIds = [...new Set(dto.orgIds)];
    if (!orgIds.includes(dto.activeOrgId)) {
      throw new BadRequestException('La organización activa tiene que estar entre las elegidas.');
    }

    /* Todas las elegidas tienen que ser suyas Y usables: la lista que vio la
       persona la armó el navegador, y el navegador no es de fiar. */
    const buenas = new Set(
      (await this.disponibles(userId)).filter((o) => o.disponible).map((o) => o.id),
    );
    if (!orgIds.every((id) => buenas.has(id))) {
      throw new BadRequestException(
        'Alguna de las organizaciones elegidas no existe o no permite conectar agentes.',
      );
    }

    const conexion = await firstValueFrom(
      this.credentialsClient.send<McpConnectionView>(
        { cmd: 'mcp_conn_save' },
        {
          userId,
          kylooSub: dto.sub,
          clientId: dto.clientId,
          clientName: dto.clientName,
          allowedOrgIds: orgIds,
          activeOrgId: dto.activeOrgId,
        },
      ),
    );
    return { connectionId: conexion.id };
  }
}
