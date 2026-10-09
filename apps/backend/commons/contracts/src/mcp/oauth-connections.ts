import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsUUID } from 'class-validator';
import type { PatScope } from './personal-tokens';

/**
 * Las conexiones al MCP por OAuth (docs/PLAN-OAUTH-KYLOO.md).
 *
 * Un cliente de IA (ChatGPT, Claude web) se conecta con la identidad de Kyloo
 * Accounts en vez de con un token pegado en un archivo. Lo que lo distingue de
 * un token personal es la **organización**: no una, sino un conjunto elegido al
 * conectar y una activa que se cambia sin reconectar.
 */

/** Los scopes de OAuth en Kyloo Accounts, con prefijo para no chocar con los de OIDC. */
export const OAUTH_PRAXIS_SCOPES = ['praxis:read', 'praxis:write', 'praxis:delete'] as const;

/** Cuántas organizaciones puede llevar una conexión: el tope de las que tiene una persona. */
export const MCP_CONNECTION_MAX_ORGS = 20;

/** `praxis:write` → `write`: los mismos tres alcances que los tokens personales. */
export function patScopesFromOAuth(scope: string | string[] | undefined): PatScope[] {
  const dados = Array.isArray(scope) ? scope : (scope ?? '').split(/\s+/);
  const encontrados: PatScope[] = [];
  for (const [oauth, pat] of [
    ['praxis:read', 'read'],
    ['praxis:write', 'write'],
    ['praxis:delete', 'delete'],
  ] as const) {
    if (dados.includes(oauth)) encontrados.push(pat);
  }
  return encontrados;
}

/** Lo que ve la persona en Integraciones. Sin nada que sirva para entrar. */
export interface McpConnectionView {
  id: string;
  clientId: string;
  clientName: string;
  allowedOrgIds: string[];
  activeOrgId: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** Lo que devuelve credentials al abrir una llamada del MCP con un token OAuth. */
export interface ExchangedMcpConnection {
  connectionId: string;
  userId: string;
  activeOrgId: string;
  allowedOrgIds: string[];
  clientName: string;
  /** JWT `typ: access` de vida corta para llamar a la API, como el canje de un token personal. */
  accessToken: string;
}

export class UpdateMcpConnectionBodyDto {
  /** Las organizaciones a las que el cliente puede llegar. Hay que estar en cada una. */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MCP_CONNECTION_MAX_ORGS)
  @IsUUID('all', { each: true })
  allowedOrgIds?: string[];

  /** La organización con la que trabaja ahora. Tiene que estar entre las permitidas. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  activeOrgId?: string;
}
