import {
  BadGatewayException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { McpAccessError } from './mcp-errors';

/** Lo que Praxis lee de un token de acceso emitido por Kyloo Accounts. */
export interface TokenOAuth {
  sub: string;
  /** El id de la fila `McpConnection`, que el servidor de autorización puso al consentir. */
  connectionId: string;
  scope: string;
}

/** Lo que Kyloo dice de quien llega al paso de conexión, en un token de un solo uso. */
export interface ConnectClaims {
  sub: string;
  email: string;
  clientId: string;
  clientName: string;
  connectId: string;
  /** A dónde devolver a la persona para que la autorización continúe. */
  returnUrl: string;
}

/** Un evento de identidad que Kyloo entrega con reintentos. Puede llegar más de una vez. */
export interface EventClaims {
  event: string;
  sub: string;
  email: string;
  id: string;
}

type TokenUse = 'connect' | 'event';

/** Se aceptan las dos mientras sigan vivos los refresh tokens emitidos con el nombre anterior. */
const CONNECTION_CLAIMS = ['connection_id', 'praxis_connection'] as const;

const COMPLETE_TIMEOUT_MS = 8000;

/**
 * Habla con Kyloo Accounts: verifica lo que firma y cierra el paso de conexión.
 *
 * Praxis es aquí un **servidor de recursos**: no emite nada, solo comprueba que el token lo firmó
 * Accounts y que va dirigido a él (docs/PLAN-OAUTH-KYLOO.md).
 *
 * ## Qué se comprueba, y por qué
 *
 * - **Firma** contra el JWKS de Accounts.
 * - **`iss`** igual al emisor configurado.
 * - **`aud`**. En un token de acceso, la dirección pública de este MCP (RFC 8707): impide que un
 *   token pedido para otro recurso —o el `id_token` de otra aplicación de Kyloo— abra el MCP. En
 *   los del paso de conexión y de eventos, nuestro `client_id`: son para nosotros y para nadie más.
 * - **`token_use`** en los dos últimos, para que un token de un tipo no sirva como el otro.
 * - **`exp`**, por la librería.
 *
 * Que un token de acceso sea válido **no** concede acceso: la conexión se mira en cada llamada
 * (`mcp_conn_session`), y es ahí donde se revoca.
 */
@Injectable()
export class KylooOAuthService {
  private readonly log = new Logger(KylooOAuthService.name);
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: ConfigService) {}

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

  private get clientId(): string {
    return String(this.config.get('KYLOO_CLIENT_ID') ?? '');
  }

  /** Las claves de Accounts. Un fallo de red no se queda: se reintenta con la siguiente llamada. */
  private keys() {
    this.jwks ??= createRemoteJWKSet(new URL(`${this.issuer}/jwks`), {
      cooldownDuration: 30_000,
      cacheMaxAge: 600_000,
    });
    return this.jwks;
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
      const { payload } = await jwtVerify(token, this.keys(), {
        issuer: this.issuer,
        audience: this.recurso,
      });
      const connectionId = CONNECTION_CLAIMS.map((name) => payload[name]).find(
        (value) => typeof value === 'string',
      );
      if (typeof payload.sub !== 'string' || typeof connectionId !== 'string') {
        throw new Error('faltan sub o connection_id');
      }
      return {
        sub: payload.sub,
        connectionId,
        scope: typeof payload.scope === 'string' ? payload.scope : '',
      };
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

  /** Verifica un token dirigido a esta aplicación (no al MCP) y devuelve sus claims. */
  private async verifyOwnToken(token: string, use: TokenUse): Promise<Record<string, unknown>> {
    if (!this.connectEnabled)
      throw new ServiceUnavailableException('La integración con Kyloo no está activa.');
    try {
      const { payload } = await jwtVerify(token, this.keys(), {
        issuer: this.issuer,
        audience: this.clientId,
      });
      if (payload.token_use !== use) throw new Error(`token_use ${String(payload.token_use)}`);
      return payload;
    } catch (error) {
      this.log.warn(`Token ${use} de Kyloo rechazado: ${String(error).slice(0, 160)}`);
      throw new UnauthorizedException();
    }
  }

  async verifyConnectToken(token: string): Promise<ConnectClaims> {
    const claims = await this.verifyOwnToken(token, 'connect');
    const text = (name: string) =>
      typeof claims[name] === 'string' ? (claims[name] as string) : '';
    const connect: ConnectClaims = {
      sub: text('sub'),
      email: text('email').toLowerCase(),
      clientId: text('client_id'),
      clientName: text('client_name'),
      connectId: text('connect_id'),
      returnUrl: text('return_url'),
    };
    if (claims.email_verified !== true || Object.values(connect).some((value) => !value)) {
      throw new UnauthorizedException();
    }
    /* La firma ya garantiza que lo escribió Kyloo; esto es por si algún día firma otra cosa. */
    if (new URL(connect.returnUrl).origin !== new URL(this.issuer).origin) {
      throw new UnauthorizedException();
    }
    return connect;
  }

  async verifyEventToken(token: string): Promise<EventClaims> {
    const claims = await this.verifyOwnToken(token, 'event');
    const text = (name: string) =>
      typeof claims[name] === 'string' ? (claims[name] as string) : '';
    const event: EventClaims = {
      event: text('event'),
      sub: text('sub'),
      email: text('email').toLowerCase(),
      id: text('jti'),
    };
    if (Object.values(event).some((value) => !value)) throw new UnauthorizedException();
    return event;
  }

  /**
   * Cierra el paso de conexión: le dice a Kyloo cuál es nuestra referencia, con las mismas
   * credenciales con las que canjeamos tokens. Cada `connectId` sirve una sola vez.
   */
  async completeConnection(connectId: string, referenceId: string): Promise<void> {
    if (!this.connectEnabled)
      throw new ServiceUnavailableException('La integración con Kyloo no está activa.');
    const basic = Buffer.from(
      `${this.clientId}:${String(this.config.get('KYLOO_CLIENT_SECRET'))}`,
    ).toString('base64');
    let response: Response;
    try {
      response = await fetch(`${new URL(this.issuer).origin}/api/connect/complete`, {
        method: 'POST',
        headers: { authorization: `Basic ${basic}`, 'content-type': 'application/json' },
        body: JSON.stringify({ connect_id: connectId, reference_id: referenceId }),
        signal: AbortSignal.timeout(COMPLETE_TIMEOUT_MS),
      });
    } catch (error) {
      this.log.error(`Kyloo no respondió al cerrar el paso de conexión: ${String(error)}`);
      throw new BadGatewayException('Kyloo Accounts no responde ahora mismo.');
    }
    if (!response.ok) {
      this.log.warn(`Kyloo rechazó cerrar el paso de conexión: ${response.status}`);
      throw new BadGatewayException('Kyloo Accounts rechazó la conexión. Vuelve a intentarlo.');
    }
  }
}
