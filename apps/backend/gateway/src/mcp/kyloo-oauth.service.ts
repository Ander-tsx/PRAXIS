import {
  type AccessTokenClaims,
  type ConnectClaims,
  type EventClaims,
  type Kyloo,
  KylooError,
  type KylooOptions,
  createKyloo,
} from '@kyloo/auth';
import {
  BadGatewayException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { McpAccessError } from './mcp-errors';

export type { ConnectClaims, EventClaims };

/** Lo que Praxis lee de un token de acceso emitido por Kyloo Accounts. */
export interface TokenOAuth {
  sub: string;
  /** El id de la fila `McpConnection`, que el servidor de autorización puso al consentir. */
  connectionId: string;
  scope: string;
}

/** Solo las pruebas sustituyen las claves de Kyloo o el `fetch` con el que se le habla. */
export const KYLOO_CLIENT_OPTIONS = 'KYLOO_CLIENT_OPTIONS';

/**
 * Habla con Kyloo Accounts a través de `@kyloo/auth`: verifica lo que firma y cierra el paso de
 * conexión. Esta clase solo traduce la configuración de Praxis y los errores del SDK a los de Nest.
 *
 * Praxis es aquí un **servidor de recursos**: no emite nada, solo comprueba que el token lo firmó
 * Accounts y que va dirigido a él (docs/PLAN-OAUTH-KYLOO.md). Lo que el SDK comprueba, y por qué:
 *
 * - **Firma** contra el JWKS de Accounts, **`iss`** y **`exp`**.
 * - **`aud`**. En un token de acceso, la dirección pública de este MCP (RFC 8707): impide que un
 *   token pedido para otro recurso —o el `id_token` de otra aplicación de Kyloo— abra el MCP. En
 *   los del paso de conexión y de eventos, nuestro `client_id`: son para nosotros y para nadie más.
 * - **`token_use`** en los dos últimos, para que un token de un tipo no sirva como el otro.
 *
 * Que un token de acceso sea válido **no** concede acceso: la conexión se mira en cada llamada
 * (`mcp_conn_session`), y es ahí donde se revoca.
 */
@Injectable()
export class KylooOAuthService {
  private readonly log = new Logger(KylooOAuthService.name);
  private client?: Kyloo;

  constructor(
    private readonly config: ConfigService,
    @Optional()
    @Inject(KYLOO_CLIENT_OPTIONS)
    private readonly overrides?: Partial<KylooOptions>,
  ) {}

  /** ¿Está configurado el servidor de autorización? Sin él, solo tokens personales. */
  get activo(): boolean {
    return Boolean(this.config.get('KYLOO_ISSUER') && this.config.get('MCP_RESOURCE_URL'));
  }

  /** ¿Está configurado el paso de conexión y la recepción de eventos? */
  get connectEnabled(): boolean {
    return Boolean(
      this.config.get('KYLOO_ISSUER') &&
        this.config.get('KYLOO_CLIENT_ID') &&
        this.config.get('KYLOO_CLIENT_SECRET'),
    );
  }

  get issuer(): string {
    return String(this.config.get('KYLOO_ISSUER') ?? '').replace(/\/$/, '');
  }

  get recurso(): string {
    return String(this.config.get('MCP_RESOURCE_URL') ?? '');
  }

  /** Se crea al primer uso: sin configuración no hay cliente, y el resto de Praxis arranca igual. */
  private kyloo(): Kyloo {
    this.client ??= createKyloo({
      issuer: this.issuer,
      clientId: String(this.config.get('KYLOO_CLIENT_ID') ?? ''),
      clientSecret: String(this.config.get('KYLOO_CLIENT_SECRET') ?? ''),
      resource: this.recurso,
      ...this.overrides,
    });
    return this.client;
  }

  async verificar(token: string): Promise<TokenOAuth> {
    if (!this.activo) {
      throw new McpAccessError(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Este servidor solo admite tokens personales (prx_…).',
      );
    }

    try {
      const claims: AccessTokenClaims = await this.kyloo().verifyAccessToken(token);
      if (!claims.connectionId) throw new KylooError('invalid_token', 'Falta connection_id.');
      return { sub: claims.sub, connectionId: claims.connectionId, scope: claims.scopes.join(' ') };
    } catch (error) {
      /* El motivo concreto se queda en el registro; hacia fuera, siempre lo mismo. */
      this.log.warn(`Token OAuth rechazado: ${String(error).slice(0, 160)}`);
      throw new McpAccessError(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'El token no vale: está caducado, es de otra aplicación o no lo emitió Kyloo Accounts.',
      );
    }
  }

  async verifyConnectToken(token: string): Promise<ConnectClaims> {
    this.requireConnect();
    try {
      return await this.kyloo().verifyConnectToken(token);
    } catch (error) {
      this.log.warn(`Token connect de Kyloo rechazado: ${String(error).slice(0, 160)}`);
      throw new UnauthorizedException();
    }
  }

  async verifyEventToken(token: string): Promise<EventClaims> {
    this.requireConnect();
    try {
      return await this.kyloo().verifyEventToken(token);
    } catch (error) {
      this.log.warn(`Token event de Kyloo rechazado: ${String(error).slice(0, 160)}`);
      throw new UnauthorizedException();
    }
  }

  /** Cierra el paso de conexión con nuestra referencia. Cada `connectId` sirve una sola vez. */
  async completeConnection(connectId: string, referenceId: string): Promise<void> {
    this.requireConnect();
    try {
      await this.kyloo().completeConnection({ connectId, referenceId });
    } catch (error) {
      if (error instanceof KylooError && error.code === 'rejected') {
        this.log.warn(`Kyloo rechazó cerrar el paso de conexión: ${error.message}`);
        throw new BadGatewayException('Kyloo Accounts rechazó la conexión. Vuelve a intentarlo.');
      }
      this.log.error(`Kyloo no respondió al cerrar el paso de conexión: ${String(error)}`);
      throw new BadGatewayException('Kyloo Accounts no responde ahora mismo.');
    }
  }

  private requireConnect(): void {
    if (!this.connectEnabled) {
      throw new ServiceUnavailableException('La integración con Kyloo no está activa.');
    }
  }
}
