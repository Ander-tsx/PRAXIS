import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiExcludeController } from '@nestjs/swagger';
import { MCP_CONNECTION_MAX_ORGS, type McpConnectionView } from '@praxis/contracts';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, IsUUID, MaxLength } from 'class-validator';
import { firstValueFrom } from 'rxjs';
import { type ConnectClaims, KylooOAuthService } from './kyloo-oauth.service';
import { McpAccessError, McpAccessService } from './mcp-access.service';

/** El token del paso de conexión o del evento: es lo único que se pide, y lo único que se cree. */
class TokenDto {
  @IsString()
  @MaxLength(4000)
  token: string;
}

class SaveConnectionDto extends TokenDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MCP_CONNECTION_MAX_ORGS)
  @IsUUID('all', { each: true })
  orgIds: string[];

  @IsUUID()
  activeOrgId: string;
}

interface OrgOfBilling {
  id: string;
  name: string | null;
  kind: string;
}

/** Eventos tras los cuales hay que cerrar todo lo que esa persona tenía abierto. */
const REVOKING_EVENTS = new Set(['user.credentials_changed', 'user.suspended', 'user.deleted']);

/**
 * Lo que Kyloo Accounts necesita de Praxis (docs/PLAN-OAUTH-KYLOO.md): el paso de conexión de un
 * cliente de IA —qué organizaciones puede ver— y los eventos de identidad.
 *
 * ⚠️ **No están detrás de `JwtGuard`** (Accounts no tiene sesión de Praxis) y tampoco de un secreto
 * compartido: lo que se cree es **un token que Kyloo firmó**, verificado con sus claves públicas.
 * La identidad sale de él y nunca del cuerpo: el navegador dice qué organizaciones quiere, no
 * quién es. Un token dura 5 minutos, va dirigido solo a Praxis y dice para qué sirve (`token_use`).
 */
@ApiExcludeController()
@Controller('internal/kyloo')
export class KylooInternalController {
  constructor(
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
    @Inject('BILLING_SERVICE') private readonly billingClient: ClientProxy,
    private readonly access: McpAccessService,
    private readonly kyloo: KylooOAuthService,
  ) {}

  private async userIdOf(claims: ConnectClaims): Promise<string> {
    const found = await firstValueFrom(
      this.credentialsClient.send<{ userId: string } | null>(
        { cmd: 'mcp_conn_identify' },
        { sub: claims.sub, email: claims.email },
      ),
    ).catch(() => null);
    if (!found) {
      throw new NotFoundException({
        code: 'NO_PRAXIS_ACCOUNT',
        message:
          'No hay una cuenta de Praxis para este correo. Entra primero en Praxis con tu cuenta de Kyloo.',
      });
    }
    return found.userId;
  }

  /** Cuáles se pueden ofrecer: aquellas en las que el MCP se puede usar, con el porqué de las demás. */
  private async availableOrgs(userId: string) {
    const orgs = await firstValueFrom(
      this.billingClient.send<OrgOfBilling[]>({ cmd: 'billing_orgs_of' }, { userId }),
    ).catch(() => [] as OrgOfBilling[]);

    return Promise.all(
      (Array.isArray(orgs) ? orgs : []).map(async (org) => {
        const base = { id: org.id, name: org.name, personal: org.kind === 'PERSONAL' };
        try {
          await this.access.exigirOrganizacionUsable(userId, org.id);
          return { ...base, available: true };
        } catch (error) {
          const reason =
            error instanceof McpAccessError ? error.message : 'No se puede usar ahora mismo.';
          return { ...base, available: false, reason };
        }
      }),
    );
  }

  @Post('organizations')
  @HttpCode(HttpStatus.OK)
  async organizations(@Body() dto: TokenDto) {
    const claims = await this.kyloo.verifyConnectToken(dto.token);
    const userId = await this.userIdOf(claims);
    const [organizations, existing] = await Promise.all([
      this.availableOrgs(userId),
      firstValueFrom(
        this.credentialsClient.send<McpConnectionView[]>({ cmd: 'mcp_conn_list' }, { userId }),
      ).catch(() => [] as McpConnectionView[]),
    ]);
    const current = existing.find((c) => c.clientId === claims.clientId && !c.revokedAt);
    return {
      clientName: claims.clientName,
      organizations,
      /* Reconectar el mismo cliente parte de lo que ya tenía, no de cero. */
      current: current
        ? { allowedOrgIds: current.allowedOrgIds, activeOrgId: current.activeOrgId }
        : null,
    };
  }

  /** Guarda la elección, se la comunica a Kyloo y devuelve a dónde seguir. */
  @Post('connections')
  @HttpCode(HttpStatus.OK)
  async save(@Body() dto: SaveConnectionDto) {
    const claims = await this.kyloo.verifyConnectToken(dto.token);
    const userId = await this.userIdOf(claims);
    const orgIds = [...new Set(dto.orgIds)];
    if (!orgIds.includes(dto.activeOrgId)) {
      throw new BadRequestException('La organización activa tiene que estar entre las elegidas.');
    }

    /* Todas las elegidas tienen que ser suyas Y usables: la lista que vio la
       persona la armó el navegador, y el navegador no es de fiar. */
    const usable = new Set(
      (await this.availableOrgs(userId)).filter((org) => org.available).map((org) => org.id),
    );
    if (!orgIds.every((id) => usable.has(id))) {
      throw new BadRequestException(
        'Alguna de las organizaciones elegidas no existe o no permite conectar agentes.',
      );
    }

    const connection = await firstValueFrom(
      this.credentialsClient.send<McpConnectionView>(
        { cmd: 'mcp_conn_save' },
        {
          userId,
          kylooSub: claims.sub,
          clientId: claims.clientId,
          /* El nombre sale del token, que lo tomó de la base de Kyloo: lo que se guarda aquí y se
             enseña luego en Integraciones no puede ser lo que el navegador quiera. */
          clientName: claims.clientName.slice(0, 80),
          allowedOrgIds: orgIds,
          activeOrgId: dto.activeOrgId,
        },
      ),
    );
    await this.kyloo.completeConnection(claims.connectId, connection.id);
    return { returnUrl: claims.returnUrl };
  }

  /**
   * Un evento de identidad. Kyloo reintenta hasta que respondemos 200, así que el mismo evento
   * puede llegar más de una vez: cerrar sesiones es idempotente. Los eventos que no conocemos
   * se reconocen igual, para que no se reintenten sin fin.
   */
  @Post('events')
  @HttpCode(HttpStatus.OK)
  async event(@Body() dto: TokenDto) {
    const event = await this.kyloo.verifyEventToken(dto.token);
    if (REVOKING_EVENTS.has(event.event)) {
      await firstValueFrom(
        this.credentialsClient.send<{ revocadas: boolean }>(
          { cmd: 'auth_revoke_all_of' },
          { sub: event.sub, email: event.email },
        ),
      );
    }
    if (event.event === 'user.updated') {
      await firstValueFrom(
        this.credentialsClient.send<{ actualizado: boolean }>(
          { cmd: 'auth_kyloo_email_changed' },
          { sub: event.sub, email: event.email },
        ),
      );
    }
    return { ok: true };
  }
}
