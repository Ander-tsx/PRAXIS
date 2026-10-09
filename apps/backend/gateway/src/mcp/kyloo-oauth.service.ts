import { HttpStatus, Injectable, Logger } from '@nestjs/common';
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

/**
 * Verifica los tokens de acceso OAuth de Kyloo Accounts (docs/PLAN-OAUTH-KYLOO.md).
 *
 * Praxis es aquí un **servidor de recursos**: no emite nada, solo comprueba que
 * el token lo firmó Accounts y que va dirigido a él.
 *
 * ## Qué se comprueba, y por qué
 *
 * - **Firma** contra el JWKS de Accounts.
 * - **`iss`** igual al emisor configurado.
 * - **`aud`** igual a la dirección pública de este MCP (RFC 8707). Es lo que
 *   impide que un token pedido para otro recurso —o el `id_token` de otra
 *   aplicación de Kyloo— abra el MCP de Praxis. Sin `aud`, un token válido de
 *   cualquier cliente de Kyloo serviría aquí.
 * - **`exp`**, por la librería.
 * - Que traiga `praxis_connection`: sin él no hay a qué organización ir.
 *
 * Que el token sea válido **no** concede acceso: la conexión se mira en cada
 * llamada (`mcp_conn_session`), y es ahí donde se revoca.
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

  get issuer(): string {
    return String(this.config.get('KYLOO_ISSUER') ?? '').replace(/\/$/, '');
  }

  get recurso(): string {
    return String(this.config.get('MCP_RESOURCE_URL') ?? '');
  }

  async verificar(token: string): Promise<TokenOAuth> {
    if (!this.activo) {
      throw new McpAccessError(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Este servidor solo admite tokens personales (prx_…).',
      );
    }
    this.jwks ??= createRemoteJWKSet(new URL(`${this.issuer}/jwks`), {
      /* Un fallo de red no se queda: se reintenta con la siguiente llamada. */
      cooldownDuration: 30_000,
      cacheMaxAge: 600_000,
    });

    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.recurso,
      });
      const connectionId = payload.praxis_connection;
      if (typeof payload.sub !== 'string' || typeof connectionId !== 'string') {
        throw new Error('faltan sub o praxis_connection');
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
}
